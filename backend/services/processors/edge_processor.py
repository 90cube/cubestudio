"""
Edge Detection Preprocessor for CUBE Studio
Enhanced edge detection with Canny, HED, and other algorithms.
"""

import logging
from typing import Any, Dict, Optional
import numpy as np
import cv2

from .base_preprocessor import BasePreprocessor, ModelLoadError, ProcessingError

logger = logging.getLogger(__name__)


class EdgePreprocessor(BasePreprocessor):
    """Enhanced edge detection preprocessor with multiple algorithms."""
    
    def __init__(self, processor_id: str, model_path: Optional[str] = None, **kwargs):
        """
        Initialize edge preprocessor.
        
        Args:
            processor_id: Processor identifier (e.g., 'canny_builtin', 'hed')
            model_path: Path to model weights file (for neural methods)
        """
        super().__init__(processor_id, model_path, **kwargs)
        
        # Edge-specific settings
        self.edge_type = self._determine_edge_type()
        
    def _determine_edge_type(self) -> str:
        """Determine edge detection algorithm from processor_id."""
        if 'canny' in self.processor_id.lower():
            return 'canny'
        elif 'hed' in self.processor_id.lower():
            return 'hed'
        elif 'sobel' in self.processor_id.lower():
            return 'sobel'
        elif 'laplacian' in self.processor_id.lower():
            return 'laplacian'
        else:
            return 'canny'  # Default
    
    def get_default_parameters(self) -> Dict[str, Any]:
        """Get default parameters for edge detection."""
        base_params = {
            'threshold': 0.5,         # 0.0 to 1.0
            'edge_width': 1,          # 1 to 5
            'blur_radius': 0.0,       # 0.0 to 5.0
            'invert': False,          # True/False
            'brightness': 0.0,        # -0.5 to 0.5
            'contrast': 1.0           # 0.5 to 2.0
        }
        
        # Algorithm-specific parameters
        if self.edge_type == 'canny':
            base_params.update({
                'low_threshold': 100,     # 0 to 255
                'high_threshold': 200,    # 0 to 255
                'aperture_size': 3        # 3, 5, or 7
            })
        elif self.edge_type == 'sobel':
            base_params.update({
                'sobel_ksize': 3,         # 1, 3, 5, or 7
                'sobel_scale': 1.0,       # 0.1 to 2.0
                'sobel_delta': 0.0        # 0.0 to 100.0
            })
        elif self.edge_type == 'laplacian':
            base_params.update({
                'laplacian_ksize': 3,     # 1, 3, 5, or 7
                'laplacian_scale': 1.0,   # 0.1 to 2.0
                'laplacian_delta': 0.0    # 0.0 to 100.0
            })
        
        return base_params
    
    def get_parameter_schema(self) -> Dict[str, Dict[str, Any]]:
        """Get parameter validation schema."""
        base_schema = {
            'threshold': {
                'type': 'float',
                'min': 0.0,
                'max': 1.0,
                'default': 0.5,
                'description': 'General edge threshold'
            },
            'edge_width': {
                'type': 'int',
                'min': 1,
                'max': 5,
                'default': 1,
                'description': 'Edge line width'
            },
            'blur_radius': {
                'type': 'float',
                'min': 0.0,
                'max': 5.0,
                'default': 0.0,
                'description': 'Pre-processing blur radius'
            },
            'invert': {
                'type': 'bool',
                'default': False,
                'description': 'Invert edge colors'
            },
            'brightness': {
                'type': 'float',
                'min': -0.5,
                'max': 0.5,
                'default': 0.0,
                'description': 'Edge brightness adjustment'
            },
            'contrast': {
                'type': 'float',
                'min': 0.5,
                'max': 2.0,
                'default': 1.0,
                'description': 'Edge contrast adjustment'
            }
        }
        
        # Algorithm-specific schemas
        if self.edge_type == 'canny':
            base_schema.update({
                'low_threshold': {
                    'type': 'int',
                    'min': 0,
                    'max': 255,
                    'default': 100,
                    'description': 'Canny low threshold'
                },
                'high_threshold': {
                    'type': 'int',
                    'min': 0,
                    'max': 255,
                    'default': 200,
                    'description': 'Canny high threshold'
                },
                'aperture_size': {
                    'type': 'int',
                    'min': 3,
                    'max': 7,
                    'default': 3,
                    'description': 'Aperture size for Sobel operator'
                }
            })
        elif self.edge_type == 'sobel':
            base_schema.update({
                'sobel_ksize': {
                    'type': 'int',
                    'min': 1,
                    'max': 7,
                    'default': 3,
                    'description': 'Sobel kernel size'
                },
                'sobel_scale': {
                    'type': 'float',
                    'min': 0.1,
                    'max': 2.0,
                    'default': 1.0,
                    'description': 'Sobel scale factor'
                },
                'sobel_delta': {
                    'type': 'float',
                    'min': 0.0,
                    'max': 100.0,
                    'default': 0.0,
                    'description': 'Sobel delta value'
                }
            })
        elif self.edge_type == 'laplacian':
            base_schema.update({
                'laplacian_ksize': {
                    'type': 'int',
                    'min': 1,
                    'max': 7,
                    'default': 3,
                    'description': 'Laplacian kernel size'
                },
                'laplacian_scale': {
                    'type': 'float',
                    'min': 0.1,
                    'max': 2.0,
                    'default': 1.0,
                    'description': 'Laplacian scale factor'
                },
                'laplacian_delta': {
                    'type': 'float',
                    'min': 0.0,
                    'max': 100.0,
                    'default': 0.0,
                    'description': 'Laplacian delta value'
                }
            })
        
        return base_schema
    
    def _load_model_impl(self) -> Any:
        """Load the appropriate edge detection model."""
        if self.edge_type == 'hed':
            try:
                # TODO: Implement HED model loading when PyTorch model is available
                # For now, we'll use the builtin fallback
                logger.warning(f"HED model loading not yet implemented, will use fallback")
                return None
            except Exception as e:
                raise ModelLoadError(f"Failed to load HED model: {e}")
        else:
            # No model needed for built-in algorithms
            return None
    
    def preprocess_image(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Preprocess image for edge detection."""
        # Base preprocessing
        image = super().preprocess_image(image, params)
        
        # Apply pre-processing blur if requested
        blur_radius = params.get('blur_radius', 0.0)
        if blur_radius > 0:
            kernel_size = max(1, int(blur_radius * 2) + 1)
            if kernel_size % 2 == 0:
                kernel_size += 1
            image = cv2.GaussianBlur(image, (kernel_size, kernel_size), blur_radius)
        
        return image
    
    def _process_impl(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Main edge detection implementation."""
        try:
            if self.edge_type == 'canny':
                return self._process_canny(image, params)
            elif self.edge_type == 'sobel':
                return self._process_sobel(image, params)
            elif self.edge_type == 'laplacian':
                return self._process_laplacian(image, params)
            elif self.edge_type == 'hed':
                return self._process_hed(image, params)
            else:
                return self._process_canny(image, params)  # Default fallback
                
        except Exception as e:
            raise ProcessingError(f"Edge detection failed: {e}")
    
    def _process_canny(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Process edges using Canny algorithm."""
        # Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        else:
            gray = image
        
        # Get parameters
        low_threshold = params.get('low_threshold', 100)
        high_threshold = params.get('high_threshold', 200)
        aperture_size = params.get('aperture_size', 3)
        
        # Ensure aperture size is odd
        if aperture_size % 2 == 0:
            aperture_size += 1
        aperture_size = max(3, min(7, aperture_size))
        
        # Apply Canny edge detection
        edges = cv2.Canny(gray, low_threshold, high_threshold, apertureSize=aperture_size)
        
        # Apply edge width if requested
        edge_width = params.get('edge_width', 1)
        if edge_width > 1:
            kernel = np.ones((edge_width, edge_width), np.uint8)
            edges = cv2.dilate(edges, kernel, iterations=1)
        
        return edges
    
    def _process_sobel(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Process edges using Sobel algorithm."""
        # Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        else:
            gray = image
        
        # Get parameters
        ksize = params.get('sobel_ksize', 3)
        scale = params.get('sobel_scale', 1.0)
        delta = params.get('sobel_delta', 0.0)
        
        # Ensure kernel size is odd
        if ksize % 2 == 0:
            ksize += 1
        ksize = max(1, min(7, ksize))
        
        # Apply Sobel operator
        grad_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=ksize, scale=scale, delta=delta)
        grad_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=ksize, scale=scale, delta=delta)
        
        # Combine gradients
        edges = np.sqrt(grad_x**2 + grad_y**2)
        edges = np.clip(edges, 0, 255).astype(np.uint8)
        
        return edges
    
    def _process_laplacian(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Process edges using Laplacian algorithm."""
        # Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        else:
            gray = image
        
        # Get parameters
        ksize = params.get('laplacian_ksize', 3)
        scale = params.get('laplacian_scale', 1.0)
        delta = params.get('laplacian_delta', 0.0)
        
        # Apply Laplacian
        edges = cv2.Laplacian(gray, cv2.CV_64F, ksize=ksize, scale=scale, delta=delta)
        edges = np.absolute(edges)
        edges = np.clip(edges, 0, 255).astype(np.uint8)
        
        return edges
    
    def _process_hed(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Process edges using HED (Holistically-Nested Edge Detection)."""
        if self.model is not None:
            # TODO: Implement actual HED processing when model is available
            logger.warning("HED processing not yet implemented, using Canny fallback")
        
        # Fallback to Canny
        return self._process_canny(image, params)
    
    def _fallback_process(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Fallback edge processing using Canny algorithm."""
        logger.info(f"Using fallback edge processing for {self.processor_id}")
        
        # Use Canny as the most reliable fallback
        return self._process_canny(image, params)
    
    def postprocess_image(self, image: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
        """Post-process edge map."""
        # Ensure image is grayscale uint8
        if len(image.shape) == 3:
            image = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        
        if image.dtype != np.uint8:
            if image.max() <= 1.0:
                image = (image * 255).astype(np.uint8)
            else:
                image = np.clip(image, 0, 255).astype(np.uint8)
        
        # Apply brightness and contrast adjustments
        brightness = params.get('brightness', 0.0)
        contrast = params.get('contrast', 1.0)
        
        if brightness != 0.0 or contrast != 1.0:
            image = image.astype(np.float32) / 255.0
            image = image * contrast + brightness
            image = np.clip(image, 0, 1)
            image = (image * 255).astype(np.uint8)
        
        # Invert if requested
        if params.get('invert', False):
            image = 255 - image
        
        # Convert to RGB
        image_rgb = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
        
        return image_rgb


class CannyEdgePreprocessor(EdgePreprocessor):
    """Specialized Canny edge detection preprocessor."""
    
    def __init__(self, processor_id='canny_builtin', **kwargs):
        super().__init__(processor_id, None, **kwargs)


class HEDEdgePreprocessor(EdgePreprocessor):
    """Specialized HED edge detection preprocessor."""
    
    def __init__(self, processor_id='hed', model_path: Optional[str] = None, **kwargs):
        super().__init__(processor_id, model_path, **kwargs)


class SobelEdgePreprocessor(EdgePreprocessor):
    """Specialized Sobel edge detection preprocessor."""
    
    def __init__(self, processor_id='sobel_builtin', **kwargs):
        super().__init__(processor_id, None, **kwargs)


class LaplacianEdgePreprocessor(EdgePreprocessor):
    """Specialized Laplacian edge detection preprocessor."""
    
    def __init__(self, processor_id='laplacian_builtin', **kwargs):
        super().__init__(processor_id, None, **kwargs)