"""
Image processing utilities for CUBE Studio
Contains low-level image processing algorithms and transformations.
"""

import base64
import io
import logging
import os
from typing import Any, Dict, Union

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def decode_base64_image(image_base64: str) -> np.ndarray:
    """
    Decode base64 image string to numpy array.
    
    Args:
        image_base64: Base64 encoded image (with or without data URI prefix)
        
    Returns:
        Image as RGB numpy array
        
    Raises:
        Exception: If image decoding fails
    """
    try:
        if image_base64.startswith('data:image'):
            image_base64 = image_base64.split(',')[1]
        
        image_bytes = base64.b64decode(image_base64)
        image_pil = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        image_array = np.array(image_pil)
        
        return image_array
    except Exception as e:
        logger.error(f"Failed to decode base64 image: {e}")
        raise Exception(f"Image decode error: {str(e)}")


def encode_image_to_base64(image_array: np.ndarray, format: str = 'PNG') -> str:
    """
    Encode numpy array image to base64 string.
    
    Args:
        image_array: Image as numpy array
        format: Image format ('PNG', 'JPEG', etc.)
        
    Returns:
        Base64 encoded image with data URI prefix
        
    Raises:
        Exception: If image encoding fails
    """
    try:
        image_pil = Image.fromarray(image_array)
        buffer = io.BytesIO()
        image_pil.save(buffer, format=format)
        image_b64 = base64.b64encode(buffer.getvalue()).decode()
        
        return f"data:image/{format.lower()};base64,{image_b64}"
    except Exception as e:
        logger.error(f"Failed to encode image to base64: {e}")
        raise Exception(f"Image encode error: {str(e)}")


def process_canny_opencv(image_array: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
    """
    OpenCV Canny edge detection algorithm.
    
    Args:
        image_array: Input image as numpy array
        params: Parameters including low_threshold, high_threshold, and blur_kernel
        
    Returns:
        Processed image as RGB numpy array
    """
    # Convert to grayscale if needed
    gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY) if len(image_array.shape) == 3 else image_array
    
    # Get parameters
    low_threshold = params.get('low_threshold', 100)
    high_threshold = params.get('high_threshold', 200)
    blur_kernel = params.get('blur_kernel', 3)
    
    # Apply Gaussian blur to reduce noise
    if blur_kernel > 1:
        gray = cv2.GaussianBlur(gray, (blur_kernel, blur_kernel), 0)
    
    # Apply Canny edge detection
    edges = cv2.Canny(gray, low_threshold, high_threshold)
    
    # Convert to RGB for consistency
    return cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)


def process_depth_builtin(image_array: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
    """
    Built-in depth estimation fallback using brightness analysis.
    
    Args:
        image_array: Input image as numpy array
        params: Parameters including contrast and brightness
        
    Returns:
        Depth map as RGB numpy array
    """
    gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY) if len(image_array.shape) == 3 else image_array
    
    contrast = params.get('contrast', 1.2)
    brightness = params.get('brightness', 0.1)
    
    # Simple depth from brightness
    depth = gray.astype(np.float32) / 255.0
    depth = depth * contrast + brightness
    depth = np.clip(depth, 0, 1)
    
    # Convert to 3-channel for consistency
    depth_rgb = np.stack([depth, depth, depth], axis=-1)
    return (depth_rgb * 255).astype(np.uint8)


def process_openpose_builtin(image_array: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
    """
    Built-in pose estimation fallback using edge detection.
    
    Args:
        image_array: Input image as numpy array
        params: Processing parameters (unused in fallback)
        
    Returns:
        Skeleton outline as RGB numpy array
    """
    # For now, return a simple skeletal outline
    gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY) if len(image_array.shape) == 3 else image_array
    edges = cv2.Canny(gray, 50, 150)
    
    # Simple skeleton simulation
    kernel = np.ones((3, 3), np.uint8)
    skeleton = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
    
    return cv2.cvtColor(skeleton, cv2.COLOR_GRAY2RGB)


def process_depth_pytorch(image_array: np.ndarray, model_id: str, params: Dict[str, Any], available_models: Dict = None) -> np.ndarray:
    """
    PyTorch-based depth estimation using various models.
    
    Args:
        image_array: Input image as numpy array (RGB)
        model_id: Model identifier ('midas_v21', 'dpt_hybrid', or 'depth_anything_v2')
        params: Processing parameters
        
    Returns:
        Processed depth map as RGB numpy array
        
    Raises:
        Exception: If PyTorch is unavailable or model loading fails
    """
    
    # Route to appropriate processor based on model_id
    if model_id == "depth_anything_v2":
        return process_depth_anything_v2(image_array, model_id, available_models, params)
    else:
        # Use original MiDaS processing for other models
        return process_depth_original_midas(image_array, model_id, available_models, params)


def process_depth_anything_v2(image_array: np.ndarray, model_id: str, available_models: dict, params: dict = None) -> np.ndarray:
    """Process depth using Depth Anything V2 model.
    
    Args:
        image_array: Input image as numpy array (RGB)
        model_id: Model identifier ('depth_anything_v2')
        params: Processing parameters including input_size, grayscale, normalize, invert
        
    Returns:
        Processed depth map as RGB numpy array
        
    Raises:
        Exception: If model loading or processing fails
    """
    logger.info(f"[DEPTH-ANYTHING] Starting Depth Anything V2 processing")
    
    # Get parameters with defaults
    if params is None:
        params = {}
    
    input_size = params.get('input_size', 518)
    grayscale = params.get('grayscale', False)
    normalize = params.get('normalize', True)
    invert = params.get('invert', False)
    
    try:
        # Import and initialize processor
        from ..services.depth_anything_processor import DepthAnythingProcessor
        from ..models.config_manager import get_config_manager
        
        config_manager = get_config_manager()
        processor = DepthAnythingProcessor(config_manager)
        
        # Process image
        depth_map = processor.process_image(
            image_array,
            input_size=input_size,
            grayscale=grayscale,
            normalize=normalize,
            invert=invert
        )
        
        if depth_map is None:
            raise Exception("Depth Anything V2 processing returned None")
        
        # Ensure RGB format
        if len(depth_map.shape) == 2:
            depth_rgb = np.stack([depth_map, depth_map, depth_map], axis=-1)
        else:
            depth_rgb = depth_map
        
        logger.info(f"[DEPTH-ANYTHING] Processing completed successfully")
        logger.info(f"[DEPTH-ANYTHING] Output shape: {depth_rgb.shape}, range: {depth_rgb.min()}-{depth_rgb.max()}")
        
        return depth_rgb
        
    except Exception as e:
        logger.error(f"[DEPTH-ANYTHING] Failed to process image: {e}")
        raise Exception(f"Depth Anything V2 processing failed: {e}")