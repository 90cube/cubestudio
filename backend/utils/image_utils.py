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
    PyTorch-based depth estimation using original MiDaS implementation.
    
    Args:
        image_array: Input image as numpy array (RGB)
        model_id: Model identifier ('midas_v21' or 'dpt_hybrid')
        params: Processing parameters including brightness, contrast, smoothing, depthStrength
        
    Returns:
        Processed depth map as RGB numpy array
        
    Raises:
        Exception: If PyTorch is unavailable or model loading fails
    """
    # Import required modules and check availability
    try:
        import torch
        import torch.nn.functional as F
    except ImportError as e:
        raise Exception(f"Required modules not available: {e}")
    
    # Check PyTorch availability
    if not torch.cuda.is_available() and not torch.backends.mps.is_available():
        logger.warning("[PYTORCH] Neither CUDA nor MPS available, using CPU")
    
    # Validate available_models parameter
    if available_models is None:
        raise Exception("available_models parameter is required")
    
    # Get model file path
    model_info = available_models.get(model_id, {})
    model_path = model_info.get("filepath")
    
    if not model_path or not os.path.exists(model_path):
        raise Exception(f"Model file not found: {model_path}")
    
    logger.info(f"[ORIGINAL-MIDAS] Loading {model_id} from {model_path}")
    
    try:
        # Convert numpy array to PIL Image
        pil_image = Image.fromarray(image_array)
        logger.info(f"[ORIGINAL-MIDAS] PIL image created: {pil_image.size}")
        
        # Load and run original MiDaS model
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"[ORIGINAL-MIDAS] Using device: {device}")
        
        # Load model using original MiDaS implementation
        try:
            from backend.midas_original import load_model
            
            logger.info(f"[ORIGINAL-MIDAS] Loading original MiDaS model: {model_id}")
            
            # Map model_id to correct model type
            if model_id == "midas_v21":
                model_type = "midas_v21_384"
            elif model_id == "dpt_hybrid":
                model_type = "dpt_hybrid_384"
            else:
                model_type = model_id
            
            model, transform, net_w, net_h = load_model(device, model_path, model_type, optimize=False)
            logger.info(f"[ORIGINAL-MIDAS] Model loaded successfully: {net_w}x{net_h}")
                
        except Exception as e:
            logger.error(f"[ORIGINAL-MIDAS] Failed to load original MiDaS model: {e}")
            raise Exception(f"Could not load original {model_id} model: {e}")
        
        # Process image with original MiDaS
        try:
            logger.info(f"[ORIGINAL-MIDAS] Processing image with original MiDaS")
            
            # Apply MiDaS transform
            img_input = transform({"image": np.array(pil_image) / 255.0})["image"]
            
            # Convert to tensor and add batch dimension
            sample = torch.from_numpy(img_input).to(device).unsqueeze(0)
            
            # Run inference
            with torch.no_grad():
                prediction = model.forward(sample)
                prediction = (
                    torch.nn.functional.interpolate(
                        prediction.unsqueeze(1),
                        size=image_array.shape[:2],
                        mode="bicubic",
                        align_corners=False,
                    )
                    .squeeze()
                    .cpu()
                    .numpy()
                )
            
            # Normalize to 0-255 range
            depth_map = prediction
            if depth_map.max() > depth_map.min():
                depth_map = (depth_map - depth_map.min()) / (depth_map.max() - depth_map.min())
            else:
                logger.warning("[ORIGINAL-MIDAS] Constant depth map detected, setting to mid-range")
                depth_map = np.full_like(depth_map, 0.5)
            
            depth_map = (depth_map * 255).astype(np.uint8)
            
            logger.info(f"[ORIGINAL-MIDAS] Depth map generated: {depth_map.shape}")
            
            # Apply depth effects if specified
            brightness = params.get('brightness', 0.0)
            contrast = params.get('contrast', 1.0)
            
            if brightness != 0.0 or contrast != 1.0:
                logger.info(f"[ORIGINAL-MIDAS] Applying effects: brightness={brightness}, contrast={contrast}")
                # Apply brightness and contrast
                depth_float = depth_map.astype(np.float32) / 255.0
                depth_float = np.clip(depth_float + brightness, 0, 1)
                depth_float = np.clip(contrast * (depth_float - 0.5) + 0.5, 0, 1)
                depth_map = (depth_float * 255).astype(np.uint8)
            
            # Convert single-channel to RGB
            if len(depth_map.shape) == 2:
                depth_rgb = np.stack([depth_map, depth_map, depth_map], axis=-1)
            else:
                depth_rgb = depth_map
            
            # DEBUG: Check actual depth values
            logger.info(f"[DEBUG] Depth range: {depth_rgb.min()} to {depth_rgb.max()}")
            logger.info(f"[DEBUG] Depth mean: {depth_rgb.mean():.2f}")
            
            logger.info(f"[ORIGINAL-MIDAS] {model_id} processing completed successfully")
            return depth_rgb
            
        except Exception as e:
            logger.error(f"[ORIGINAL-MIDAS] Failed to process image: {e}")
            raise Exception(f"Original MiDaS processing failed: {e}")
        
    except Exception as e:
        logger.error(f"[ORIGINAL-MIDAS] Failed to process {model_id}: {e}")
        raise