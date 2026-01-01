"""
Processor models and types for CUBE Studio backend
Contains ProcessorType enum and processor registry configuration
"""

from enum import Enum
from typing import Dict, Any, Optional
class ProcessorType(str, Enum):
    """Enumeration of processor types"""
    EDGE_DETECTION = "edge_detection"
    DEPTH_ESTIMATION = "depth_estimation" 
    POSE_ESTIMATION = "pose_estimation"

def scan_available_models(config_manager = None) -> Dict[str, Dict[str, Any]]:
    """Scan for available preprocessor model files.
    
    Args:
        config: Optional Config instance. If None, creates a new instance.
    
    Returns:
        Dict containing model information including availability, file paths, and sizes.
    """
    import os
    import logging
    
    if config_manager is None:
        from .config_manager import get_config_manager
        config_manager = get_config_manager()
    
    logger = logging.getLogger(__name__)
    available_models = {}
    
    preprocessors_path = config_manager.preprocessors_path
    if not os.path.exists(preprocessors_path):
        logger.warning(f"Preprocessor models path not found: {preprocessors_path}")
        return available_models
    
    # 실제 파일 스캔
    found_count = 0
    missing_count = 0
    
    for model_key, filename in config_manager.real_model_files.items():
        filepath = os.path.join(preprocessors_path, filename)
        if os.path.exists(filepath):
            file_size = os.path.getsize(filepath) / (1024 * 1024)  # MB
            available_models[model_key] = {
                "filename": filename,
                "filepath": filepath,
                "size_mb": round(file_size, 2),
                "available": True
            }
            logger.debug(f"[FOUND] Model: {model_key} ({file_size:.2f}MB)")
            found_count += 1
        else:
            available_models[model_key] = {
                "filename": filename,
                "filepath": None,
                "size_mb": 0,
                "available": False
            }
            logger.debug(f"[MISSING] Model: {model_key} ({filename})")
            missing_count += 1
            
    logger.info(f"Model scan complete: {found_count} found, {missing_count} missing")
    
    return available_models

def create_processor_registry(available_models: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Create processor registry based on available models.
    
    Args:
        available_models: Dictionary of available model information
        
    Returns:
        Dictionary containing processor configuration
    """
    
    # Real processor configuration - ONLY tested working models for preprocessing
    processor_registry = {
        # Depth Estimation - All working models
        "midas_v21": {
            "id": "midas_v21",
            "name": "MiDaS v2.1 Depth", 
            "type": ProcessorType.DEPTH_ESTIMATION,
            "category": "depth_normals",
            "available": available_models.get("midas_v21", {}).get("available", False),
            "model_file": available_models.get("midas_v21", {}).get("filepath"),
            "backend": "pytorch",
            "parameters": {
                "near_plane": {"min": 0.1, "max": 10.0, "default": 0.1},
                "far_plane": {"min": 10.0, "max": 1000.0, "default": 100.0},
                "brightness": {"min": -0.5, "max": 0.5, "default": 0.1},
                "contrast": {"min": 0.5, "max": 3.0, "default": 1.2},
            }
        },
        "dpt_hybrid": {
            "id": "dpt_hybrid",
            "name": "DPT Hybrid Depth",
            "type": ProcessorType.DEPTH_ESTIMATION,
            "category": "depth_normals", 
            "available": available_models.get("dpt_hybrid", {}).get("available", False),
            "model_file": available_models.get("dpt_hybrid", {}).get("filepath"),
            "backend": "pytorch",
            "parameters": {
                "near_plane": {"min": 0.1, "max": 10.0, "default": 0.1},
                "far_plane": {"min": 10.0, "max": 1000.0, "default": 100.0},
                "brightness": {"min": -0.5, "max": 0.5, "default": 0.1},
                "contrast": {"min": 0.5, "max": 3.0, "default": 1.2},
            }
        },
        "depth_anything_v2_vitb": {
            "id": "depth_anything_v2_vitb",
            "name": "Depth Anything V2 (ViT-B)",
            "type": ProcessorType.DEPTH_ESTIMATION,
            "category": "depth_normals",
            "available": available_models.get("depth_anything_v2_vitb", {}).get("available", False),
            "model_file": available_models.get("depth_anything_v2_vitb", {}).get("filepath"),
            "backend": "pytorch",
            "parameters": {
                "input_size": {"min": 256, "max": 1024, "default": 518},
                "grayscale": {"type": "bool", "default": False},
                "normalize": {"type": "bool", "default": True},
                "invert": {"type": "bool", "default": False}
            }
        },
        # Edge Detection - OpenCV built-in
        "canny_opencv": {
            "id": "canny_opencv",
            "name": "Canny Edge Detection",
            "type": ProcessorType.EDGE_DETECTION,
            "category": "edge_lines",
            "available": True,  # Always available (OpenCV built-in)
            "model_file": None,  # No model file needed
            "backend": "opencv",
            "parameters": {
                "low_threshold": {"min": 50, "max": 200, "default": 100},
                "high_threshold": {"min": 100, "max": 300, "default": 200},
                "blur_kernel": {"min": 1, "max": 9, "default": 3}
            }
        },
        
        # Pose Detection - DWPose model (consolidated)
        "dwpose_builtin": {
            "id": "dwpose_builtin",
            "name": "DWPose",
            "type": ProcessorType.POSE_ESTIMATION,
            "category": "pose_human",
            "available": available_models.get("dw_openpose", {}).get("available", False),
            "model_file": available_models.get("dw_openpose", {}).get("filepath"),
            "backend": "onnx",
            "parameters": {
                "threshold": {"min": 0.1, "max": 1.0, "default": 0.3},
                "line_width": {"min": 1, "max": 10, "default": 2},
                "point_radius": {"min": 1, "max": 10, "default": 4},
                "detect_body": {"type": "bool", "default": True},
                "detect_hand": {"type": "bool", "default": True},
                "detect_face": {"type": "bool", "default": False},
                "skeleton_color": {"type": "str", "default": "white"},
                "point_color": {"type": "str", "default": "red"},
                "background_color": {"type": "str", "default": "black"},
                "output_format": {"type": "str", "default": "image"}
            }
        },
        "openpose_body": {
            "id": "openpose_body",
            "name": "OpenPose Body",
            "type": ProcessorType.POSE_ESTIMATION,
            "category": "pose_human",
            "available": available_models.get("body_pose", {}).get("available", False),
            "model_file": available_models.get("body_pose", {}).get("filepath"),
            "backend": "pytorch",
            "parameters": {
                "threshold": {"min": 0.1, "max": 1.0, "default": 0.4},
                "line_width": {"min": 1, "max": 10, "default": 2},
                "point_radius": {"min": 1, "max": 10, "default": 3},
                "skeleton_color": {"type": "str", "default": "white"},
                "point_color": {"type": "str", "default": "red"},
                "background_color": {"type": "str", "default": "black"}
            }
        },
        "openpose_hand": {
            "id": "openpose_hand",
            "name": "OpenPose Hand",
            "type": ProcessorType.POSE_ESTIMATION,
            "category": "pose_human",
            "available": available_models.get("hand_pose", {}).get("available", False),
            "model_file": available_models.get("hand_pose", {}).get("filepath"),
            "backend": "pytorch",
            "parameters": {
                "threshold": {"min": 0.1, "max": 1.0, "default": 0.4},
                "line_width": {"min": 1, "max": 10, "default": 2},
                "point_radius": {"min": 1, "max": 10, "default": 3},
                "skeleton_color": {"type": "str", "default": "white"},
                "point_color": {"type": "str", "default": "red"},
                "background_color": {"type": "str", "default": "black"}
            }
        },
        "dwpose_onnx": {
            "id": "dwpose_onnx",
            "name": "DWPose (ONNX) - High-quality whole body detection",
            "type": ProcessorType.POSE_ESTIMATION,
            "category": "pose_human",
            "available": available_models.get("yolox_l", {}).get("available", False) and available_models.get("dw_openpose", {}).get("available", False),
            "model_file": available_models.get("yolox_l", {}).get("filepath"),
            "backend": "onnx",
            "parameters": {
                "threshold": {"min": 0.1, "max": 1.0, "default": 0.3},
                "line_width": {"min": 1, "max": 10, "default": 2},
                "point_radius": {"min": 1, "max": 10, "default": 4},
                "detect_body": {"type": "bool", "default": True},
                "detect_hand": {"type": "bool", "default": True},
                "detect_face": {"type": "bool", "default": False},
                "skeleton_color": {"type": "str", "default": "white"},
                "point_color": {"type": "str", "default": "red"},
                "background_color": {"type": "str", "default": "black"},
                "output_format": {"type": "str", "default": "image"}
            }
        },
        "dwpose_builtin": {
            "id": "dwpose_builtin",
            "name": "DWPose (easy) - Whole body",
            "type": ProcessorType.POSE_ESTIMATION,
            "category": "pose_human",
            "available": available_models.get("yolox_l", {}).get("available", False) and available_models.get("dw_openpose", {}).get("available", False),
            "model_file": available_models.get("yolox_l", {}).get("filepath"),
            "backend": "onnx",
            "parameters": {
                "threshold": {"min": 0.1, "max": 1.0, "default": 0.3},
                "line_width": {"min": 1, "max": 10, "default": 2},
                "point_radius": {"min": 1, "max": 10, "default": 4},
                "detect_body": {"type": "bool", "default": True},
                "detect_hand": {"type": "bool", "default": True},
                "detect_face": {"type": "bool", "default": False},
                "skeleton_color": {"type": "str", "default": "white"},
                "point_color": {"type": "str", "default": "red"},
                "background_color": {"type": "str", "default": "black"},
                "output_format": {"type": "str", "default": "image"}
            }
        },
        "openpose_unified": {
            "id": "openpose_unified",
            "name": "OpenPose Unified - Full body, hands & face detection",
            "type": ProcessorType.POSE_ESTIMATION,
            "category": "pose_human",
            "available": available_models.get("yolox_l", {}).get("available", False) and available_models.get("dw_openpose", {}).get("available", False),
            "model_file": available_models.get("yolox_l", {}).get("filepath"),
            "backend": "onnx",
            "parameters": {
                "confidence_threshold": {"min": 0.1, "max": 1.0, "default": 0.3},
                "line_width": {"min": 1, "max": 10, "default": 2},
                "point_radius": {"min": 1, "max": 10, "default": 4},
                "detect_body": {"type": "bool", "default": True},
                "detect_hand": {"type": "bool", "default": True},
                "detect_face": {"type": "bool", "default": False},
                "skeleton_color": {"type": "str", "default": "white"},
                "point_color": {"type": "str", "default": "red"},
                "background_color": {"type": "str", "default": "black"},
                "output_format": {"type": "str", "default": "image"}
            }
        }
    }

    return processor_registry

# Category mapping for 3-tab system
PROCESSOR_CATEGORIES = {
    "edge_lines": "Edge Detection",
    "depth_normals": "Depth Maps",
    "pose_human": "Pose Detection"
}
