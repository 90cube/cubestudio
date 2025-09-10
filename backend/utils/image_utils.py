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
        model_id: Model identifier ('midas_v21', 'dpt_hybrid', or 'depth_anything_v2_vitb')
        params: Processing parameters
        
    Returns:
        Processed depth map as RGB numpy array
        
    Raises:
        Exception: If PyTorch is unavailable or model loading fails
    """
    
    # Route to appropriate processor based on model_id
    if model_id == "depth_anything_v2_vitb":
        return process_depth_anything_v2(image_array, model_id, available_models, params)
    else:
        # Use original MiDaS processing for other models
        return process_depth_original_midas(image_array, model_id, available_models, params)


def process_depth_anything_v2(image_array: np.ndarray, model_id: str, available_models: dict, params: dict = None) -> np.ndarray:
    """Process depth using Depth Anything V2 model.
    
    Args:
        image_array: Input image as numpy array (RGB)
        model_id: Model identifier ('depth_anything_v2_vitb')
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
        from backend.services.processors.depth_anything_processor import DepthAnythingProcessor
        from backend.models.config_manager import get_config_manager
        
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


def process_depth_original_midas(image_array: np.ndarray, model_id: str, available_models: dict, params: dict = None) -> np.ndarray:
    """Process depth using original MiDaS models.
    
    Args:
        image_array: Input image as numpy array (RGB)
        model_id: Model identifier ('midas_v21' or 'dpt_hybrid')
        available_models: Dictionary of available models
        params: Processing parameters (brightness, contrast, near_plane, far_plane, etc.)
        
    Returns:
        Processed depth map as RGB numpy array
        
    Raises:
        Exception: If model loading or processing fails
    """
    logger.info(f"[MIDAS] Starting original MiDaS processing with {model_id}")
    
    if params is None:
        params = {}
    
    try:
        # Import the proper MiDaS implementation from backend/midas_original
        from ..midas_original.model_loader import load_model
        import torch
        import cv2
        
        # Get model information
        model_info = available_models.get(model_id)
        if not model_info or not model_info.get('available', False):
            raise Exception(f"Model {model_id} not available")
        
        model_path = model_info['filepath']
        logger.info(f"[MIDAS] Loading model from: {model_path}")
        
        # Map our model IDs to the loader's expected types
        model_type_mapping = {
            'midas_v21': 'midas_v21_384',
            'dpt_hybrid': 'dpt_hybrid_384'
        }
        model_type = model_type_mapping.get(model_id, 'midas_v21_384')
        
        # Load MiDaS model with proper loader
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model, transform, net_w, net_h = load_model(device, model_path, model_type, optimize=False)
        
        # Prepare image for MiDaS - ensure it's in the right format
        original_image = image_array.copy()
        
        # Apply MiDaS preprocessing transform
        img_input = transform({"image": original_image / 255.0})["image"]
        
        # Run inference
        with torch.no_grad():
            img_input = torch.from_numpy(img_input).to(device).unsqueeze(0)
            
            # Handle different model architectures
            if hasattr(model, 'forward'):
                depth_prediction = model.forward(img_input)
            else:
                depth_prediction = model(img_input)
            
            # Resize prediction to original image size
            depth_prediction = torch.nn.functional.interpolate(
                depth_prediction.unsqueeze(1),
                size=(image_array.shape[0], image_array.shape[1]),
                mode="bicubic",
                align_corners=False,
            ).squeeze()
            
            # Convert to numpy
            depth_numpy = depth_prediction.cpu().numpy()
        
        # Apply post-processing based on parameters
        depth_numpy = _postprocess_midas_depth(depth_numpy, params)
        
        # Convert to RGB format
        depth_rgb = np.stack([depth_numpy, depth_numpy, depth_numpy], axis=-1)
        depth_rgb = (depth_rgb * 255).astype(np.uint8)
        
        logger.info(f"[MIDAS] Successfully processed with {model_id} using {model_type}")
        return depth_rgb
        
    except Exception as e:
        import traceback
        logger.error(f"[MIDAS] Failed to process with {model_id}: {e}")
        logger.error(f"[MIDAS] Full traceback: {traceback.format_exc()}")
        # Fallback to built-in depth processing
        logger.warning(f"[MIDAS] Using fallback depth processing for {model_id}")
        return process_depth_builtin(image_array, params)


def _postprocess_midas_depth(depth_numpy: np.ndarray, params: dict) -> np.ndarray:
    """Post-process MiDaS depth output with user parameters.
    
    Args:
        depth_numpy: Raw depth output from MiDaS model
        params: Processing parameters
        
    Returns:
        Post-processed depth map as numpy array (0-1 range)
    """
    # Normalize to 0-1 range first
    if depth_numpy.max() > depth_numpy.min():
        depth_numpy = (depth_numpy - depth_numpy.min()) / (depth_numpy.max() - depth_numpy.min())
    
    # Apply near/far plane clipping if specified
    near_plane = params.get('near_plane', 0.0)
    far_plane = params.get('far_plane', 1.0)
    if near_plane > 0.0 or far_plane < 1.0:
        depth_numpy = np.clip(depth_numpy, near_plane, far_plane)
        if far_plane > near_plane:
            depth_numpy = (depth_numpy - near_plane) / (far_plane - near_plane)
    
    # Apply brightness and contrast adjustments
    brightness = params.get('brightness', 0.0)  # -1.0 to 1.0
    contrast = params.get('contrast', 1.0)      # 0.1 to 3.0
    
    # Apply contrast first (around midpoint)
    if contrast != 1.0:
        depth_numpy = 0.5 + (depth_numpy - 0.5) * contrast
    
    # Then apply brightness
    if brightness != 0.0:
        depth_numpy = depth_numpy + brightness
    
    # Apply inversion if requested
    if params.get('invert', False):
        depth_numpy = 1.0 - depth_numpy
    
    # Clamp to valid range
    depth_numpy = np.clip(depth_numpy, 0.0, 1.0)
    
    return depth_numpy


def process_pose_dwpose(image_array: np.ndarray, processor_id: str, params: dict) -> Union[np.ndarray, dict]:
    """
    Process image for pose detection using DWPose processors.
    
    Args:
        image_array: RGB image array
        processor_id: Pose processor ID (dwpose_builtin, dwpose_wholebody, etc.)
        params: Processing parameters
        
    Returns:
        Processed image array or pose data dict (depending on output_format)
    """
    try:
        # Import the appropriate processor
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        
        if processor_id == "dwpose_builtin":
            from ..services.processors.dwpose_processor import DWPoseBuiltinPreprocessor
            processor = DWPoseBuiltinPreprocessor(processor_id)
        elif processor_id == "dwpose_wholebody":
            from ..services.processors.dwpose_processor import DWPoseWholeBodyPreprocessor
            processor = DWPoseWholeBodyPreprocessor(processor_id)
        else:
            # Default to built-in
            from ..services.processors.dwpose_processor import DWPoseBuiltinPreprocessor
            processor = DWPoseBuiltinPreprocessor("dwpose_builtin")
        
        # Process the image
        result = processor.process(image_array, params)
        
        logger.info(f"[DWPOSE] Successfully processed with {processor_id}")
        return result
        
    except Exception as e:
        logger.error(f"[DWPOSE] Failed to process with {processor_id}: {e}")
        # Fallback to built-in OpenPose
        logger.warning(f"[DWPOSE] Using fallback pose processing")
        return process_openpose_builtin(image_array, params)


def process_pose_openpose(image_array: np.ndarray, processor_id: str, params: dict, available_models: dict = None) -> np.ndarray:
    """
    Process image for pose detection using OpenPose models.
    
    Args:
        image_array: RGB image array
        processor_id: Pose processor ID (openpose_body, openpose_hand)
        params: Processing parameters
        available_models: Available model configurations
        
    Returns:
        Processed skeleton image array
    """
    try:
        # Import the appropriate processor
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        
        if processor_id == "openpose_body":
            from ..services.processors.pose_processor import OpenPoseBodyPreprocessor
            # Get model path if available
            model_path = None
            if available_models and "body_pose" in available_models:
                model_info = available_models["body_pose"]
                if model_info.get("available", False):
                    model_path = model_info.get("filepath")
            
            processor = OpenPoseBodyPreprocessor(processor_id, model_path)
            
        elif processor_id == "openpose_hand":
            from ..services.processors.pose_processor import OpenPoseHandPreprocessor
            # Get model path if available
            model_path = None
            if available_models and "hand_pose" in available_models:
                model_info = available_models["hand_pose"]
                if model_info.get("available", False):
                    model_path = model_info.get("filepath")
            
            processor = OpenPoseHandPreprocessor(processor_id, model_path)
            
        else:
            # Default to built-in
            from ..services.processors.pose_processor import BuiltinPosePreprocessor
            processor = BuiltinPosePreprocessor("openpose_builtin")
        
        # Process the image
        result = processor.process(image_array, params)
        
        logger.info(f"[OPENPOSE] Successfully processed with {processor_id}")
        return result
        
    except Exception as e:
        logger.error(f"[OPENPOSE] Failed to process with {processor_id}: {e}")
        # Fallback to built-in
        logger.warning(f"[OPENPOSE] Using fallback pose processing")
        return process_openpose_builtin(image_array, params)