#!/usr/bin/env python3
"""
CUBE Studio - Unified Backend Service (v4.0)
Real preprocessor implementation with actual model file scanning
"""

import os
import json
import base64
import io
import logging
import time
from pathlib import Path
from typing import List, Dict, Optional, Union, Any
from enum import Enum
from dataclasses import dataclass, field
from functools import wraps
import glob

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import numpy as np
import cv2
from PIL import Image
import datetime

# PyTorch imports (with graceful fallback)
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torchvision.transforms import Compose, Resize, ToTensor, Normalize
    PYTORCH_AVAILABLE = True
    print("[OK] PyTorch loaded successfully")
except ImportError as e:
    PYTORCH_AVAILABLE = False
    print(f"[ERROR] PyTorch not available: {e}")

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

# Real model file mapping based on actual files
REAL_MODEL_FILES = {
    # Depth models
    "dpt_hybrid": "dpt_hybrid-midas-501f0c75.pt",
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

def scan_available_models():
    """실제 모델 파일 스캔"""
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

# 시스템 시작 시 모델 스캔
AVAILABLE_MODELS = scan_available_models()
logger.info(f"[SCAN] Model scan complete: {len([m for m in AVAILABLE_MODELS.values() if m['available']])}/{len(AVAILABLE_MODELS)} models available")

# Model registry based on actual files
class ProcessorType(str, Enum):
    EDGE_DETECTION = "edge_detection"
    DEPTH_ESTIMATION = "depth_estimation" 
    POSE_ESTIMATION = "pose_estimation"
    SEGMENTATION = "segmentation"
    LINE_DETECTION = "line_detection"
    ENHANCEMENT = "enhancement"

# Real processor configuration based on available models
PROCESSOR_REGISTRY = {
    # Edge Detection
    "canny_builtin": {
        "id": "canny_builtin",
        "name": "Canny (Built-in)",
        "type": ProcessorType.EDGE_DETECTION,
        "category": "edge_lines",
        "available": True,  # Always available
        "model_file": None,
        "backend": "builtin",
        "parameters": {
            "low_threshold": {"min": 0, "max": 255, "default": 100},
            "high_threshold": {"min": 0, "max": 255, "default": 200},
        }
    },
    "hed": {
        "id": "hed", 
        "name": "HED Edge Detection",
        "type": ProcessorType.EDGE_DETECTION,
        "category": "edge_lines",
        "available": AVAILABLE_MODELS.get("hed", {}).get("available", False),
        "model_file": AVAILABLE_MODELS.get("hed", {}).get("filepath"),
        "backend": "pytorch",
        "parameters": {
            "threshold": {"min": 0.0, "max": 1.0, "default": 0.5},
        }
    },
    
    # Depth Estimation
    "depth_builtin": {
        "id": "depth_builtin",
        "name": "Depth (Built-in)",
        "type": ProcessorType.DEPTH_ESTIMATION,
        "category": "depth_normals",
        "available": True,
        "model_file": None,
        "backend": "builtin",
        "parameters": {
            "contrast": {"min": 0.5, "max": 3.0, "default": 1.2},
            "brightness": {"min": -0.5, "max": 0.5, "default": 0.1},
        }
    },
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
        }
    },
    "dpt_hybrid": {
        "id": "dpt_hybrid",
        "name": "DPT-Hybrid Depth",
        "type": ProcessorType.DEPTH_ESTIMATION, 
        "category": "depth_normals",
        "available": AVAILABLE_MODELS.get("dpt_hybrid", {}).get("available", False),
        "model_file": AVAILABLE_MODELS.get("dpt_hybrid", {}).get("filepath"),
        "backend": "pytorch",
        "parameters": {
            "near_plane": {"min": 0.1, "max": 10.0, "default": 0.1},
            "far_plane": {"min": 10.0, "max": 1000.0, "default": 100.0},
        }
    },
    
    # Pose Estimation
    "openpose_builtin": {
        "id": "openpose_builtin",
        "name": "OpenPose (Built-in)", 
        "type": ProcessorType.POSE_ESTIMATION,
        "category": "pose_human",
        "available": True,
        "model_file": None,
        "backend": "builtin",
        "parameters": {
            "detect_body": {"type": "boolean", "default": True},
            "detect_hand": {"type": "boolean", "default": False},
            "detect_face": {"type": "boolean", "default": False},
        }
    },
    "openpose_body": {
        "id": "openpose_body",
        "name": "OpenPose Body",
        "type": ProcessorType.POSE_ESTIMATION,
        "category": "pose_human", 
        "available": AVAILABLE_MODELS.get("body_pose", {}).get("available", False),
        "model_file": AVAILABLE_MODELS.get("body_pose", {}).get("filepath"),
        "backend": "pytorch",
        "parameters": {
            "body_threshold": {"min": 0.1, "max": 1.0, "default": 0.4},
        }
    },
    "openpose_hand": {
        "id": "openpose_hand",
        "name": "OpenPose Hand",
        "type": ProcessorType.POSE_ESTIMATION,
        "category": "pose_human",
        "available": AVAILABLE_MODELS.get("hand_pose", {}).get("available", False),
        "model_file": AVAILABLE_MODELS.get("hand_pose", {}).get("filepath"),
        "backend": "pytorch",
        "parameters": {
            "hand_threshold": {"min": 0.1, "max": 1.0, "default": 0.4},
        }
    },
    
    # Segmentation
    "oneformer_coco": {
        "id": "oneformer_coco", 
        "name": "OneFormer COCO",
        "type": ProcessorType.SEGMENTATION,
        "category": "segmentation",
        "available": AVAILABLE_MODELS.get("oneformer_coco", {}).get("available", False),
        "model_file": AVAILABLE_MODELS.get("oneformer_coco", {}).get("filepath"),
        "backend": "pytorch",
        "parameters": {
            "num_classes": {"min": 1, "max": 133, "default": 133},
        }
    },
    "oneformer_ade20k": {
        "id": "oneformer_ade20k",
        "name": "OneFormer ADE20K", 
        "type": ProcessorType.SEGMENTATION,
        "category": "segmentation",
        "available": AVAILABLE_MODELS.get("oneformer_ade20k", {}).get("available", False),
        "model_file": AVAILABLE_MODELS.get("oneformer_ade20k", {}).get("filepath"),
        "backend": "pytorch",
        "parameters": {
            "num_classes": {"min": 1, "max": 150, "default": 150},
        }
    },
    
    # Line Detection
    "mlsd": {
        "id": "mlsd",
        "name": "M-LSD Line Detection",
        "type": ProcessorType.LINE_DETECTION,
        "category": "advanced",
        "available": AVAILABLE_MODELS.get("mlsd", {}).get("available", False),
        "model_file": AVAILABLE_MODELS.get("mlsd", {}).get("filepath"),
        "backend": "pytorch",
        "parameters": {
            "score_threshold": {"min": 0.0, "max": 1.0, "default": 0.1},
            "distance_threshold": {"min": 0.0, "max": 100.0, "default": 20.0},
        }
    }
}

# Built-in processing algorithms
def process_canny_builtin(image_array, params):
    """Built-in Canny edge detection"""
    gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY) if len(image_array.shape) == 3 else image_array
    low_threshold = params.get('low_threshold', 100)
    high_threshold = params.get('high_threshold', 200)
    
    edges = cv2.Canny(gray, low_threshold, high_threshold)
    return cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)

def process_depth_builtin(image_array, params):
    """Built-in depth estimation using brightness"""
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

def process_openpose_builtin(image_array, params):
    """Built-in pose estimation placeholder"""
    # For now, return a simple skeletal outline
    gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY) if len(image_array.shape) == 3 else image_array
    edges = cv2.Canny(gray, 50, 150)
    
    # Simple skeleton simulation
    kernel = np.ones((3, 3), np.uint8)
    skeleton = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
    
    return cv2.cvtColor(skeleton, cv2.COLOR_GRAY2RGB)

def process_depth_pytorch(image_array, model_id, params):
    """PyTorch-based depth estimation using MiDaS or DPT models"""
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
        
        # Load model using torch.hub for compatibility
        try:
            if model_id == "midas_v21":
                logger.info("[PYTORCH] Loading MiDaS v2.1 from torch.hub")
                model = torch.hub.load('intel-isl/MiDaS', 'MiDaS', pretrained=True)
                midas_transforms = torch.hub.load('intel-isl/MiDaS', 'transforms')
                transform = midas_transforms.default_transform
            elif model_id == "dpt_hybrid":
                logger.info("[PYTORCH] Loading DPT-Hybrid from torch.hub") 
                model = torch.hub.load('intel-isl/MiDaS', 'DPT_Hybrid', pretrained=True)
                midas_transforms = torch.hub.load('intel-isl/MiDaS', 'transforms')
                transform = midas_transforms.dpt_transform
            else:
                raise Exception(f"Unsupported model_id: {model_id}")
                
            model.to(device)
            model.eval()
            logger.info(f"[PYTORCH] {model_id} model loaded successfully")
            
        except Exception as e:
            logger.error(f"[PYTORCH] Failed to load model from torch.hub: {e}")
            logger.info("[PYTORCH] Trying to load from local file...")
            
            # Fallback: try to load from local file
            try:
                model_state = torch.load(model_path, map_location=device)
                if model_id == "midas_v21":
                    model = torch.hub.load('intel-isl/MiDaS', 'MiDaS', pretrained=False)
                    midas_transforms = torch.hub.load('intel-isl/MiDaS', 'transforms')
                    transform = midas_transforms.default_transform
                else:  # dpt_hybrid
                    model = torch.hub.load('intel-isl/MiDaS', 'DPT_Hybrid', pretrained=False)
                    midas_transforms = torch.hub.load('intel-isl/MiDaS', 'transforms')
                    transform = midas_transforms.dpt_transform
                    
                model.load_state_dict(model_state, strict=False)
                model.to(device)
                model.eval()
                logger.info(f"[PYTORCH] {model_id} loaded from local file")
                
            except Exception as local_error:
                logger.error(f"[PYTORCH] Failed to load from local file: {local_error}")
                raise Exception(f"Could not load {model_id} model")
        
        # Apply MiDaS-specific transform
        input_tensor = transform(pil_image).unsqueeze(0).to(device)
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
            
            # Apply ALL user parameters AFTER depth estimation
            brightness = params.get('brightness', 0.0)    # -1 to 1
            contrast = params.get('contrast', 1.0)        # 0.5 to 2.0
            smoothing = params.get('smoothing', 0)        # 0 to 5 (blur radius)
            depth_strength = params.get('depthStrength', 1.0)  # 0.5 to 2.0
            
            logger.info(f"[PYTORCH] Applying post-processing: brightness={brightness}, contrast={contrast}, smoothing={smoothing}, depthStrength={depth_strength}")
            
            # Apply depth strength (enhance depth differences)
            if depth_strength != 1.0:
                depth_center = 0.5
                depth_numpy = depth_center + (depth_numpy - depth_center) * depth_strength
                logger.info(f"[PYTORCH] Applied depth strength: {depth_strength}")
            
            # Apply smoothing (Gaussian blur)
            if smoothing > 0:
                kernel_size = max(1, int(smoothing * 2) + 1)  # Convert to odd kernel size
                depth_numpy = cv2.GaussianBlur(depth_numpy, (kernel_size, kernel_size), smoothing)
                logger.info(f"[PYTORCH] Applied smoothing: kernel_size={kernel_size}, sigma={smoothing}")
            
            # Apply contrast and brightness
            depth_numpy = depth_numpy * contrast + brightness
            depth_numpy = np.clip(depth_numpy, 0, 1)  # Ensure values stay in range
            
            # Convert to 0-255 range
            depth_numpy = (depth_numpy * 255).astype(np.uint8)
            
            # Convert to RGB
            depth_rgb = np.stack([depth_numpy, depth_numpy, depth_numpy], axis=-1)
        
        logger.info(f"[PYTORCH] {model_id} processing completed with proper tensor handling")
        return depth_rgb
        
    except Exception as e:
        logger.error(f"[PYTORCH] Failed to process {model_id}: {e}")
        raise

# Processing function dispatcher
PROCESSING_FUNCTIONS = {
    "canny_builtin": process_canny_builtin,
    "depth_builtin": process_depth_builtin, 
    "openpose_builtin": process_openpose_builtin,
}

# API Models
class ProcessRequest(BaseModel):
    image: str  # Base64 encoded image
    processor: str
    parameters: Dict[str, Any] = Field(default_factory=dict)

class ProcessV2Request(BaseModel):
    image_base64: str  # Base64 encoded image with data: prefix
    model_id: str     # Model ID (midas_v21, dpt_hybrid, etc.)
    parameters: Dict[str, Any] = Field(default_factory=dict)

class ProcessResponse(BaseModel):
    success: bool
    processed_image: Optional[str] = None
    processing_time: float
    processor_used: str
    fallback_used: bool = False
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
                if request.processor in ["midas_v21", "dpt_hybrid"]:
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
        
        # Fallback processing
        if processed_array is None or fallback_used:
            # Use most appropriate fallback
            if proc_config["type"] == ProcessorType.EDGE_DETECTION:
                processed_array = process_canny_builtin(image_array, {"low_threshold": 100, "high_threshold": 200})
            elif proc_config["type"] == ProcessorType.DEPTH_ESTIMATION:
                processed_array = process_depth_builtin(image_array, {"contrast": 1.2, "brightness": 0.1})
            elif proc_config["type"] == ProcessorType.POSE_ESTIMATION:
                processed_array = process_openpose_builtin(image_array, {})
            else:
                # Generic edge detection fallback
                processed_array = process_canny_builtin(image_array, {"low_threshold": 100, "high_threshold": 200})
            
            fallback_used = True
        
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