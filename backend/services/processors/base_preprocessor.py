"""
Base Preprocessor Class for CUBE Studio
Provides standardized interface, error handling, and fallback mechanisms for all preprocessors.
"""

import abc
import base64
import gc
import io
import logging
import time
from typing import Any, Dict, List, Optional, Union, Tuple
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# Configure logger
logger = logging.getLogger(__name__)

class PreprocessorError(Exception):
    """Custom exception for preprocessor-related errors"""
    pass

class ParameterValidationError(PreprocessorError):
    """Exception raised when parameter validation fails"""
    pass

class ModelLoadError(PreprocessorError):
    """Exception raised when model loading fails"""
    pass

class ProcessingError(PreprocessorError):
    """Exception raised during image processing"""
    pass


class BasePreprocessor(abc.ABC):
    """
    Abstract base class for all preprocessors in CUBE Studio.
    
    Provides standardized interface, parameter validation, error handling,
    fallback mechanisms, and resource management.
    """
    
    def __init__(self, 
                 processor_id: str,
                 model_path: Optional[str] = None,
                 device: Optional[str] = None,
                 cache_models: bool = True,
                 max_memory_mb: Optional[int] = None):
        """
        Initialize the preprocessor.
        
        Args:
            processor_id: Unique identifier for this processor
            model_path: Path to model file (optional)
            device: Device to use ('cpu', 'cuda', 'auto')
            cache_models: Whether to cache loaded models in memory
            max_memory_mb: Maximum memory usage in MB (None = unlimited)
        """
        self.processor_id = processor_id
        self.model_path = model_path
        self.cache_models = cache_models
        self.max_memory_mb = max_memory_mb
        
        # Device management
        self.device = self._setup_device(device)
        
        # Model state
        self.model = None
        self._model_loaded = False
        self._model_load_time = None
        
        # Statistics
        self.stats = {
            'total_processed': 0,
            'total_time': 0.0,
            'error_count': 0,
            'fallback_count': 0,
            'batch_count': 0
        }
        
        logger.info(f"Initialized {processor_id} preprocessor on {self.device}")
    
    def _setup_device(self, device: Optional[str]) -> str:
        """Set up processing device with fallback."""
        if device == 'auto' or device is None:
            try:
                import torch
                if torch.cuda.is_available():
                    return 'cuda'
            except ImportError:
                pass
            return 'cpu'
        return device
    
    @abc.abstractmethod
    def get_default_parameters(self) -> Dict[str, Any]:
        """
        Get default parameters for this preprocessor.
        
        Returns:
            Dictionary of parameter names to default values
        """
        pass
    
    @abc.abstractmethod
    def get_parameter_schema(self) -> Dict[str, Dict[str, Any]]:
        """
        Get parameter validation schema.
        
        Returns:
            Dictionary mapping parameter names to validation specs:
            {
                "param_name": {
                    "type": "float|int|bool|str",
                    "min": optional_min_value,
                    "max": optional_max_value,
                    "default": default_value,
                    "description": "parameter description"
                }
            }
        """
        pass
    
    def validate_parameters(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and normalize input parameters.
        
        Args:
            params: Input parameters dictionary
            
        Returns:
            Validated and normalized parameters dictionary
            
        Raises:
            ParameterValidationError: If validation fails
        """
        if not params:
            params = {}
            
        schema = self.get_parameter_schema()
        defaults = self.get_default_parameters()
        validated = {}
        
        # Start with defaults
        for param_name, default_value in defaults.items():
            validated[param_name] = default_value
        
        # Validate provided parameters
        for param_name, value in params.items():
            if param_name not in schema:
                logger.warning(f"Unknown parameter '{param_name}' for {self.processor_id}")
                continue
            
            spec = schema[param_name]
            param_type = spec.get('type', 'float')
            
            try:
                # Type conversion
                if param_type == 'float':
                    value = float(value)
                elif param_type == 'int':
                    value = int(value)
                elif param_type == 'bool':
                    value = bool(value) if not isinstance(value, str) else value.lower() in ('true', '1', 'yes', 'on')
                elif param_type == 'str':
                    value = str(value)
                
                # Range validation
                if param_type in ('float', 'int'):
                    if 'min' in spec and value < spec['min']:
                        raise ValueError(f"Value {value} below minimum {spec['min']}")
                    if 'max' in spec and value > spec['max']:
                        raise ValueError(f"Value {value} above maximum {spec['max']}")
                
                validated[param_name] = value
                
            except (ValueError, TypeError) as e:
                raise ParameterValidationError(f"Invalid parameter '{param_name}': {e}")
        
        return validated
    
    def load_model(self) -> bool:
        """
        Load the model if needed.
        
        Returns:
            True if model loaded successfully, False if fallback should be used
        """
        if self._model_loaded and self.model is not None:
            return True
        
        if not self.model_path or not Path(self.model_path).exists():
            logger.warning(f"Model path not available for {self.processor_id}")
            return False
        
        start_time = time.time()
        
        try:
            logger.info(f"Loading model for {self.processor_id} from {self.model_path}")
            self.model = self._load_model_impl()
            self._model_loaded = True
            self._model_load_time = time.time() - start_time
            
            logger.info(f"Model loaded for {self.processor_id} in {self._model_load_time:.3f}s")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load model for {self.processor_id}: {e}")
            self.stats['error_count'] += 1
            return False
    
    @abc.abstractmethod
    def _load_model_impl(self) -> Any:
        """
        Implementation-specific model loading.
        
        Returns:
            Loaded model object
            
        Raises:
            ModelLoadError: If model loading fails
        """
        pass
    
    def preprocess_image(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """
        Preprocess input image before main processing.
        
        Args:
            image: Input image as numpy array (RGB)
            params: Processing parameters
            
        Returns:
            Preprocessed image
        """
        # Default preprocessing - ensure RGB format and proper data type
        if len(image.shape) == 2:
            # Grayscale to RGB
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
        elif len(image.shape) == 3 and image.shape[2] == 4:
            # RGBA to RGB
            image = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)
        
        # Ensure uint8
        if image.dtype != np.uint8:
            image = np.clip(image * 255, 0, 255).astype(np.uint8)
        
        return image
    
    @abc.abstractmethod
    def _process_impl(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """
        Implementation-specific processing logic.
        
        Args:
            image: Preprocessed image as numpy array (RGB)
            params: Validated parameters
            
        Returns:
            Processed image as RGB numpy array
        """
        pass
    
    @abc.abstractmethod
    def _fallback_process(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """
        Fallback processing when main processing fails.
        
        Args:
            image: Input image as numpy array (RGB)
            params: Processing parameters
            
        Returns:
            Processed image using fallback method
        """
        pass
    
    def postprocess_image(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """
        Postprocess output image.
        
        Args:
            image: Processed image from main processing
            params: Processing parameters
            
        Returns:
            Final processed image
        """
        # Ensure output is RGB uint8
        if len(image.shape) == 2:
            image = np.stack([image, image, image], axis=-1)
        
        if image.dtype != np.uint8:
            if image.max() <= 1.0:
                image = (image * 255).astype(np.uint8)
            else:
                image = np.clip(image, 0, 255).astype(np.uint8)
        
        return image
    
    def process_single(self, image: np.ndarray, params: Optional[Dict[str, Any]] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Process a single image.
        
        Args:
            image: Input image as numpy array
            params: Processing parameters
            
        Returns:
            Tuple of (processed_image, processing_info)
        """
        start_time = time.time()
        fallback_used = False
        
        try:
            # Validate parameters
            validated_params = self.validate_parameters(params or {})
            
            # Preprocess image
            preprocessed_image = self.preprocess_image(image, validated_params)
            
            # Try main processing
            processed_image = None
            
            if self.load_model():
                try:
                    processed_image = self._process_impl(preprocessed_image, validated_params)
                except Exception as e:
                    logger.error(f"Main processing failed for {self.processor_id}: {e}")
                    self.stats['error_count'] += 1
            
            # Use fallback if main processing failed
            if processed_image is None:
                logger.info(f"Using fallback processing for {self.processor_id}")
                processed_image = self._fallback_process(preprocessed_image, validated_params)
                fallback_used = True
                self.stats['fallback_count'] += 1
            
            # Postprocess
            final_image = self.postprocess_image(processed_image, validated_params)
            
            # Update statistics
            processing_time = time.time() - start_time
            self.stats['total_processed'] += 1
            self.stats['total_time'] += processing_time
            
            # Processing info
            info = {
                'processing_time': processing_time,
                'fallback_used': fallback_used,
                'processor_id': self.processor_id,
                'device': self.device,
                'parameters_used': validated_params
            }
            
            return final_image, info
            
        except Exception as e:
            self.stats['error_count'] += 1
            logger.error(f"Processing failed for {self.processor_id}: {e}")
            raise ProcessingError(f"Processing failed: {e}")
    
    def process_batch(self, images: List[np.ndarray], params: Optional[Dict[str, Any]] = None) -> List[Tuple[np.ndarray, Dict[str, Any]]]:
        """
        Process a batch of images.
        
        Args:
            images: List of input images as numpy arrays
            params: Processing parameters (applied to all images)
            
        Returns:
            List of (processed_image, processing_info) tuples
        """
        start_time = time.time()
        results = []
        
        # Validate parameters once
        validated_params = self.validate_parameters(params or {})
        
        # Load model once if needed
        model_available = self.load_model()
        
        for i, image in enumerate(images):
            try:
                image_start = time.time()
                
                # Preprocess
                preprocessed_image = self.preprocess_image(image, validated_params)
                
                # Process
                processed_image = None
                fallback_used = False
                
                if model_available:
                    try:
                        processed_image = self._process_impl(preprocessed_image, validated_params)
                    except Exception as e:
                        logger.error(f"Batch processing failed for image {i}: {e}")
                        fallback_used = True
                
                if processed_image is None:
                    processed_image = self._fallback_process(preprocessed_image, validated_params)
                    fallback_used = True
                    self.stats['fallback_count'] += 1
                
                # Postprocess
                final_image = self.postprocess_image(processed_image, validated_params)
                
                # Info
                image_time = time.time() - image_start
                info = {
                    'processing_time': image_time,
                    'fallback_used': fallback_used,
                    'processor_id': self.processor_id,
                    'device': self.device,
                    'batch_index': i,
                    'parameters_used': validated_params
                }
                
                results.append((final_image, info))
                
            except Exception as e:
                logger.error(f"Failed to process image {i} in batch: {e}")
                self.stats['error_count'] += 1
                # Add error placeholder
                results.append((image, {'error': str(e), 'batch_index': i}))
        
        # Update batch statistics
        batch_time = time.time() - start_time
        self.stats['batch_count'] += 1
        self.stats['total_processed'] += len(images)
        self.stats['total_time'] += batch_time
        
        logger.info(f"Batch processing completed: {len(images)} images in {batch_time:.3f}s")
        
        return results
    
    def cleanup_memory(self):
        """Clean up memory and resources."""
        if hasattr(self, 'model') and self.model is not None:
            if hasattr(self.model, 'cpu'):
                self.model.cpu()
            
            if not self.cache_models:
                del self.model
                self.model = None
                self._model_loaded = False
        
        # Force garbage collection
        gc.collect()
        
        # CUDA cleanup if available
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics."""
        stats = self.stats.copy()
        stats['processor_id'] = self.processor_id
        stats['model_loaded'] = self._model_loaded
        stats['model_load_time'] = self._model_load_time
        stats['device'] = self.device
        
        if stats['total_processed'] > 0:
            stats['avg_processing_time'] = stats['total_time'] / stats['total_processed']
        else:
            stats['avg_processing_time'] = 0.0
            
        return stats
    
    @staticmethod
    def decode_base64_image(image_data: str) -> np.ndarray:
        """
        Efficiently decode base64 image data.
        
        Args:
            image_data: Base64 encoded image string (with or without data: prefix)
            
        Returns:
            Image as RGB numpy array
        """
        try:
            # Remove data URL prefix if present
            if image_data.startswith('data:image'):
                image_data = image_data.split(',', 1)[1]
            
            # Decode base64
            image_bytes = base64.b64decode(image_data)
            
            # Load with PIL
            with Image.open(io.BytesIO(image_bytes)) as pil_image:
                # Convert to RGB
                if pil_image.mode != 'RGB':
                    pil_image = pil_image.convert('RGB')
                
                # Convert to numpy
                return np.array(pil_image)
                
        except Exception as e:
            raise ProcessingError(f"Failed to decode base64 image: {e}")
    
    @staticmethod
    def encode_base64_image(image: np.ndarray, format: str = 'PNG', quality: int = 95) -> str:
        """
        Efficiently encode image to base64.
        
        Args:
            image: Image as numpy array
            format: Output format ('PNG', 'JPEG')
            quality: JPEG quality (1-100)
            
        Returns:
            Base64 encoded image string with data: prefix
        """
        try:
            # Convert to PIL Image
            if image.dtype != np.uint8:
                image = np.clip(image, 0, 255).astype(np.uint8)
            
            pil_image = Image.fromarray(image)
            
            # Encode to bytes
            buffer = io.BytesIO()
            
            if format.upper() == 'JPEG':
                pil_image.save(buffer, format='JPEG', quality=quality, optimize=True)
                mime_type = 'image/jpeg'
            else:  # PNG
                pil_image.save(buffer, format='PNG', optimize=True)
                mime_type = 'image/png'
            
            # Encode to base64
            image_bytes = buffer.getvalue()
            encoded = base64.b64encode(image_bytes).decode('utf-8')
            
            return f"data:{mime_type};base64,{encoded}"
            
        except Exception as e:
            raise ProcessingError(f"Failed to encode image to base64: {e}")


class ProcessorRegistry:
    """Registry for managing preprocessor instances."""
    
    def __init__(self):
        self._processors = {}
        self._processor_classes = {}
    
    def register_processor_class(self, processor_id: str, processor_class: type):
        """Register a preprocessor class."""
        if not issubclass(processor_class, BasePreprocessor):
            raise ValueError(f"Processor class must inherit from BasePreprocessor")
        
        self._processor_classes[processor_id] = processor_class
        logger.info(f"Registered processor class: {processor_id}")
    
    def get_processor(self, processor_id: str, **kwargs) -> BasePreprocessor:
        """Get or create a preprocessor instance."""
        if processor_id not in self._processors:
            if processor_id not in self._processor_classes:
                raise ValueError(f"Unknown processor: {processor_id}")
            
            processor_class = self._processor_classes[processor_id]
            self._processors[processor_id] = processor_class(processor_id, **kwargs)
        
        return self._processors[processor_id]
    
    def cleanup_all(self):
        """Cleanup all processor instances."""
        for processor in self._processors.values():
            processor.cleanup_memory()
        
        logger.info("Cleaned up all processors")


# Global registry instance
processor_registry = ProcessorRegistry()