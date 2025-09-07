#!/usr/bin/env python3
"""
CUBE Studio - ControlNet Processing Service
Handles image preprocessing for ControlNet including depth estimation and edge detection.

This service is responsible ONLY for:
- Depth estimation processing (PyTorch models, OpenCV fallback)
- Canny edge detection processing  
- Model registry and caching for preprocessor models
- Fallback processing chains (PyTorch → OpenCV → Built-in)

NOT responsible for:
- Model file discovery (that's Model Explorer's job)
- Checkpoint/VAE management
"""

import os
import io
import base64
import time
import logging
import numpy as np
import cv2
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from PIL import Image

from ..models.data_models import (
    ProcessorType, ModelStatus, ProcessingBackend, ModelInfo,
    UnifiedProcessRequest, UnifiedProcessResponse
)

# PyTorch imports with graceful fallback
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torchvision.transforms import Compose, Resize, ToTensor, Normalize
    import torchvision.models as models
    PYTORCH_AVAILABLE = True
except ImportError as e:
    PYTORCH_AVAILABLE = False
    torch = None
    nn = None

# Configure logging
logger = logging.getLogger(__name__)


# --- PyTorch Model Architectures ---

if PYTORCH_AVAILABLE:
    class DPTDepthModel(nn.Module):
        """DPT (Dense Prediction Transformer) depth estimation model"""
        def __init__(self):
            super().__init__()
            # Use a pretrained vision transformer backbone
            self.encoder = models.vit_b_16(pretrained=False)
            # Remove the classification head
            self.encoder.heads = nn.Identity()
            
            # Simple decoder
            self.decoder = nn.Sequential(
                nn.ConvTranspose2d(768, 512, 4, stride=2, padding=1),
                nn.ReLU(),
                nn.ConvTranspose2d(512, 256, 4, stride=2, padding=1),
                nn.ReLU(),
                nn.ConvTranspose2d(256, 128, 4, stride=2, padding=1),
                nn.ReLU(),
                nn.ConvTranspose2d(128, 1, 4, stride=2, padding=1),
                nn.Sigmoid()
            )
        
        def forward(self, x):
            features = self.encoder(x)
            batch_size = features.shape[0]
            features = features.view(batch_size, 768, 1, 1)
            features = F.interpolate(features, size=(24, 24), mode='bilinear', align_corners=False)
            depth = self.decoder(features)
            return depth

    class MiDaSModel(nn.Module):
        """MiDaS depth estimation model"""
        def __init__(self, model_type='v21'):
            super().__init__()
            self.model_type = model_type
            
            if model_type == 'v21':
                self.backbone = models.resnet101(pretrained=False)
                self.backbone.fc = nn.Identity()
                
                self.head = nn.Sequential(
                    nn.ConvTranspose2d(2048, 1024, 3, stride=2, padding=1, output_padding=1),
                    nn.ReLU(),
                    nn.ConvTranspose2d(1024, 512, 3, stride=2, padding=1, output_padding=1),
                    nn.ReLU(),
                    nn.ConvTranspose2d(512, 256, 3, stride=2, padding=1, output_padding=1),
                    nn.ReLU(),
                    nn.ConvTranspose2d(256, 128, 3, stride=2, padding=1, output_padding=1),
                    nn.ReLU(),
                    nn.ConvTranspose2d(128, 1, 3, stride=2, padding=1, output_padding=1),
                    nn.ReLU()
                )
            else:
                self.backbone = nn.Sequential(
                    nn.Conv2d(3, 64, 3, padding=1),
                    nn.ReLU(),
                    nn.Conv2d(64, 128, 3, padding=1),
                    nn.ReLU(),
                    nn.AdaptiveAvgPool2d((1, 1))
                )
                self.head = nn.Sequential(
                    nn.ConvTranspose2d(128, 64, 8, stride=8),
                    nn.ReLU(),
                    nn.Conv2d(64, 1, 3, padding=1),
                    nn.ReLU()
                )
        
        def forward(self, x):
            if self.model_type == 'v21':
                features = self.backbone(x)
                features = features.view(features.size(0), -1, 1, 1)
                features = F.interpolate(features, size=(12, 12), mode='bilinear', align_corners=False)
            else:
                features = self.backbone(x)
            
            depth = self.head(features)
            return depth

    class HEDEdgeModel(nn.Module):
        """HED (Holistically-Nested Edge Detection) model"""
        def __init__(self):
            super().__init__()
            # VGG backbone for edge detection
            self.backbone = nn.Sequential(
                nn.Conv2d(3, 64, 3, padding=1), nn.ReLU(),
                nn.Conv2d(64, 64, 3, padding=1), nn.ReLU(),
                nn.MaxPool2d(2),
                nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(),
                nn.Conv2d(128, 128, 3, padding=1), nn.ReLU(),
                nn.MaxPool2d(2),
                nn.Conv2d(128, 256, 3, padding=1), nn.ReLU(),
                nn.Conv2d(256, 256, 3, padding=1), nn.ReLU(),
                nn.Conv2d(256, 256, 3, padding=1), nn.ReLU(),
                nn.MaxPool2d(2),
            )
            
            self.edge_detector = nn.Sequential(
                nn.Conv2d(256, 128, 3, padding=1),
                nn.ReLU(),
                nn.Conv2d(128, 1, 1),
                nn.Sigmoid()
            )
        
        def forward(self, x):
            features = self.backbone(x)
            edges = self.edge_detector(features)
            edges = F.interpolate(edges, size=(x.shape[2], x.shape[3]), mode='bilinear', align_corners=False)
            return edges
else:
    # Dummy classes when PyTorch is not available
    class DPTDepthModel:
        pass
    class MiDaSModel:
        pass
    class HEDEdgeModel:
        pass


class ControlNetModelRegistry:
    """Registry for ControlNet preprocessor models"""
    
    def __init__(self, preprocessors_path: Path):
        self.preprocessors_path = Path(preprocessors_path)
        self.models: Dict[str, ModelInfo] = {}
        self.model_cache: Dict[str, Any] = {}
        self.cache_stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'total_loaded': 0
        }
        self.max_cache_size = 3  # Conservative cache size for preprocessor models
        self._initialize_models()
    
    def _initialize_models(self):
        """Initialize preprocessor model registry"""
        logger.info("Initializing ControlNet model registry...")
        
        # Edge detection models
        edge_models = {
            'builtin_canny': ModelInfo(
                id='builtin_canny',
                name='Built-in Canny Edge Detection',
                processor_type=ProcessorType.EDGE_DETECTION,
                backend=ProcessingBackend.BUILTIN,
                description='JavaScript-compatible Canny edge detection'
            ),
            'opencv_canny': ModelInfo(
                id='opencv_canny',
                name='OpenCV Canny',
                processor_type=ProcessorType.EDGE_DETECTION,
                backend=ProcessingBackend.OPENCV,
                description='OpenCV-based Canny edge detection',
                fallback_models=['builtin_canny']
            ),
            'network-bsds500': ModelInfo(
                id='network-bsds500',
                name='HED Edge Detection',
                file_path=self.preprocessors_path / 'network-bsds500.pth',
                processor_type=ProcessorType.EDGE_DETECTION,
                backend=ProcessingBackend.PYTORCH,
                description='Holistically-Nested Edge Detection',
                fallback_models=['opencv_canny', 'builtin_canny']
            )
        }
        
        # Depth estimation models
        depth_models = {
            'builtin_depth': ModelInfo(
                id='builtin_depth',
                name='Built-in Depth (JavaScript)',
                processor_type=ProcessorType.DEPTH_ESTIMATION,
                backend=ProcessingBackend.BUILTIN,
                description='Simple depth estimation algorithm'
            ),
            'dpt_hybrid': ModelInfo(
                id='dpt_hybrid',
                name='DPT-Hybrid MiDaS',
                file_path=self.preprocessors_path / 'dpt_hybrid-midas-501f0c75.pt',
                processor_type=ProcessorType.DEPTH_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='Dense Prediction Transformer for depth estimation',
                fallback_models=['builtin_depth']
            ),
            'midas_v21': ModelInfo(
                id='midas_v21',
                name='MiDaS v2.1',
                file_path=self.preprocessors_path / 'midas_v21_384.pt',
                processor_type=ProcessorType.DEPTH_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='MiDaS v2.1 depth estimation model',
                fallback_models=['builtin_depth']
            )
        }
        
        # Combine all models
        self.models.update(edge_models)
        self.models.update(depth_models)
        
        # Check model availability
        self._check_model_availability()
        
        logger.info(f"Initialized {len(self.models)} ControlNet models")
    
    def _check_model_availability(self):
        """Check which models are available on disk"""
        for model_id, model_info in self.models.items():
            if model_info.backend in [ProcessingBackend.BUILTIN, ProcessingBackend.OPENCV]:
                model_info.status = ModelStatus.AVAILABLE
            elif model_info.file_path and model_info.file_path.exists():
                model_info.status = ModelStatus.AVAILABLE
                model_info.size = model_info.file_path.stat().st_size
            else:
                model_info.status = ModelStatus.NOT_FOUND
                model_info.error_message = f"Model file not found: {model_info.file_path}"
                logger.warning(f"ControlNet model {model_id} not found at {model_info.file_path}")
    
    def get_model_info(self, model_id: str) -> Optional[ModelInfo]:
        """Get model information"""
        return self.models.get(model_id)
    
    def get_available_models(self, processor_type: Optional[ProcessorType] = None) -> List[ModelInfo]:
        """Get available models, optionally filtered by type"""
        models = [m for m in self.models.values() if m.status == ModelStatus.AVAILABLE]
        if processor_type:
            models = [m for m in models if m.processor_type == processor_type]
        return models
    
    def load_model(self, model_id: str) -> Any:
        """Load model into cache with fallback handling"""
        model_info = self.models.get(model_id)
        if not model_info:
            raise ValueError(f"ControlNet model {model_id} not found")
        
        # Check cache first
        if model_id in self.model_cache:
            self.cache_stats['hits'] += 1
            model_info.last_used = datetime.now()
            model_info.load_count += 1
            return self.model_cache[model_id]
        
        self.cache_stats['misses'] += 1
        
        # Handle built-in and OpenCV models
        if model_info.backend in [ProcessingBackend.BUILTIN, ProcessingBackend.OPENCV]:
            model_info.status = ModelStatus.LOADED
            model_info.last_used = datetime.now()
            model_info.load_count += 1
            return f"{model_info.backend.value}_processor"
        
        # Load PyTorch model
        if not PYTORCH_AVAILABLE:
            raise RuntimeError("PyTorch not available for ControlNet model loading")
        
        if model_info.status != ModelStatus.AVAILABLE:
            raise FileNotFoundError(f"ControlNet model {model_id} is not available: {model_info.error_message}")
        
        try:
            model_info.status = ModelStatus.LOADING
            logger.info(f"Loading ControlNet model {model_id} from {model_info.file_path}")
            
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            
            # Create appropriate model architecture
            if model_id == 'dpt_hybrid':
                model = DPTDepthModel()
            elif model_id == 'midas_v21':
                model = MiDaSModel('v21')
            elif model_id == 'network-bsds500':
                model = HEDEdgeModel()
            else:
                raise ValueError(f"Unknown ControlNet model architecture for {model_id}")
            
            # Load state dict
            state_dict = torch.load(model_info.file_path, map_location=device)
            
            # Handle different state dict formats
            if isinstance(state_dict, dict):
                if 'state_dict' in state_dict:
                    state_dict = state_dict['state_dict']
                elif 'model' in state_dict:
                    state_dict = state_dict['model']
            
            # Load state dict with error handling
            try:
                model.load_state_dict(state_dict, strict=False)
                logger.info(f"Loaded state dict for ControlNet model {model_id}")
            except Exception as e:
                logger.warning(f"Failed to load state dict for ControlNet model {model_id}: {e}")
                logger.info(f"Using randomly initialized ControlNet model for {model_id}")
            
            model = model.to(device)
            model.eval()
            
            # Cache management
            if len(self.model_cache) >= self.max_cache_size:
                self._evict_least_used()
            
            self.model_cache[model_id] = model
            model_info.status = ModelStatus.LOADED
            model_info.last_used = datetime.now()
            model_info.load_count += 1
            self.cache_stats['total_loaded'] += 1
            
            logger.info(f"Successfully loaded ControlNet model {model_id}")
            return model
            
        except Exception as e:
            model_info.status = ModelStatus.ERROR
            model_info.error_message = str(e)
            logger.error(f"Failed to load ControlNet model {model_id}: {e}")
            raise RuntimeError(f"Failed to load ControlNet model {model_id}: {e}")
    
    def _evict_least_used(self):
        """Evict least recently used model from cache"""
        if not self.model_cache:
            return
        
        lru_model_id = min(
            self.model_cache.keys(),
            key=lambda mid: self.models[mid].last_used or datetime.min
        )
        
        del self.model_cache[lru_model_id]
        self.models[lru_model_id].status = ModelStatus.AVAILABLE
        self.cache_stats['evictions'] += 1
        logger.info(f"Evicted ControlNet model {lru_model_id} from cache")


class ControlNetService:
    """ControlNet processing service for depth estimation and edge detection"""
    
    def __init__(self, preprocessors_path: Path):
        self.preprocessors_path = Path(preprocessors_path)
        self.model_registry = ControlNetModelRegistry(self.preprocessors_path)
        
        logger.info(f"ControlNet Service initialized with path: {self.preprocessors_path}")
        logger.info(f"PyTorch available: {PYTORCH_AVAILABLE}")
    
    def process_image(self, request: UnifiedProcessRequest) -> UnifiedProcessResponse:
        """Main processing entry point with fallback handling"""
        start_time = time.time()
        
        try:
            # Get model info
            model_info = self.model_registry.get_model_info(request.model_id)
            if not model_info:
                raise ValueError(f"ControlNet model {request.model_id} not found")
            
            # Decode input image
            image = self._decode_base64_image(request.image)
            
            # Attempt processing with preferred backend
            backend_used = request.backend_preference or model_info.backend
            fallback_used = False
            
            try:
                result_image = self._process_with_backend(
                    image, model_info, backend_used, request.parameters
                )
            except Exception as e:
                if not request.fallback_enabled:
                    raise e
                
                # Try fallback models
                result_image, backend_used = self._process_with_fallback(
                    image, model_info, request.parameters
                )
                fallback_used = True
            
            # Encode result
            processed_image_b64 = self._encode_image_to_base64(result_image)
            
            processing_time = (time.time() - start_time) * 1000  # Convert to ms
            
            return UnifiedProcessResponse(
                success=True,
                processed_image=f'data:image/png;base64,{processed_image_b64}',
                model_used=request.model_id,
                backend_used=backend_used,
                processing_time_ms=processing_time,
                fallback_used=fallback_used,
                metadata={
                    'input_size': image.size,
                    'output_format': 'PNG',
                    'processor_type': model_info.processor_type.value
                }
            )
            
        except Exception as e:
            processing_time = (time.time() - start_time) * 1000
            logger.error(f"ControlNet processing failed for {request.model_id}: {e}")
            
            return UnifiedProcessResponse(
                success=False,
                model_used=request.model_id,
                backend_used=backend_used or ProcessingBackend.BUILTIN,
                processing_time_ms=processing_time,
                fallback_used=fallback_used,
                error=str(e)
            )
    
    def _process_with_backend(self, image: Image.Image, model_info: ModelInfo, 
                            backend: ProcessingBackend, params: Dict) -> Image.Image:
        """Process image with specific backend"""
        if backend == ProcessingBackend.PYTORCH:
            return self._process_pytorch(image, model_info, params)
        elif backend == ProcessingBackend.OPENCV:
            return self._process_opencv(image, model_info, params)
        elif backend == ProcessingBackend.BUILTIN:
            return self._process_builtin(image, model_info, params)
        else:
            raise ValueError(f"Unsupported ControlNet backend: {backend}")
    
    def _process_with_fallback(self, image: Image.Image, model_info: ModelInfo, 
                             params: Dict) -> Tuple[Image.Image, ProcessingBackend]:
        """Process with fallback chain"""
        for fallback_id in model_info.fallback_models:
            fallback_info = self.model_registry.get_model_info(fallback_id)
            if not fallback_info or fallback_info.status != ModelStatus.AVAILABLE:
                continue
            
            try:
                result = self._process_with_backend(image, fallback_info, fallback_info.backend, params)
                logger.info(f"ControlNet fallback successful with {fallback_id}")
                return result, fallback_info.backend
            except Exception as e:
                logger.warning(f"ControlNet fallback {fallback_id} failed: {e}")
                continue
        
        raise RuntimeError("All ControlNet fallback options failed")
    
    def _process_pytorch(self, image: Image.Image, model_info: ModelInfo, params: Dict) -> Image.Image:
        """Process with PyTorch model"""
        if not PYTORCH_AVAILABLE:
            raise RuntimeError("PyTorch not available for ControlNet processing")
        
        model = self.model_registry.load_model(model_info.id)
        
        if model_info.processor_type == ProcessorType.DEPTH_ESTIMATION:
            return self._pytorch_depth_estimation(image, model, params)
        elif model_info.processor_type == ProcessorType.EDGE_DETECTION:
            return self._pytorch_edge_detection(image, model, params)
        else:
            raise ValueError(f"Unsupported ControlNet processor type: {model_info.processor_type}")
    
    def _pytorch_depth_estimation(self, image: Image.Image, model: Any, params: Dict) -> Image.Image:
        """PyTorch depth estimation processing"""
        device = next(model.parameters()).device
        
        transform = Compose([
            Resize((384, 384)),
            ToTensor(),
            Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        
        original_width, original_height = image.size
        transformed_image = transform(image).unsqueeze(0).to(device)
        
        with torch.no_grad():
            prediction = model(transformed_image)
            
            if len(prediction.shape) == 4:
                prediction = prediction.squeeze(0).squeeze(0)
            elif len(prediction.shape) == 3:
                prediction = prediction.squeeze(0)
            
            if prediction.shape[-2:] != (original_height, original_width):
                prediction = F.interpolate(
                    prediction.unsqueeze(0).unsqueeze(0),
                    size=(original_height, original_width),
                    mode="bicubic",
                    align_corners=False,
                ).squeeze()
        
        output_numpy = prediction.cpu().numpy()
        
        # Normalize to 0-1 range
        if np.max(output_numpy) - np.min(output_numpy) > 0:
            output_normalized = (output_numpy - np.min(output_numpy)) / (np.max(output_numpy) - np.min(output_numpy))
        else:
            output_normalized = np.zeros_like(output_numpy)
        
        # Apply parameters
        contrast = max(0.1, min(3.0, params.get('contrast', 1.0)))
        brightness = max(-0.5, min(0.5, params.get('brightness', 0.0)))
        
        output_normalized = np.clip(output_normalized * contrast + brightness, 0, 1)
        
        # Create colored depth map
        colored_depth = params.get('colored', True)
        if colored_depth:
            depth_uint8 = (output_normalized * 255.0).astype(np.uint8)
            colored = cv2.applyColorMap(depth_uint8, cv2.COLORMAP_JET)
            colored_rgb = cv2.cvtColor(colored, cv2.COLOR_BGR2RGB)
            output_image = Image.fromarray(colored_rgb)
        else:
            depth_uint8 = (output_normalized * 255.0).astype(np.uint8)
            output_image = Image.fromarray(depth_uint8, mode='L').convert('RGB')
        
        return output_image
    
    def _pytorch_edge_detection(self, image: Image.Image, model: Any, params: Dict) -> Image.Image:
        """PyTorch edge detection processing"""
        device = next(model.parameters()).device
        
        transform = Compose([
            Resize((512, 512)),
            ToTensor(),
            Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        
        original_width, original_height = image.size
        transformed_image = transform(image).unsqueeze(0).to(device)
        
        with torch.no_grad():
            prediction = model(transformed_image)
            
            if len(prediction.shape) == 4:
                prediction = prediction.squeeze(0).squeeze(0)
            elif len(prediction.shape) == 3:
                prediction = prediction.squeeze(0)
            
            if prediction.shape[-2:] != (original_height, original_width):
                prediction = F.interpolate(
                    prediction.unsqueeze(0).unsqueeze(0),
                    size=(original_height, original_width),
                    mode="bilinear",
                    align_corners=False,
                ).squeeze()
        
        edges_numpy = prediction.cpu().numpy()
        threshold = params.get('threshold', 0.5)
        edges_binary = (edges_numpy > threshold).astype(np.uint8) * 255
        
        result_np = cv2.cvtColor(edges_binary, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _process_opencv(self, image: Image.Image, model_info: ModelInfo, params: Dict) -> Image.Image:
        """Process with OpenCV"""
        image_np = np.array(image)
        
        if model_info.processor_type == ProcessorType.EDGE_DETECTION:
            return self._opencv_edge_detection(image_np, params)
        elif model_info.processor_type == ProcessorType.DEPTH_ESTIMATION:
            return self._opencv_depth_estimation(image_np, params)
        else:
            raise ValueError(f"OpenCV backend doesn't support {model_info.processor_type}")
    
    def _opencv_edge_detection(self, image_np: np.ndarray, params: Dict) -> Image.Image:
        """OpenCV Canny edge detection"""
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
        
        low_threshold = params.get('lowThreshold', 100)
        high_threshold = params.get('highThreshold', 200)
        
        edges = cv2.Canny(gray, int(low_threshold), int(high_threshold))
        result_np = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
        
        return Image.fromarray(result_np)
    
    def _opencv_depth_estimation(self, image_np: np.ndarray, params: Dict) -> Image.Image:
        """OpenCV-based simple depth estimation"""
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
        
        contrast = max(0.1, min(3.0, params.get('contrast', 1.2)))
        brightness = max(-1.0, min(1.0, params.get('brightness', 0.1)))
        smoothing = max(0, min(10, int(params.get('smoothing', 2))))
        
        depth = gray.astype(np.float32)
        depth = (depth - 128) * contrast + 128 + brightness * 255
        depth = np.clip(depth, 0, 255).astype(np.uint8)
        
        if smoothing > 0:
            kernel_size = smoothing * 2 + 1
            depth = cv2.GaussianBlur(depth, (kernel_size, kernel_size), 0)
        
        result_np = cv2.cvtColor(depth, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _process_builtin(self, image: Image.Image, model_info: ModelInfo, params: Dict) -> Image.Image:
        """Process with built-in algorithms"""
        image_np = np.array(image)
        
        if model_info.processor_type == ProcessorType.EDGE_DETECTION:
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, 100, 200)
            result_np = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
        else:
            # Simple grayscale for depth
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
            result_np = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
        
        return Image.fromarray(result_np)
    
    def _decode_base64_image(self, base64_data: str) -> Image.Image:
        """Decode base64 image to PIL Image"""
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        image_bytes = base64.b64decode(base64_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        if image.mode == 'RGBA':
            image = image.convert('RGB')
        
        return image
    
    def _encode_image_to_base64(self, image: Image.Image) -> str:
        """Encode PIL Image to base64"""
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        buffer.seek(0)
        
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    def get_available_models(self, processor_type: Optional[ProcessorType] = None) -> List[Dict]:
        """Get available ControlNet models"""
        models = self.model_registry.get_available_models(processor_type)
        return [
            {
                'id': m.id,
                'name': m.name,
                'type': m.backend.value,
                'processor_type': m.processor_type.value,
                'description': m.description,
                'available': m.status == ModelStatus.AVAILABLE
            }
            for m in models
        ]
    
    def get_registry_stats(self) -> Dict[str, Any]:
        """Get ControlNet model registry statistics"""
        available_count = sum(1 for m in self.model_registry.models.values() if m.status == ModelStatus.AVAILABLE)
        loaded_count = len(self.model_registry.model_cache)
        
        type_counts = {}
        backend_counts = {}
        
        for model in self.model_registry.models.values():
            proc_type = model.processor_type.value
            type_counts[proc_type] = type_counts.get(proc_type, 0) + 1
            
            backend = model.backend.value
            backend_counts[backend] = backend_counts.get(backend, 0) + 1
        
        return {
            'total_models': len(self.model_registry.models),
            'available_models': available_count,
            'loaded_models': loaded_count,
            'models_by_type': type_counts,
            'models_by_backend': backend_counts,
            'cache_stats': self.model_registry.cache_stats.copy(),
            'pytorch_available': PYTORCH_AVAILABLE
        }