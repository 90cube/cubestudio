"""
Depth Estimation Preprocessor for CUBE Studio
Enhanced depth estimation with MiDaS, DPT, and built-in fallbacks.
"""

import logging
from typing import Any, Dict, Optional
import numpy as np
import cv2

from .base_preprocessor import BasePreprocessor, ModelLoadError, ProcessingError

logger = logging.getLogger(__name__)


class DepthPreprocessor(BasePreprocessor):
    """Enhanced depth estimation preprocessor with multiple backends."""
    
    def __init__(self, processor_id: str, model_path: Optional[str] = None, **kwargs):
        """
        Initialize depth preprocessor.
        
        Args:
            processor_id: Processor identifier (e.g., 'midas_v21', 'dpt_hybrid', 'depth_builtin')
            model_path: Path to model weights file
        """
        super().__init__(processor_id, model_path, **kwargs)
        
        # Depth-specific settings
        self.model_type = self._determine_model_type()
        self.input_size = self._get_input_size()
        
    def _determine_model_type(self) -> str:
        """Determine model type from processor_id."""
        if 'midas' in self.processor_id.lower():
            return 'midas'
        elif 'dpt' in self.processor_id.lower():
            return 'dpt'
        else:
            return 'builtin'
    
    def _get_input_size(self) -> tuple:
        """Get required input size for the model."""
        if self.model_type == 'midas':
            return (384, 384)
        elif self.model_type == 'dpt':
            return (384, 384)
        else:
            return None  # No fixed size for builtin
    
    def get_default_parameters(self) -> Dict[str, Any]:
        """Get default parameters for depth processing."""
        return {
            'brightness': 0.0,        # -1.0 to 1.0
            'contrast': 1.0,          # 0.1 to 3.0
            'smoothing': 0.0,         # 0 to 10 (Gaussian blur sigma)
            'depth_strength': 1.0,    # 0.1 to 3.0
            'near_plane': 0.1,        # 0.01 to 10.0
            'far_plane': 100.0,       # 1.0 to 1000.0
            'invert_depth': False,    # True/False
            'normalize_depth': True   # True/False
        }
    
    def get_parameter_schema(self) -> Dict[str, Dict[str, Any]]:
        """Get parameter validation schema."""
        return {
            'brightness': {
                'type': 'float',
                'min': -1.0,
                'max': 1.0,
                'default': 0.0,
                'description': 'Brightness adjustment for depth map'
            },
            'contrast': {
                'type': 'float',
                'min': 0.1,
                'max': 3.0,
                'default': 1.0,
                'description': 'Contrast adjustment for depth map'
            },
            'smoothing': {
                'type': 'float',
                'min': 0.0,
                'max': 10.0,
                'default': 0.0,
                'description': 'Gaussian blur sigma for smoothing'
            },
            'depth_strength': {
                'type': 'float',
                'min': 0.1,
                'max': 3.0,
                'default': 1.0,
                'description': 'Enhance depth differences'
            },
            'near_plane': {
                'type': 'float',
                'min': 0.01,
                'max': 10.0,
                'default': 0.1,
                'description': 'Near clipping plane distance'
            },
            'far_plane': {
                'type': 'float',
                'min': 1.0,
                'max': 1000.0,
                'default': 100.0,
                'description': 'Far clipping plane distance'
            },
            'invert_depth': {
                'type': 'bool',
                'default': False,
                'description': 'Invert depth values'
            },
            'normalize_depth': {
                'type': 'bool',
                'default': True,
                'description': 'Normalize depth to 0-1 range'
            }
        }
    
    def _load_model_impl(self) -> Any:
        """Load the appropriate depth model."""
        try:
            if self.model_type in ['midas', 'dpt']:
                # Import proper MiDaS implementation from backend/midas_original
                from backend.midas_original.model_loader import load_model
                import torch
                
                logger.info(f"Loading {self.model_type} model from {self.model_path}")
                
                # Determine model type for the loader
                model_type_mapping = {
                    'midas': 'midas_v21_384',
                    'dpt': 'dpt_hybrid_384'
                }
                model_type = model_type_mapping.get(self.model_type, 'midas_v21_384')
                
                # Load model with proper parameters
                device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
                model, transform, net_w, net_h = load_model(device, self.model_path, model_type, optimize=False)
                
                # Store transform for later use
                self._transform = transform
                self._net_w = net_w
                self._net_h = net_h
                
                return model
            else:
                # No model needed for builtin
                return None
                
        except Exception as e:
            raise ModelLoadError(f"Failed to load {self.model_type} model: {e}")
    
    def preprocess_image(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Preprocess image for depth estimation."""
        # Base preprocessing
        image = super().preprocess_image(image, params)
        
        # Ensure we have the right format
        if len(image.shape) != 3 or image.shape[2] != 3:
            raise ProcessingError(f"Expected RGB image, got shape {image.shape}")
        
        return image
    
    def _process_impl(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Main depth processing implementation."""
        if self.model is None:
            raise ProcessingError("Model not loaded")
        
        try:
            if self.model_type in ['midas', 'dpt']:
                return self._process_neural_depth(image, params)
            else:
                return self._process_builtin_depth(image, params)
                
        except Exception as e:
            raise ProcessingError(f"Depth processing failed: {e}")
    
    def _process_neural_depth(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Process depth using neural network model."""
        try:
            import torch
            
            # Use the stored transform from model loading
            if not hasattr(self, '_transform'):
                raise ProcessingError("Model transform not available")
            
            # Apply MiDaS preprocessing transform
            img_input = self._transform({"image": image / 255.0})["image"]
            
            # Move to device and run inference
            with torch.no_grad():
                img_input = torch.from_numpy(img_input).to(self.device).unsqueeze(0)
                
                # Handle different model architectures
                if hasattr(self.model, 'forward'):
                    depth_prediction = self.model.forward(img_input)
                else:
                    depth_prediction = self.model(img_input)
                
                # Interpolate to original size
                depth_prediction = torch.nn.functional.interpolate(
                    depth_prediction.unsqueeze(1),
                    size=(image.shape[0], image.shape[1]),
                    mode="bicubic",
                    align_corners=False,
                ).squeeze()
                
                # Convert to numpy
                if hasattr(depth_prediction, 'cpu'):
                    depth_numpy = depth_prediction.cpu().numpy()
                else:
                    depth_numpy = depth_prediction.numpy()
            
            # Apply post-processing
            depth_numpy = self._postprocess_depth(depth_numpy, params)
            
            return depth_numpy
            
        except Exception as e:
            raise ProcessingError(f"Neural depth processing failed: {e}")
    
    def _process_builtin_depth(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Process depth using built-in algorithm."""
        # Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        else:
            gray = image
        
        # Simple depth from brightness and edge information
        depth = gray.astype(np.float32) / 255.0
        
        # Add edge information for depth cues
        edges = cv2.Canny(gray, 50, 150)
        edge_depth = edges.astype(np.float32) / 255.0
        
        # Combine brightness and edge information
        depth = depth * 0.8 + edge_depth * 0.2
        
        # Apply post-processing
        depth = self._postprocess_depth(depth, params)
        
        return depth
    
    def _postprocess_depth(self, depth: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Apply post-processing to depth map."""
        # Normalize to 0-1 range if requested
        if params.get('normalize_depth', True):
            if depth.max() > depth.min():
                depth = (depth - depth.min()) / (depth.max() - depth.min())
            else:
                depth = depth - depth.min()
        
        # Apply depth strength (enhance differences)
        depth_strength = params.get('depth_strength', 1.0)
        if depth_strength != 1.0:
            depth_center = 0.5
            depth = depth_center + (depth - depth_center) * depth_strength
        
        # Apply smoothing (Gaussian blur)
        smoothing = params.get('smoothing', 0.0)
        if smoothing > 0:
            kernel_size = max(1, int(smoothing * 2) + 1)
            if kernel_size % 2 == 0:
                kernel_size += 1  # Ensure odd kernel size
            depth = cv2.GaussianBlur(depth, (kernel_size, kernel_size), smoothing)
        
        # Apply contrast and brightness
        contrast = params.get('contrast', 1.0)
        brightness = params.get('brightness', 0.0)
        depth = depth * contrast + brightness
        
        # Invert depth if requested
        if params.get('invert_depth', False):
            depth = 1.0 - depth
        
        # Clamp to valid range
        depth = np.clip(depth, 0.0, 1.0)
        
        return depth
    
    def _fallback_process(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Fallback depth processing using built-in algorithm."""
        logger.info(f"Using fallback depth processing for {self.processor_id}")
        
        # Use the built-in depth algorithm
        return self._process_builtin_depth(image, params)
    
    def postprocess_image(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Post-process depth map to RGB format."""
        # Ensure image is in 0-1 range
        if image.max() > 1.0:
            image = image / 255.0
        
        # Convert single channel to RGB
        if len(image.shape) == 2:
            image = np.stack([image, image, image], axis=-1)
        
        # Convert to uint8
        image_uint8 = (image * 255).astype(np.uint8)
        
        return image_uint8


class MiDaSDepthPreprocessor(DepthPreprocessor):
    """Specialized MiDaS depth preprocessor."""
    
    def __init__(self, processor_id='midas_v21', model_path: Optional[str] = None, **kwargs):
        super().__init__(processor_id, model_path, **kwargs)


class DPTDepthPreprocessor(DepthPreprocessor):
    """Specialized DPT depth preprocessor."""
    
    def __init__(self, processor_id='dpt_hybrid', model_path: Optional[str] = None, **kwargs):
        super().__init__(processor_id, model_path, **kwargs)


class DPTBEiTLarge512Preprocessor(DepthPreprocessor):
    """Specialized DPT BEiT Large 512 depth preprocessor."""
    
    def __init__(self, processor_id='dpt_beit_large_512', model_path: Optional[str] = None, **kwargs):
        super().__init__(processor_id, model_path, **kwargs)


class BuiltinDepthPreprocessor(DepthPreprocessor):
    """Built-in depth estimation preprocessor."""
    
    def __init__(self, processor_id='depth_builtin', **kwargs):
        super().__init__(processor_id, None, **kwargs)