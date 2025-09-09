#!/usr/bin/env python3
"""
CUBE Studio - Unified Backend Service (v4.0)
Real preprocessor implementation with actual model file scanning and PyTorch integration.

Provides:
- Real MiDaS depth preprocessing with PyTorch models
- ControlNet preprocessor system
- Model file scanning and validation
- Comprehensive parameter processing
"""

# Standard library imports
import base64
import datetime
import io
import json
import logging
import os
import time
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

# Third-party imports
import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('unified_backend.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# PyTorch imports (with graceful fallback)
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torchvision.transforms import Compose, Resize, ToTensor, Normalize
    PYTORCH_AVAILABLE = True
    logger.info("PyTorch loaded successfully")
except ImportError as e:
    PYTORCH_AVAILABLE = False
    logger.error(f"PyTorch not available: {e}")

# Enhanced preprocessing system import
try:
    from integrate_enhanced_preprocessors import (
        integrate_enhanced_preprocessors,
        get_enhanced_processor_stats,
        get_enhanced_processor_info
    )
    ENHANCED_PREPROCESSING_AVAILABLE = True
    logger.info("Enhanced preprocessing system available")
except ImportError as e:
    ENHANCED_PREPROCESSING_AVAILABLE = False
    logger.warning(f"Enhanced preprocessing not available: {e}")

# FastAPI app
app = FastAPI(
    title="CUBE Studio Unified Backend",
    description="Real preprocessor system with model file scanning",
    version="4.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 실제 모델 파일 경로 설정
MODELS_BASE_PATH = r"D:\Comfyui\Original_comfyui\ComfyUI_windows_portable\ComfyUI\models"
PREPROCESSOR_MODELS_PATH = os.path.join(MODELS_BASE_PATH, "preprocessors")
CHECKPOINTS_PATH = os.path.join(MODELS_BASE_PATH, "checkpoints")
VAE_PATH = os.path.join(MODELS_BASE_PATH, "vae")

# Real model file mapping based on actual files
REAL_MODEL_FILES = {
    # Depth models
    "dpt_hybrid": "dpt_hybrid-midas-501f0c75.pt",
    "dpt_beit_large_512": "dpt_beit_large_512.pt",
    "midas_v21": "midas_v21_384.pt",
    
    # Edge detection
    "hed": "ControlNetHED.pth", 
    "network_bsds500": "network-bsds500.pth",
    
    # Pose detection
    "body_pose": "body_pose_model.pth",
    "hand_pose": "hand_pose_model.pth",
    "dw_openpose": "pose_dw-ll_ucoco_384.pth",
    
    # Segmentation
    "oneformer_coco": "150_16_swin_l_oneformer_coco_100ep.pth",
    "oneformer_ade20k": "250_16_swin_l_oneformer_ade20k_160k.pth",
    
    # Line detection
    "mlsd": "mlsd_large_512_fp32.pth",
    
    # Other models
    "clip": "clip_g.pth",
    "lama": "ControlNetLama.pth",
    "realesrgan": "RealESRGAN_x4plus.pth",
}

def scan_available_models() -> Dict[str, Dict[str, Any]]:
    """Scan for available preprocessor model files.
    
    Returns:
        Dict containing model information including availability, file paths, and sizes.
    """
    available_models = {}
    
    if not os.path.exists(PREPROCESSOR_MODELS_PATH):
        logger.warning(f"Preprocessor models path not found: {PREPROCESSOR_MODELS_PATH}")
        return available_models
    
    # 실제 파일 스캔
    for model_key, filename in REAL_MODEL_FILES.items():
        filepath = os.path.join(PREPROCESSOR_MODELS_PATH, filename)
        if os.path.exists(filepath):
            file_size = os.path.getsize(filepath) / (1024 * 1024)  # MB
            available_models[model_key] = {
                "filename": filename,
                "filepath": filepath,
                "size_mb": round(file_size, 2),
                "available": True
            }
            logger.info(f"[FOUND] Model: {model_key} ({file_size:.2f}MB)")
        else:
            available_models[model_key] = {
                "filename": filename,
                "filepath": None,
                "size_mb": 0,
                "available": False
            }
            logger.warning(f"[MISSING] Model: {model_key} ({filename})")
    
    return available_models

def scan_checkpoints() -> List[Dict[str, Any]]:
    """Scan for checkpoint model files in the checkpoints directory.
    
    Returns:
        List of checkpoint file information with name, path, subfolder, and preview_image.
    """
    checkpoints = []
    
    if not os.path.exists(CHECKPOINTS_PATH):
        logger.warning(f"Checkpoints path not found: {CHECKPOINTS_PATH}")
        return checkpoints
    
    # Supported checkpoint file extensions
    checkpoint_extensions = ['.safetensors', '.ckpt', '.pt', '.bin']
    
    for root, dirs, files in os.walk(CHECKPOINTS_PATH):
        for file in files:
            if any(file.lower().endswith(ext) for ext in checkpoint_extensions):
                full_path = os.path.join(root, file)
                
                # Calculate relative subfolder from CHECKPOINTS_PATH
                rel_path = os.path.relpath(root, CHECKPOINTS_PATH)
                subfolder = rel_path if rel_path != '.' else ''
                
                # Look for preview images
                preview_image = None
                base_name = os.path.splitext(file)[0]
                for ext in ['.png', '.jpg', '.jpeg', '.webp']:
                    preview_path = os.path.join(root, base_name + ext)
                    if os.path.exists(preview_path):
                        # Store relative path from checkpoints folder
                        preview_rel_path = os.path.relpath(preview_path, CHECKPOINTS_PATH)
                        preview_image = preview_rel_path.replace('\\', '/')
                        break
                
                checkpoint_info = {
                    "name": file,
                    "path": full_path.replace('\\', '/'),
                    "subfolder": subfolder.replace('\\', '/'),
                    "size_mb": round(os.path.getsize(full_path) / (1024 * 1024), 2),
                    "preview_image": preview_image
                }
                checkpoints.append(checkpoint_info)
                
    logger.info(f"Scanned {len(checkpoints)} checkpoint files")
    return checkpoints

def scan_vaes() -> List[Dict[str, Any]]:
    """Scan for VAE model files in the vae directory.
    
    Returns:
        List of VAE file information with name, path, subfolder, and preview_image.
    """
    vaes = []
    
    if not os.path.exists(VAE_PATH):
        logger.warning(f"VAE path not found: {VAE_PATH}")
        return vaes
    
    # Supported VAE file extensions
    vae_extensions = ['.safetensors', '.ckpt', '.pt', '.bin']
    
    for root, dirs, files in os.walk(VAE_PATH):
        for file in files:
            if any(file.lower().endswith(ext) for ext in vae_extensions):
                full_path = os.path.join(root, file)
                
                # Calculate relative subfolder from VAE_PATH
                rel_path = os.path.relpath(root, VAE_PATH)
                subfolder = rel_path if rel_path != '.' else ''
                
                # Look for preview images
                preview_image = None
                base_name = os.path.splitext(file)[0]
                for ext in ['.png', '.jpg', '.jpeg', '.webp']:
                    preview_path = os.path.join(root, base_name + ext)
                    if os.path.exists(preview_path):
                        # Store relative path from vae folder
                        preview_rel_path = os.path.relpath(preview_path, VAE_PATH)
                        preview_image = preview_rel_path.replace('\\', '/')
                        break
                
                vae_info = {
                    "name": file,
                    "path": full_path.replace('\\', '/'),
                    "subfolder": subfolder.replace('\\', '/'),
                    "size_mb": round(os.path.getsize(full_path) / (1024 * 1024), 2),
                    "preview_image": preview_image
                }
                vaes.append(vae_info)
                
    logger.info(f"Scanned {len(vaes)} VAE files")
    return vaes

# System initialization: scan for available models
AVAILABLE_MODELS = scan_available_models()
available_count = len([m for m in AVAILABLE_MODELS.values() if m['available']])
total_count = len(AVAILABLE_MODELS)
logger.info(f"Model scan complete: {available_count}/{total_count} models available")

# Initialize enhanced preprocessing if available
ENHANCED_PROCESSING_ENABLED = False
if ENHANCED_PREPROCESSING_AVAILABLE:
    try:
        # Set up globals that the integration script expects
        globals()['PREPROCESSOR_MODELS_PATH'] = PREPROCESSOR_MODELS_PATH
        
        # Integrate enhanced preprocessors
        integration_success = integrate_enhanced_preprocessors()
        
        if integration_success:
            logger.info("Enhanced preprocessing system integrated successfully")
            ENHANCED_PROCESSING_ENABLED = True
        else:
            logger.warning("Enhanced preprocessing integration failed, using fallback")
    except Exception as e:
        logger.error(f"Enhanced preprocessing initialization failed: {e}")
        logger.info("Using standard preprocessing system")

# Model registry based on actual files
class ProcessorType(str, Enum):
    EDGE_DETECTION = "edge_detection"
    DEPTH_ESTIMATION = "depth_estimation" 
    POSE_ESTIMATION = "pose_estimation"
    SEGMENTATION = "segmentation"
    LINE_DETECTION = "line_detection"
    ENHANCEMENT = "enhancement"

# Real processor configuration - ONLY tested working models for preprocessing
PROCESSOR_REGISTRY = {
    # Depth Estimation - All working models
    "midas_v21": {
        "id": "midas_v21",
        "name": "MiDaS v2.1 Depth", 
        "type": ProcessorType.DEPTH_ESTIMATION,
        "category": "depth_normals",
        "available": AVAILABLE_MODELS.get("midas_v21", {}).get("available", False),
        "model_file": AVAILABLE_MODELS.get("midas_v21", {}).get("filepath"),
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
        "available": AVAILABLE_MODELS.get("dpt_hybrid", {}).get("available", False),
        "model_file": AVAILABLE_MODELS.get("dpt_hybrid", {}).get("filepath"),
        "backend": "pytorch",
        "parameters": {
            "near_plane": {"min": 0.1, "max": 10.0, "default": 0.1},
            "far_plane": {"min": 10.0, "max": 1000.0, "default": 100.0},
            "brightness": {"min": -0.5, "max": 0.5, "default": 0.1},
            "contrast": {"min": 0.5, "max": 3.0, "default": 1.2},
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
    }
}

# Built-in processing algorithms
def process_canny_opencv(image_array: np.ndarray, params: Dict[str, Any]) -> np.ndarray:
    """OpenCV Canny edge detection algorithm.
    
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
    """Built-in depth estimation fallback using brightness analysis.
    
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
    """Built-in pose estimation fallback using edge detection.
    
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

def process_depth_pytorch(image_array: np.ndarray, model_id: str, params: Dict[str, Any]) -> np.ndarray:
    """PyTorch-based depth estimation using MiDaS or DPT models.
    
    Args:
        image_array: Input image as numpy array (RGB)
        model_id: Model identifier ('midas_v21' or 'dpt_hybrid')
        params: Processing parameters including brightness, contrast, smoothing, depthStrength
        
    Returns:
        Processed depth map as RGB numpy array
        
    Raises:
        Exception: If PyTorch is unavailable or model loading fails
    """
    if not PYTORCH_AVAILABLE:
        raise Exception("PyTorch not available, cannot process depth with neural networks")
    
    # Get model file path
    model_info = AVAILABLE_MODELS.get(model_id, {})
    model_path = model_info.get("filepath")
    
    if not model_path or not os.path.exists(model_path):
        raise Exception(f"Model file not found: {model_path}")
    
    logger.info(f"[PYTORCH] Loading {model_id} from {model_path}")
    
    try:
        # Convert numpy array to PIL Image
        pil_image = Image.fromarray(image_array)
        logger.info(f"[PYTORCH] PIL image created: {pil_image.size}")
        
        # Load and run actual MiDaS model
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"[PYTORCH] Using device: {device}")
        
        # Load model using original MiDaS implementation
        try:
            # Add original MiDaS path to sys.path
            import sys
            midas_path = r"D:\MaDiS\MiDaS"
            if midas_path not in sys.path:
                sys.path.insert(0, midas_path)
            
            # Import original MiDaS implementation
            from midas.model_loader import load_model
            
            if model_id == "midas_v21":
                logger.info("[PYTORCH] Loading MiDaS v2.1 using original implementation")
                model, transform, net_w, net_h = load_model(device, model_path, "midas_v21_384", optimize=False)
                logger.info(f"[PYTORCH] MiDaS v2.1 loaded successfully from {model_path}")
                logger.info(f"[PYTORCH] Model input size: {net_w}x{net_h}")
            elif model_id == "dpt_hybrid":
                logger.info("[PYTORCH] Loading DPT Hybrid using original implementation")
                model, transform, net_w, net_h = load_model(device, model_path, "dpt_hybrid_384", optimize=False)
                logger.info(f"[PYTORCH] DPT Hybrid loaded successfully from {model_path}")
                logger.info(f"[PYTORCH] Model input size: {net_w}x{net_h}")
            else:
                raise Exception(f"Unsupported model_id: {model_id}. Supported: midas_v21, dpt_hybrid")
                
        except Exception as e:
            logger.error(f"[PYTORCH] Failed to load model with original MiDaS: {e}")
            raise Exception(f"Could not load {model_id} model: {e}")
        
        # Convert PIL to numpy in correct format for MiDaS
        # MiDaS expects RGB values in 0-1 range
        image_rgb = np.array(pil_image) / 255.0
        logger.info(f"[PYTORCH] Image converted to RGB: {image_rgb.shape}")
        
        # Apply MiDaS-specific transform (expects dict with 'image' key)
        input_tensor = transform({"image": image_rgb})["image"]
        input_tensor = torch.from_numpy(input_tensor).to(device).unsqueeze(0)
        logger.info(f"[PYTORCH] Input tensor prepared: {input_tensor.shape}")
        
        # Run actual model inference
        with torch.no_grad():
            depth_prediction = model(input_tensor)
            logger.info(f"[PYTORCH] Depth prediction: {depth_prediction.shape}")
            
            # Post-process the depth map
            depth_prediction = torch.nn.functional.interpolate(
                depth_prediction.unsqueeze(1),
                size=(image_array.shape[0], image_array.shape[1]),
                mode="bicubic",
                align_corners=False,
            ).squeeze()
            
            # Convert to numpy and normalize
            depth_numpy = depth_prediction.cpu().numpy()
            depth_numpy = (depth_numpy - depth_numpy.min()) / (depth_numpy.max() - depth_numpy.min())
            
            # Output RAW depth map - all adjustments handled by frontend
            logger.info("[PYTORCH] Outputting raw depth map (no backend processing)")
            
            # Keep raw depth map - no post-processing 
            # Frontend will handle: brightness, contrast, smoothing, depthStrength via CSS filters
            depth_numpy = np.clip(depth_numpy, 0, 1)  # Ensure values stay in range
            
            # DEBUG: Check actual depth values
            logger.info(f"[DEBUG] Depth range: {depth_numpy.min():.4f} to {depth_numpy.max():.4f}")
            logger.info(f"[DEBUG] Depth mean: {depth_numpy.mean():.4f}, std: {depth_numpy.std():.4f}")
            
            # Simple grayscale conversion for testing
            depth_8bit = (depth_numpy * 255).astype(np.uint8)
            logger.info(f"[DEBUG] 8-bit range: {depth_8bit.min()} to {depth_8bit.max()}")
            
            # Convert to RGB (simple grayscale)
            depth_rgb = np.stack([depth_8bit, depth_8bit, depth_8bit], axis=-1)
            logger.info("[PYTORCH] Simple grayscale conversion for debugging")
        
        logger.info(f"[PYTORCH] {model_id} processing completed with proper tensor handling")
        return depth_rgb
        
    except Exception as e:
        logger.error(f"[PYTORCH] Failed to process {model_id}: {e}")
        raise

# Processing function dispatcher
PROCESSING_FUNCTIONS = {
    "canny_opencv": process_canny_opencv,
    "depth_builtin": process_depth_builtin, 
    "openpose_builtin": process_openpose_builtin,
}

# API Models
class ProcessRequest(BaseModel):
    """Request model for v3 processing endpoint."""
    image: str = Field(..., description="Base64 encoded image data")
    processor: str = Field(..., description="Processor identifier")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Processing parameters")

class ProcessV2Request(BaseModel):
    """Request model for v2 processing endpoint (ControlNet compatible)."""
    image_base64: str = Field(..., description="Base64 encoded image with data: prefix")
    model_id: str = Field(..., description="Model ID (midas_v21, dpt_hybrid, etc.)")
    parameters: Dict[str, Any] = Field(
        default_factory=dict, 
        description="Processing parameters (brightness, contrast, smoothing, depthStrength)"
    )

class ProcessResponse(BaseModel):
    """Response model for processing endpoints."""
    success: bool = Field(..., description="Whether processing succeeded")
    processed_image: Optional[str] = Field(None, description="Base64 encoded processed image")
    processing_time: float = Field(..., description="Processing time in seconds")
    processor_used: str = Field(..., description="Actual processor used")
    fallback_used: bool = Field(False, description="Whether fallback processing was used")
    error: Optional[str] = None

# API Endpoints
@app.get("/")
async def root():
    """Health check"""
    return {"status": "running", "service": "CUBE Studio Unified Backend v4.0"}

@app.get("/api/processors")
async def get_processors():
    """Get all available processors"""
    processors = []
    for proc_id, config in PROCESSOR_REGISTRY.items():
        processors.append({
            "id": proc_id,
            "name": config["name"],
            "type": config["type"],
            "category": config["category"],
            "available": config["available"],
            "backend": config["backend"],
            "parameters": config["parameters"],
            "model_size_mb": AVAILABLE_MODELS.get(proc_id.replace("_builtin", ""), {}).get("size_mb", 0)
        })
    
    logger.info(f"[API] Processors list requested: {len(processors)} processors")
    return processors

@app.get("/api/processors/categories")
async def get_processor_categories():
    """Get processors organized by categories for 5-tab system"""
    categories = {
        "edge_lines": [],
        "depth_normals": [],
        "pose_human": [],
        "segmentation": [],
        "advanced": []
    }
    
    for proc_id, config in PROCESSOR_REGISTRY.items():
        category = config["category"]
        if category in categories:
            categories[category].append({
                "id": proc_id,
                "name": config["name"],
                "available": config["available"],
                "backend": config["backend"],
                "parameters": config["parameters"]
            })
    
    logger.info(f"[API] Categories requested: {sum(len(cat) for cat in categories.values())} processors in {len(categories)} categories")
    return categories

@app.get("/api/processors/stats")
async def get_processor_stats():
    """Get processor statistics"""
    total_processors = len(PROCESSOR_REGISTRY)
    available_processors = len([p for p in PROCESSOR_REGISTRY.values() if p["available"]])
    total_models = len(AVAILABLE_MODELS)
    available_models = len([m for m in AVAILABLE_MODELS.values() if m["available"]])
    
    stats = {
        "total_processors": total_processors,
        "available_processors": available_processors,
        "total_model_files": total_models,
        "available_model_files": available_models,
        "availability_rate": round(available_processors / total_processors * 100, 1),
        "model_availability_rate": round(available_models / total_models * 100, 1),
        "models_path": PREPROCESSOR_MODELS_PATH,
        "scan_time": datetime.datetime.now().isoformat()
    }
    
    logger.info(f"[API] Stats requested: {available_processors}/{total_processors} processors, {available_models}/{total_models} models")
    return stats

@app.get("/api/processors/enhanced")
async def get_enhanced_processors():
    """Get enhanced processor information and capabilities"""
    if not ENHANCED_PROCESSING_ENABLED:
        return {
            "available": False,
            "reason": "Enhanced processing system not available or not initialized"
        }
    
    try:
        enhanced_info = get_enhanced_processor_info()
        enhanced_stats = get_enhanced_processor_stats()
        
        return {
            "available": True,
            "processors": enhanced_info,
            "stats": enhanced_stats,
            "backend": "enhanced"
        }
    except Exception as e:
        logger.error(f"Error getting enhanced processor info: {e}")
        return {
            "available": False,
            "reason": f"Error retrieving enhanced processor information: {str(e)}"
        }

@app.get("/api/models/checkpoints")
async def get_checkpoints():
    """Get available checkpoint models"""
    try:
        checkpoints = scan_checkpoints()
        logger.info(f"[API] Checkpoints list requested: {len(checkpoints)} models found")
        return checkpoints
    except Exception as e:
        logger.error(f"[API] Error scanning checkpoints: {e}")
        raise HTTPException(status_code=500, detail=f"Error scanning checkpoints: {str(e)}")

@app.get("/api/models/vaes")
async def get_vaes():
    """Get available VAE models"""
    try:
        vaes = scan_vaes()
        logger.info(f"[API] VAEs list requested: {len(vaes)} models found")
        return vaes
    except Exception as e:
        logger.error(f"[API] Error scanning VAEs: {e}")
        raise HTTPException(status_code=500, detail=f"Error scanning VAEs: {str(e)}")

@app.get("/api/preprocessors")
async def get_preprocessors():
    """Get all available preprocessors (alias for /api/processors)"""
    processors = []
    for processor_id, config in PROCESSOR_REGISTRY.items():
        processors.append({
            "id": processor_id,
            "name": config["name"],
            "type": config["type"].value,
            "category": config["category"],
            "available": config["available"],
            "parameters": config["parameters"]
        })
    
    logger.info(f"[API] Preprocessors list requested: {len(processors)} preprocessors available")
    return processors

@app.post("/api/v3/process")
async def process_image_v3(request: ProcessRequest):
    """Unified processing endpoint v3"""
    start_time = time.time()
    
    try:
        # Validate processor
        if request.processor not in PROCESSOR_REGISTRY:
            raise HTTPException(status_code=400, detail=f"Unknown processor: {request.processor}")
        
        proc_config = PROCESSOR_REGISTRY[request.processor]
        
        # Decode image
        try:
            if request.image.startswith('data:image'):
                image_data = request.image.split(',')[1]
            else:
                image_data = request.image
            
            image_bytes = base64.b64decode(image_data)
            image_pil = Image.open(io.BytesIO(image_bytes)).convert('RGB')
            image_array = np.array(image_pil)
            
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Image decode error: {str(e)}")
        
        # Process image
        processed_array = None
        fallback_used = False
        
        if proc_config["available"] and request.processor in PROCESSING_FUNCTIONS:
            # Use built-in processor
            try:
                processed_array = PROCESSING_FUNCTIONS[request.processor](image_array, request.parameters)
                logger.info(f"[OK] Processed with built-in: {request.processor}")
            except Exception as e:
                logger.error(f"[ERROR] Built-in processing failed for {request.processor}: {e}")
                fallback_used = True
        
        elif proc_config["available"] and proc_config["backend"] == "pytorch":
            # PyTorch model processing
            try:
                if request.processor in ["midas_v21", "dpt_hybrid", "dpt_beit_large_512"]:
                    processed_array = process_depth_pytorch(image_array, request.processor, request.parameters)
                    logger.info(f"[OK] Processed with pytorch backend: {request.processor}")
                else:
                    logger.warning(f"[WARN] PyTorch processor {request.processor} not implemented, using fallback")
                    fallback_used = True
            except Exception as e:
                logger.error(f"[ERROR] PyTorch processing failed for {request.processor}: {e}")
                fallback_used = True
        
        else:
            # Model not available
            logger.warning(f"[WARN] Model not available for {request.processor}, using fallback")
            fallback_used = True
        
        # NO FALLBACK - If processing failed, return error
        if processed_array is None or fallback_used:
            error_msg = f"Processing failed for {request.processor}. Backend processing is required."
            logger.error(f"[CRITICAL] {error_msg}")
            raise HTTPException(status_code=500, detail=error_msg)
        
        # Convert back to base64
        processed_pil = Image.fromarray(processed_array)
        buffer = io.BytesIO()
        processed_pil.save(buffer, format='PNG')
        processed_b64 = base64.b64encode(buffer.getvalue()).decode()
        
        processing_time = time.time() - start_time
        
        response = ProcessResponse(
            success=True,
            processed_image=f"data:image/png;base64,{processed_b64}",
            processing_time=round(processing_time, 3),
            processor_used=request.processor,
            fallback_used=fallback_used
        )
        
        logger.info(f"[PROCESS] Processing complete: {request.processor} ({processing_time:.3f}s, fallback: {fallback_used})")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"[ERROR] Processing error: {e}")
        return ProcessResponse(
            success=False,
            processing_time=round(processing_time, 3),
            processor_used=request.processor,
            error=str(e)
        )

@app.post("/api/v2/process")
async def process_v2(request: ProcessV2Request):
    """Process image with specific model (v2 API compatible with frontend)"""
    start_time = time.time()
    
    try:
        logger.info(f"[V2-API] Processing request - Model: {request.model_id}")
        logger.info(f"[V2-API] Parameters received: {request.parameters}")
        
        # Extract image data
        image_base64 = request.image_base64
        if image_base64.startswith('data:image'):
            image_base64 = image_base64.split(',', 1)[1]
        
        # Decode image
        image_data = base64.b64decode(image_base64)
        image_pil = Image.open(io.BytesIO(image_data))
        image_array = np.array(image_pil.convert('RGB'))
        
        logger.info(f"[V2-API] Image loaded: {image_array.shape}")
        
        # Process based on model_id
        processed_array = None
        if request.model_id in ['midas_v21', 'dpt_hybrid']:
            # Use PyTorch processing for these models
            logger.info(f"[V2-API] Using PyTorch processing for {request.model_id}")
            processed_array = process_depth_pytorch(image_array, request.model_id, request.parameters)
        else:
            # Use builtin fallback for other models
            logger.info(f"[V2-API] Using builtin processing for {request.model_id}")
            processed_array = process_depth_builtin(image_array, request.parameters)
        
        # Convert result to base64
        if processed_array is not None:
            processed_pil = Image.fromarray(processed_array)
            buffer = io.BytesIO()
            processed_pil.save(buffer, format='PNG')
            processed_b64 = base64.b64encode(buffer.getvalue()).decode()
            
            processing_time = time.time() - start_time
            logger.info(f"[V2-API] Processing complete: {processing_time:.3f}s")
            
            return {
                "success": True,
                "image_base64": f"data:image/png;base64,{processed_b64}",
                "processing_time": round(processing_time, 3),
                "model_used": request.model_id
            }
        else:
            raise Exception("Processing failed - no result")
            
    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"[V2-API] Processing error: {e}")
        return {
            "success": False,
            "error": str(e),
            "processing_time": round(processing_time, 3)
        }

if __name__ == "__main__":
    logger.info("[START] Starting CUBE Studio Unified Backend v4.0")
    logger.info(f"[PATH] Models path: {PREPROCESSOR_MODELS_PATH}")
    logger.info(f"[SCAN] Available models: {len([m for m in AVAILABLE_MODELS.values() if m['available']])}/{len(AVAILABLE_MODELS)}")
    
    uvicorn.run(app, host="0.0.0.0", port=9004, log_level="info")