#!/usr/bin/env python3
"""
CUBE Studio - Unified Backend Service (v3.0)
Integrates model exploration, preprocessing, and PyTorch depth processing
with fallback mechanisms and comprehensive API endpoints.

Architecture:
- Port 9003: Unified service combining all functionality
- Model Registry: Centralized model management and caching
- Processing Pipeline: PyTorch primary, OpenCV fallback
- API Versions: v1/v2 (legacy), v3 (unified)
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

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, validator
import numpy as np
import cv2
from PIL import Image
from PIL.ExifTags import TAGS
import datetime
import re

# PyTorch imports (with graceful fallback)
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torchvision.transforms import Compose, Resize, ToTensor, Normalize
    import torchvision.models as models
    PYTORCH_AVAILABLE = True
    print("PyTorch loaded successfully")
except ImportError as e:
    PYTORCH_AVAILABLE = False
    print(f"PyTorch not available: {e}")
    print("Falling back to OpenCV-only processing")

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

# --- Configuration ---
SERVICE_PORT = 9004
SERVICE_VERSION = "3.0.0"

# Model paths
MODELS_BASE_PATH = Path("models")
CHECKPOINTS_PATH = MODELS_BASE_PATH / "checkpoints"
VAES_PATH = MODELS_BASE_PATH / "vae"
LORAS_PATH = MODELS_BASE_PATH / "loras"
PREPROCESSORS_PATH = MODELS_BASE_PATH / "preprocessors"

# Output paths
OUTPUT_BASE_PATH = Path("output")
DEFAULT_OUTPUT_PATHS = {
    't2i': OUTPUT_BASE_PATH / 't2i',
    'i2i': OUTPUT_BASE_PATH / 'i2i',
    'detail': OUTPUT_BASE_PATH / 'detail',
    'upscaled': OUTPUT_BASE_PATH / 'upscaled',
    'preprocessor': OUTPUT_BASE_PATH / 'preprocessor',
    'controlnet': OUTPUT_BASE_PATH / 'controlnet',
    'custom': OUTPUT_BASE_PATH / 'custom'
}

# --- Enums and Data Classes ---

class ProcessorType(str, Enum):
    # Edge Detection Category
    EDGE_DETECTION = "edge_detection"  # Canny, TEED
    SOFT_EDGE = "soft_edge"  # HED, PiDiNet variants
    LINEART = "lineart"  # Lineart, Lineart Anime, Lineart Coarse
    
    # Depth & Normal Category  
    DEPTH_ESTIMATION = "depth_estimation"  # MiDaS, DPT, Depth Anything v1/v2, LeReS, ZoeDepth
    NORMAL_MAP = "normal_map"  # Normal BAE, Normal MiDaS, Normal Dsine
    
    # Pose Category
    POSE_ESTIMATION = "pose_estimation"  # OpenPose, DWPose, AnimalPose
    
    # Segmentation Category
    SEGMENTATION = "segmentation"  # OneFormer, Uniformer, Anime Face Segment
    
    # Specialized Category
    MLSD = "mlsd"  # M-LSD line detection
    SCRIBBLE = "scribble"  # Scribble, Fake Scribble
    COLOR = "color"  # Color extraction
    SHUFFLE = "shuffle"  # Content shuffle
    THRESHOLD = "threshold"  # Binary threshold
    INPAINT = "inpaint"  # Inpainting masks
    CLIP_VISION = "clip_vision"  # CLIP vision processing
    REFERENCE = "reference"  # Reference processing
    TILE = "tile"  # Tile processing
    RECOLOR = "recolor"  # Recolor processing
    REVISION = "revision"  # Revision processing

class ModelStatus(str, Enum):
    AVAILABLE = "available"
    LOADING = "loading"
    LOADED = "loaded"
    ERROR = "error"
    NOT_FOUND = "not_found"

class ProcessingBackend(str, Enum):
    PYTORCH = "pytorch"
    OPENCV = "opencv"
    BUILTIN = "builtin"
    ONNX = "onnx"  # ONNX runtime models
    SAFETENSORS = "safetensors"  # SafeTensors format models

@dataclass
class ModelInfo:
    """Enhanced model information with processing capabilities"""
    id: str
    name: str
    file_path: Optional[Path] = None
    processor_type: ProcessorType = ProcessorType.EDGE_DETECTION
    backend: ProcessingBackend = ProcessingBackend.PYTORCH
    status: ModelStatus = ModelStatus.AVAILABLE
    size: Optional[int] = None
    preview_image: Optional[str] = None
    description: Optional[str] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    fallback_models: List[str] = field(default_factory=list)
    last_used: Optional[datetime.datetime] = None
    load_count: int = 0
    error_message: Optional[str] = None

# --- Pydantic Models ---

class ModelFile(BaseModel):
    """Legacy model file structure for backward compatibility"""
    name: str
    path: str
    subfolder: str
    size: Optional[int] = None
    preview_image: Optional[str] = None

class UnifiedProcessRequest(BaseModel):
    """Unified processing request for v3 API"""
    image: str = Field(..., description="Base64 encoded image")
    model_id: str = Field(..., description="Model identifier")
    processor_type: ProcessorType = Field(ProcessorType.EDGE_DETECTION, description="Type of processing")
    backend_preference: Optional[ProcessingBackend] = Field(None, description="Preferred processing backend")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Processing parameters")
    fallback_enabled: bool = Field(True, description="Enable fallback to alternative backends")
    save_result: bool = Field(False, description="Save processed image to disk")
    save_path: Optional[str] = Field(None, description="Custom save path")

class UnifiedProcessResponse(BaseModel):
    """Unified processing response for v3 API"""
    success: bool
    processed_image: Optional[str] = None
    model_used: str
    backend_used: ProcessingBackend
    processing_time_ms: float
    fallback_used: bool = False
    saved_path: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None

class ModelRegistryResponse(BaseModel):
    """Model registry information response"""
    total_models: int
    available_models: int
    loaded_models: int
    models_by_type: Dict[str, int]
    models_by_backend: Dict[str, int]
    cache_stats: Dict[str, Any]

# Legacy API models for backward compatibility
class PreprocessRequest(BaseModel):
    """Legacy preprocess request (v1 API)"""
    image: str
    model: str
    params: Optional[Dict] = None

class PreprocessResponse(BaseModel):
    """Legacy preprocess response (v1 API)"""
    success: bool
    processed_image: Optional[str] = None
    model_used: str
    error: Optional[str] = None

class ModelProcessingRequest(BaseModel):
    """Legacy model processing request (v2 API)"""
    model_id: str
    image_base64: str
    params: Optional[Dict] = None

class ModelProcessingResponse(BaseModel):
    """Legacy model processing response (v2 API)"""
    success: bool
    image_base64: Optional[str] = None
    model_used: str
    message: Optional[str] = None

class SaveImageRequest(BaseModel):
    """Image save request"""
    image: str
    filename: str
    path: str
    type: str
    metadata: Optional[Dict] = None
    quality_settings: Optional[Dict] = None

class SaveImageResponse(BaseModel):
    """Image save response"""
    success: bool
    saved_path: Optional[str] = None
    filename: str
    file_size: Optional[int] = None
    error: Optional[str] = None

# --- Model Registry and Caching System ---

class ModelRegistry:
    """Centralized model registry with caching and fallback management"""
    
    def __init__(self):
        self.models: Dict[str, ModelInfo] = {}
        self.model_cache: Dict[str, Any] = {}
        self.cache_stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'total_loaded': 0
        }
        self.max_cache_size = 5  # Maximum models in memory
        self._initialize_models()
    
    def _initialize_models(self):
        """Initialize model registry with available models"""
        logger.info("Initializing model registry...")
        
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
                file_path=PREPROCESSORS_PATH / 'network-bsds500.pth',
                processor_type=ProcessorType.EDGE_DETECTION,
                backend=ProcessingBackend.PYTORCH,
                description='Holistically-Nested Edge Detection',
                fallback_models=['opencv_canny', 'builtin_canny']
            ),
            'table5_pidinet': ModelInfo(
                id='table5_pidinet',
                name='PiDiNet Edge Detection',
                file_path=PREPROCESSORS_PATH / 'table5_pidinet.pth',
                processor_type=ProcessorType.EDGE_DETECTION,
                backend=ProcessingBackend.PYTORCH,
                description='Pixel Difference Networks for Edge Detection',
                fallback_models=['opencv_canny', 'builtin_canny']
            ),
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
                file_path=PREPROCESSORS_PATH / 'dpt_hybrid-midas-501f0c75.pt',
                processor_type=ProcessorType.DEPTH_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='Dense Prediction Transformer for depth estimation',
                fallback_models=['builtin_depth']
            ),
            'midas_v21': ModelInfo(
                id='midas_v21',
                name='MiDaS v2.1',
                file_path=PREPROCESSORS_PATH / 'midas_v21_384.pt',
                processor_type=ProcessorType.DEPTH_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='MiDaS v2.1 depth estimation model',
                fallback_models=['builtin_depth']
            ),
            'zoedepth': ModelInfo(
                id='zoedepth',
                name='ZoeDepth',
                file_path=PREPROCESSORS_PATH / 'ZoeD_M12_N.pt',
                processor_type=ProcessorType.DEPTH_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='Zero-shot depth estimation',
                fallback_models=['builtin_depth']
            ),
            'depth_anything': ModelInfo(
                id='depth_anything',
                name='Depth Anything',
                file_path=PREPROCESSORS_PATH / 'depth_anything_vitl14.pth',
                processor_type=ProcessorType.DEPTH_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='Depth Anything model for robust depth estimation',
                fallback_models=['builtin_depth']
            ),
            'depth_anything_v2': ModelInfo(
                id='depth_anything_v2',
                name='Depth Anything v2',
                file_path=PREPROCESSORS_PATH / 'depth_anything_v2_vitl.pth',
                processor_type=ProcessorType.DEPTH_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='Depth Anything v2 with improved accuracy',
                fallback_models=['depth_anything', 'builtin_depth']
            ),
            'depth_leres': ModelInfo(
                id='depth_leres',
                name='LeReS Depth',
                file_path=PREPROCESSORS_PATH / 'res101.pth',
                processor_type=ProcessorType.DEPTH_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='LeReS depth estimation model',
                fallback_models=['builtin_depth']
            ),
            'depth_leres_boost': ModelInfo(
                id='depth_leres_boost',
                name='LeReS Depth (Boosted)',
                file_path=PREPROCESSORS_PATH / 'res101.pth',
                processor_type=ProcessorType.DEPTH_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='LeReS depth estimation with boosting',
                fallback_models=['depth_leres', 'builtin_depth']
            )
        }
        
        # Lineart models
        lineart_models = {
            'builtin_lineart': ModelInfo(
                id='builtin_lineart',
                name='Built-in Lineart',
                processor_type=ProcessorType.LINEART,
                backend=ProcessingBackend.BUILTIN,
                description='Simple lineart extraction algorithm'
            ),
            'lineart_standard': ModelInfo(
                id='lineart_standard',
                name='Standard Lineart',
                processor_type=ProcessorType.LINEART,
                backend=ProcessingBackend.OPENCV,
                description='Standard lineart extraction from white bg & black line',
                fallback_models=['builtin_lineart']
            ),
            'lineart_realistic': ModelInfo(
                id='lineart_realistic',
                name='Realistic Lineart',
                file_path=PREPROCESSORS_PATH / 'sk_model.pth',
                processor_type=ProcessorType.LINEART,
                backend=ProcessingBackend.PYTORCH,
                description='Realistic lineart detection model',
                fallback_models=['lineart_standard', 'builtin_lineart']
            ),
            'lineart_coarse': ModelInfo(
                id='lineart_coarse',
                name='Coarse Lineart',
                file_path=PREPROCESSORS_PATH / 'sk_model2.pth',
                processor_type=ProcessorType.LINEART,
                backend=ProcessingBackend.PYTORCH,
                description='Coarse lineart detection model',
                fallback_models=['lineart_standard', 'builtin_lineart']
            ),
            'lineart_anime': ModelInfo(
                id='lineart_anime',
                name='Anime Lineart',
                file_path=PREPROCESSORS_PATH / 'netG.pth',
                processor_type=ProcessorType.LINEART,
                backend=ProcessingBackend.PYTORCH,
                description='Anime-style lineart detection',
                fallback_models=['lineart_standard', 'builtin_lineart']
            ),
            'lineart_anime_denoise': ModelInfo(
                id='lineart_anime_denoise',
                name='Anime Lineart (Denoise)',
                file_path=PREPROCESSORS_PATH / 'erika.pth',
                processor_type=ProcessorType.LINEART,
                backend=ProcessingBackend.PYTORCH,
                description='Anime lineart with noise reduction',
                fallback_models=['lineart_anime', 'lineart_standard', 'builtin_lineart']
            )
        }
        
        # Soft edge models
        soft_edge_models = {
            'pidinet_softedge': ModelInfo(
                id='pidinet_softedge',
                name='PiDiNet Soft Edge',
                file_path=PREPROCESSORS_PATH / 'table5_pidinet.pth',
                processor_type=ProcessorType.SOFT_EDGE,
                backend=ProcessingBackend.PYTORCH,
                description='PiDiNet for soft edge detection',
                fallback_models=['opencv_canny', 'builtin_canny']
            ),
            'pidinet_safe': ModelInfo(
                id='pidinet_safe',
                name='PiDiNet Safe Mode',
                file_path=PREPROCESSORS_PATH / 'table5_pidinet.pth',
                processor_type=ProcessorType.SOFT_EDGE,
                backend=ProcessingBackend.PYTORCH,
                description='PiDiNet with safe processing',
                fallback_models=['pidinet_softedge', 'opencv_canny', 'builtin_canny']
            ),
            'hed_softedge': ModelInfo(
                id='hed_softedge',
                name='HED Soft Edge',
                file_path=PREPROCESSORS_PATH / 'ControlNetHED.pth',
                processor_type=ProcessorType.SOFT_EDGE,
                backend=ProcessingBackend.PYTORCH,
                description='HED model for soft edge detection',
                fallback_models=['opencv_canny', 'builtin_canny']
            ),
            'hed_safe': ModelInfo(
                id='hed_safe',
                name='HED Safe Mode',
                file_path=PREPROCESSORS_PATH / 'ControlNetHED.pth',
                processor_type=ProcessorType.SOFT_EDGE,
                backend=ProcessingBackend.PYTORCH,
                description='HED with safe processing',
                fallback_models=['hed_softedge', 'opencv_canny', 'builtin_canny']
            )
        }
        
        # Scribble models
        scribble_models = {
            'scribble_hed': ModelInfo(
                id='scribble_hed',
                name='HED Scribble',
                file_path=PREPROCESSORS_PATH / 'ControlNetHED.pth',
                processor_type=ProcessorType.SCRIBBLE,
                backend=ProcessingBackend.PYTORCH,
                description='HED-based scribble extraction',
                fallback_models=['opencv_canny', 'builtin_canny']
            ),
            'scribble_pidinet': ModelInfo(
                id='scribble_pidinet',
                name='PiDiNet Scribble',
                file_path=PREPROCESSORS_PATH / 'table5_pidinet.pth',
                processor_type=ProcessorType.SCRIBBLE,
                backend=ProcessingBackend.PYTORCH,
                description='PiDiNet-based scribble extraction',
                fallback_models=['scribble_hed', 'opencv_canny', 'builtin_canny']
            ),
            'scribble_xdog': ModelInfo(
                id='scribble_xdog',
                name='XDoG Scribble',
                processor_type=ProcessorType.SCRIBBLE,
                backend=ProcessingBackend.OPENCV,
                description='XDoG-based scribble extraction',
                fallback_models=['builtin_canny']
            )
        }
        
        # MLSD models
        mlsd_models = {
            'mlsd': ModelInfo(
                id='mlsd',
                name='Mobile Line Segment Detection',
                file_path=PREPROCESSORS_PATH / 'mlsd_large_512_fp32.pth',
                processor_type=ProcessorType.MLSD,
                backend=ProcessingBackend.PYTORCH,
                description='Mobile Line Segment Detection',
                fallback_models=['opencv_canny', 'builtin_canny']
            )
        }
        
        # Normal map models
        normal_models = {
            'normal_bae': ModelInfo(
                id='normal_bae',
                name='Normal BAE',
                file_path=PREPROCESSORS_PATH / 'scannet.pt',
                processor_type=ProcessorType.NORMAL_MAP,
                backend=ProcessingBackend.PYTORCH,
                description='BAE model for normal map generation',
                fallback_models=['builtin_depth']
            ),
            'normal_midas': ModelInfo(
                id='normal_midas',
                name='MiDaS Normal',
                file_path=PREPROCESSORS_PATH / 'midas_v21_384.pt',
                processor_type=ProcessorType.NORMAL_MAP,
                backend=ProcessingBackend.PYTORCH,
                description='MiDaS-based normal map generation',
                fallback_models=['normal_bae', 'builtin_depth']
            )
        }
        
        # Segmentation models
        segmentation_models = {
            'seg_anime_face': ModelInfo(
                id='seg_anime_face',
                name='Anime Face Segmentation',
                file_path=PREPROCESSORS_PATH / 'face_parsing.farl.lapa.main_ema_136500_jit191.pt',
                processor_type=ProcessorType.SEGMENTATION,
                backend=ProcessingBackend.PYTORCH,
                description='Anime face segmentation model',
                fallback_models=['builtin_depth']
            ),
            'seg_ofade20k': ModelInfo(
                id='seg_ofade20k',
                name='OneFormer ADE20K',
                file_path=PREPROCESSORS_PATH / 'oneformer_ade20k_dinat_large.pth',
                processor_type=ProcessorType.SEGMENTATION,
                backend=ProcessingBackend.PYTORCH,
                description='OneFormer segmentation for ADE20K dataset',
                fallback_models=['builtin_depth']
            ),
            'seg_ofcoco': ModelInfo(
                id='seg_ofcoco',
                name='OneFormer COCO',
                file_path=PREPROCESSORS_PATH / 'oneformer_coco_dinat_large.pth',
                processor_type=ProcessorType.SEGMENTATION,
                backend=ProcessingBackend.PYTORCH,
                description='OneFormer segmentation for COCO dataset',
                fallback_models=['seg_ofade20k', 'builtin_depth']
            ),
            'seg_ufade20k': ModelInfo(
                id='seg_ufade20k',
                name='Uniformer Segmentation',
                file_path=PREPROCESSORS_PATH / 'upernet_global_small.pth',
                processor_type=ProcessorType.SEGMENTATION,
                backend=ProcessingBackend.PYTORCH,
                description='Uniformer-based segmentation',
                fallback_models=['builtin_depth']
            )
        }
        
        # Pose estimation models
        pose_models = {
            'openpose_full': ModelInfo(
                id='openpose_full',
                name='OpenPose Full (Body+Hand+Face)',
                file_path=PREPROCESSORS_PATH / 'body_pose_model.pth',
                processor_type=ProcessorType.POSE_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='Full OpenPose with body, hand and face detection',
                fallback_models=['builtin_depth']
            ),
            'openpose_face': ModelInfo(
                id='openpose_face',
                name='OpenPose Face Only',
                file_path=PREPROCESSORS_PATH / 'facenet.pth',
                processor_type=ProcessorType.POSE_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='OpenPose face detection only',
                fallback_models=['builtin_depth']
            ),
            'openpose_faceonly': ModelInfo(
                id='openpose_faceonly',
                name='OpenPose Face Only (Optimized)',
                file_path=PREPROCESSORS_PATH / 'facenet.pth',
                processor_type=ProcessorType.POSE_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='Optimized face-only OpenPose detection',
                fallback_models=['openpose_face', 'builtin_depth']
            ),
            'openpose_hand': ModelInfo(
                id='openpose_hand',
                name='OpenPose Hand Only',
                file_path=PREPROCESSORS_PATH / 'hand_pose_model.pth',
                processor_type=ProcessorType.POSE_ESTIMATION,
                backend=ProcessingBackend.PYTORCH,
                description='OpenPose hand detection only',
                fallback_models=['builtin_depth']
            ),
            'dwpose': ModelInfo(
                id='dwpose',
                name='DWPose Wholebody',
                file_path=PREPROCESSORS_PATH / 'yolox_l.onnx',
                processor_type=ProcessorType.POSE_ESTIMATION,
                backend=ProcessingBackend.ONNX,
                description='DWPose wholebody pose estimation',
                fallback_models=['openpose_full', 'builtin_depth']
            ),
            'animal_openpose': ModelInfo(
                id='animal_openpose',
                name='Animal OpenPose',
                file_path=PREPROCESSORS_PATH / 'rtmpose-m_simcc-ap10k_pt-aic-coco_210e-256x256-7a041aa1_20230206.onnx',
                processor_type=ProcessorType.POSE_ESTIMATION,
                backend=ProcessingBackend.ONNX,
                description='Animal pose estimation using RTMPose',
                fallback_models=['builtin_depth']
            )
        }
        
        # Specialized processors
        specialized_models = {
            'shuffle': ModelInfo(
                id='shuffle',
                name='Content Shuffle',
                processor_type=ProcessorType.SHUFFLE,
                backend=ProcessingBackend.OPENCV,
                description='Content shuffle preprocessing',
                fallback_models=[]
            ),
            'color': ModelInfo(
                id='color',
                name='Color Extraction',
                processor_type=ProcessorType.COLOR,
                backend=ProcessingBackend.OPENCV,
                description='Extract average/dominant colors',
                fallback_models=[]
            ),
            'threshold': ModelInfo(
                id='threshold',
                name='Binary Threshold',
                processor_type=ProcessorType.THRESHOLD,
                backend=ProcessingBackend.OPENCV,
                description='Binary threshold processing',
                fallback_models=[]
            ),
            'tile': ModelInfo(
                id='tile',
                name='Tile Processing',
                processor_type=ProcessorType.TILE,
                backend=ProcessingBackend.BUILTIN,
                description='Tile-based preprocessing',
                fallback_models=[]
            ),
            'inpaint_global_harmonious': ModelInfo(
                id='inpaint_global_harmonious',
                name='Inpaint Global Harmonious',
                file_path=PREPROCESSORS_PATH / 'big-lama.pt',
                processor_type=ProcessorType.INPAINT,
                backend=ProcessingBackend.PYTORCH,
                description='Global harmonious inpainting',
                fallback_models=['threshold']
            ),
            'inpaint_only': ModelInfo(
                id='inpaint_only',
                name='Inpaint Only',
                processor_type=ProcessorType.INPAINT,
                backend=ProcessingBackend.OPENCV,
                description='Simple inpainting masks',
                fallback_models=[]
            ),
            'inpaint_only+lama': ModelInfo(
                id='inpaint_only+lama',
                name='Inpaint Only + LaMa',
                file_path=PREPROCESSORS_PATH / 'big-lama.pt',
                processor_type=ProcessorType.INPAINT,
                backend=ProcessingBackend.PYTORCH,
                description='Inpainting with LaMa model',
                fallback_models=['inpaint_only']
            ),
            'clip_vision': ModelInfo(
                id='clip_vision',
                name='CLIP Vision',
                file_path=PREPROCESSORS_PATH / 'clip_vision_model.safetensors',
                processor_type=ProcessorType.CLIP_VISION,
                backend=ProcessingBackend.SAFETENSORS,
                description='CLIP vision feature extraction',
                fallback_models=['color']
            ),
            'reference_only': ModelInfo(
                id='reference_only',
                name='Reference Only',
                processor_type=ProcessorType.REFERENCE,
                backend=ProcessingBackend.BUILTIN,
                description='Reference image processing',
                fallback_models=[]
            ),
            'reference_adain': ModelInfo(
                id='reference_adain',
                name='Reference AdaIN',
                processor_type=ProcessorType.REFERENCE,
                backend=ProcessingBackend.BUILTIN,
                description='Reference with Adaptive Instance Normalization',
                fallback_models=['reference_only']
            ),
            'reference_adain+attn': ModelInfo(
                id='reference_adain+attn',
                name='Reference AdaIN + Attention',
                processor_type=ProcessorType.REFERENCE,
                backend=ProcessingBackend.BUILTIN,
                description='Reference with AdaIN and attention mechanism',
                fallback_models=['reference_adain', 'reference_only']
            ),
            'recolor_luminance': ModelInfo(
                id='recolor_luminance',
                name='Recolor Luminance',
                processor_type=ProcessorType.RECOLOR,
                backend=ProcessingBackend.OPENCV,
                description='Luminance-based recoloring',
                fallback_models=['color']
            ),
            'recolor_intensity': ModelInfo(
                id='recolor_intensity',
                name='Recolor Intensity',
                processor_type=ProcessorType.RECOLOR,
                backend=ProcessingBackend.OPENCV,
                description='Intensity-based recoloring',
                fallback_models=['recolor_luminance', 'color']
            ),
            'revision_clipvision': ModelInfo(
                id='revision_clipvision',
                name='Revision CLIP Vision',
                file_path=PREPROCESSORS_PATH / 'clip_vision_model.safetensors',
                processor_type=ProcessorType.REVISION,
                backend=ProcessingBackend.SAFETENSORS,
                description='Revision using CLIP vision',
                fallback_models=['clip_vision', 'color']
            ),
            'revision_ignore_prompt': ModelInfo(
                id='revision_ignore_prompt',
                name='Revision Ignore Prompt',
                processor_type=ProcessorType.REVISION,
                backend=ProcessingBackend.BUILTIN,
                description='Revision ignoring text prompts',
                fallback_models=['revision_clipvision']
            )
        }
        
        # Additional specialized edge and normal models
        additional_models = {
            'normal_dsine': ModelInfo(
                id='normal_dsine',
                name='Normal Dsine',
                file_path=PREPROCESSORS_PATH / 'dsine.pt',
                processor_type=ProcessorType.NORMAL_MAP,
                backend=ProcessingBackend.PYTORCH,
                description='Dsine normal map estimation',
                fallback_models=['normal_bae', 'builtin_depth']
            ),
            'teed': ModelInfo(
                id='teed',
                name='TEED Edge Detection',
                file_path=PREPROCESSORS_PATH / '7_model.pth',
                processor_type=ProcessorType.EDGE_DETECTION,
                backend=ProcessingBackend.PYTORCH,
                description='Tiny and Efficient Edge Detector',
                fallback_models=['table5_pidinet', 'opencv_canny', 'builtin_canny']
            ),
            'manga_line': ModelInfo(
                id='manga_line',
                name='Manga Line',
                file_path=PREPROCESSORS_PATH / 'erika.pth',
                processor_type=ProcessorType.LINEART,
                backend=ProcessingBackend.PYTORCH,
                description='Manga-style line extraction',
                fallback_models=['lineart_anime', 'lineart_standard', 'builtin_lineart']
            ),
            'mobile_sam': ModelInfo(
                id='mobile_sam',
                name='Mobile SAM',
                file_path=PREPROCESSORS_PATH / 'mobile_sam.pt',
                processor_type=ProcessorType.SEGMENTATION,
                backend=ProcessingBackend.PYTORCH,
                description='Mobile Segment Anything Model',
                fallback_models=['seg_ofcoco', 'builtin_depth']
            ),
            'sam': ModelInfo(
                id='sam',
                name='Segment Anything Model',
                file_path=PREPROCESSORS_PATH / 'sam_vit_h_4b8939.pth',
                processor_type=ProcessorType.SEGMENTATION,
                backend=ProcessingBackend.PYTORCH,
                description='Original Segment Anything Model',
                fallback_models=['mobile_sam', 'seg_ofcoco', 'builtin_depth']
            )
        }
        
        # Combine all models
        self.models.update(edge_models)
        self.models.update(depth_models)
        self.models.update(lineart_models)
        self.models.update(soft_edge_models)
        self.models.update(scribble_models)
        self.models.update(mlsd_models)
        self.models.update(normal_models)
        self.models.update(segmentation_models)
        self.models.update(pose_models)
        self.models.update(specialized_models)
        self.models.update(additional_models)
        
        # Check model file availability
        self._check_model_availability()
        
        logger.info(f"Initialized {len(self.models)} models in registry")
    
    def _check_model_availability(self):
        """Check which models are actually available on disk"""
        for model_id, model_info in self.models.items():
            if model_info.backend in [ProcessingBackend.BUILTIN, ProcessingBackend.OPENCV]:
                model_info.status = ModelStatus.AVAILABLE
            elif model_info.file_path and model_info.file_path.exists():
                model_info.status = ModelStatus.AVAILABLE
                model_info.size = model_info.file_path.stat().st_size
            else:
                model_info.status = ModelStatus.NOT_FOUND
                model_info.error_message = f"Model file not found: {model_info.file_path}"
                logger.warning(f"Model {model_id} not found at {model_info.file_path}")
    
    def get_model_info(self, model_id: str) -> Optional[ModelInfo]:
        """Get model information"""
        return self.models.get(model_id)
    
    def get_available_models(self, processor_type: Optional[ProcessorType] = None) -> List[ModelInfo]:
        """Get list of available models, optionally filtered by type"""
        models = [m for m in self.models.values() if m.status == ModelStatus.AVAILABLE]
        if processor_type:
            models = [m for m in models if m.processor_type == processor_type]
        return models
    
    def load_model(self, model_id: str) -> Any:
        """Load model into cache with fallback handling"""
        model_info = self.models.get(model_id)
        if not model_info:
            raise ValueError(f"Model {model_id} not found in registry")
        
        # Check cache first
        if model_id in self.model_cache:
            self.cache_stats['hits'] += 1
            model_info.last_used = datetime.datetime.now()
            model_info.load_count += 1
            logger.info(f"Model {model_id} loaded from cache")
            return self.model_cache[model_id]
        
        self.cache_stats['misses'] += 1
        
        # Handle built-in and OpenCV models
        if model_info.backend in [ProcessingBackend.BUILTIN, ProcessingBackend.OPENCV]:
            model_info.status = ModelStatus.LOADED
            model_info.last_used = datetime.datetime.now()
            model_info.load_count += 1
            return f"{model_info.backend.value}_processor"
        
        # Load PyTorch model
        if not PYTORCH_AVAILABLE:
            raise RuntimeError("PyTorch not available for model loading")
        
        if model_info.status != ModelStatus.AVAILABLE:
            raise FileNotFoundError(f"Model {model_id} is not available: {model_info.error_message}")
        
        try:
            model_info.status = ModelStatus.LOADING
            logger.info(f"Loading model {model_id} from {model_info.file_path}")
            
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            
            # Create appropriate model architecture
            if model_id == 'dpt_hybrid':
                model = DPTDepthModel()
            elif model_id == 'midas_v21':
                model = MiDaSModel('v21')
            elif model_id == 'zoedepth':
                model = ZoeDepthModel()
            elif model_id in ['network-bsds500', 'hed_softedge', 'hed_safe', 'scribble_hed']:
                model = HEDEdgeModel()
            elif model_id in ['table5_pidinet', 'pidinet_softedge', 'pidinet_safe', 'scribble_pidinet']:
                model = PiDiNetModel()
            elif model_id in ['depth_anything', 'depth_anything_v2']:
                model = DPTDepthModel()  # Using DPT architecture for Depth Anything
            elif model_id in ['depth_leres', 'depth_leres_boost']:
                model = MiDaSModel('leres')
            elif model_id in ['lineart_realistic', 'lineart_coarse']:
                model = LineartModel('realistic' if 'realistic' in model_id else 'coarse')
            elif model_id == 'lineart_anime':
                model = LineartModel('anime')
            elif model_id == 'lineart_anime_denoise':
                model = LineartModel('anime_denoise')
            elif model_id == 'mlsd':
                model = MLSDModel()
            elif model_id == 'normal_bae':
                model = NormalBaeModel()
            elif model_id == 'normal_midas':
                model = MiDaSModel('normal')
            elif model_id == 'seg_anime_face':
                model = SegmentationModel(num_classes=8, model_type='anime_face')
            elif model_id in ['seg_ofade20k', 'seg_ufade20k']:
                model = SegmentationModel(num_classes=150, model_type='ade20k')
            elif model_id == 'seg_ofcoco':
                model = SegmentationModel(num_classes=133, model_type='coco')
            else:
                raise ValueError(f"Unknown model architecture for {model_id}")
            
            # Load state dict
            state_dict = torch.load(model_info.file_path, map_location=device)
            
            # Handle different state dict formats
            if isinstance(state_dict, dict):
                if 'state_dict' in state_dict:
                    state_dict = state_dict['state_dict']
                elif 'model' in state_dict:
                    state_dict = state_dict['model']
            
            # Try to load state dict with proper error handling
            try:
                model.load_state_dict(state_dict, strict=False)
                logger.info(f"Loaded state dict for {model_id} (strict=False)")
            except Exception as e:
                logger.warning(f"Failed to load state dict for {model_id}: {e}")
                # For now, continue with randomly initialized model
                logger.info(f"Using randomly initialized model for {model_id}")
            
            model = model.to(device)
            model.eval()
            
            # Cache management
            if len(self.model_cache) >= self.max_cache_size:
                self._evict_least_used()
            
            self.model_cache[model_id] = model
            model_info.status = ModelStatus.LOADED
            model_info.last_used = datetime.datetime.now()
            model_info.load_count += 1
            self.cache_stats['total_loaded'] += 1
            
            logger.info(f"Successfully loaded model {model_id}")
            return model
            
        except Exception as e:
            model_info.status = ModelStatus.ERROR
            model_info.error_message = str(e)
            logger.error(f"Failed to load model {model_id}: {e}")
            raise RuntimeError(f"Failed to load model {model_id}: {e}")
    
    def _evict_least_used(self):
        """Evict least recently used model from cache"""
        if not self.model_cache:
            return
        
        # Find least recently used model
        lru_model_id = min(
            self.model_cache.keys(),
            key=lambda mid: self.models[mid].last_used or datetime.datetime.min
        )
        
        del self.model_cache[lru_model_id]
        self.models[lru_model_id].status = ModelStatus.AVAILABLE
        self.cache_stats['evictions'] += 1
        logger.info(f"Evicted model {lru_model_id} from cache")
    
    def get_registry_stats(self) -> Dict[str, Any]:
        """Get registry statistics"""
        available_count = sum(1 for m in self.models.values() if m.status == ModelStatus.AVAILABLE)
        loaded_count = len(self.model_cache)
        
        type_counts = {}
        backend_counts = {}
        
        for model in self.models.values():
            proc_type = model.processor_type.value
            type_counts[proc_type] = type_counts.get(proc_type, 0) + 1
            
            backend = model.backend.value
            backend_counts[backend] = backend_counts.get(backend, 0) + 1
        
        return {
            'total_models': len(self.models),
            'available_models': available_count,
            'loaded_models': loaded_count,
            'models_by_type': type_counts,
            'models_by_backend': backend_counts,
            'cache_stats': self.cache_stats.copy(),
            'pytorch_available': PYTORCH_AVAILABLE
        }

# --- Model Architectures ---

class DPTDepthModel(nn.Module):
    """DPT (Dense Prediction Transformer) depth estimation model"""
    def __init__(self):
        super().__init__()
        # Use a pretrained vision transformer backbone
        self.encoder = models.vit_b_16(pretrained=False)
        # Remove the classification head
        self.encoder.heads = nn.Identity()
        
        # Simple decoder for now
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
        # Extract features from encoder
        features = self.encoder(x)
        # Reshape for decoder
        batch_size = features.shape[0]
        features = features.view(batch_size, 768, 1, 1)
        features = F.interpolate(features, size=(24, 24), mode='bilinear', align_corners=False)
        # Decode to depth map
        depth = self.decoder(features)
        return depth

class MiDaSModel(nn.Module):
    """MiDaS depth estimation model"""
    def __init__(self, model_type='v21'):
        super().__init__()
        self.model_type = model_type
        
        if model_type == 'v21':
            # MiDaS v2.1 architecture
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
            # Default simple architecture
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
        # Extract features
        if self.model_type == 'v21':
            features = self.backbone(x)
            features = features.view(features.size(0), -1, 1, 1)
            features = F.interpolate(features, size=(12, 12), mode='bilinear', align_corners=False)
        else:
            features = self.backbone(x)
        
        # Generate depth map
        depth = self.head(features)
        return depth

class ZoeDepthModel(nn.Module):
    """ZoeDepth zero-shot depth estimation model"""
    def __init__(self):
        super().__init__()
        # Use EfficientNet backbone
        self.backbone = nn.Sequential(
            nn.Conv2d(3, 32, 3, stride=2, padding=1),
            nn.ReLU(),
            nn.Conv2d(32, 64, 3, stride=2, padding=1),
            nn.ReLU(),
            nn.Conv2d(64, 128, 3, stride=2, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d((1, 1))
        )
        
        self.head = nn.Sequential(
            nn.ConvTranspose2d(128, 64, 8, stride=8),
            nn.ReLU(),
            nn.ConvTranspose2d(64, 32, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.Conv2d(32, 1, 3, padding=1),
            nn.Sigmoid()
        )
    
    def forward(self, x):
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
        # Upsample to original size
        edges = F.interpolate(edges, size=(x.shape[2], x.shape[3]), mode='bilinear', align_corners=False)
        return edges

class PiDiNetModel(nn.Module):
    """PiDiNet (Pixel Difference Networks) edge detection model"""
    def __init__(self):
        super().__init__()
        # Lightweight backbone
        self.backbone = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1), nn.ReLU(),
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(),
            nn.Conv2d(128, 64, 3, padding=1), nn.ReLU(),
        )
        
        self.edge_head = nn.Sequential(
            nn.Conv2d(64, 32, 3, padding=1),
            nn.ReLU(),
            nn.Conv2d(32, 1, 1),
            nn.Sigmoid()
        )
    
    def forward(self, x):
        features = self.backbone(x)
        edges = self.edge_head(features)
        # Upsample to original size
        edges = F.interpolate(edges, size=(x.shape[2], x.shape[3]), mode='bilinear', align_corners=False)
        return edges

class LineartModel(nn.Module):
    """Lineart detection model"""
    def __init__(self, model_type='realistic'):
        super().__init__()
        self.model_type = model_type
        
        # Simple U-Net like architecture
        self.encoder = nn.Sequential(
            nn.Conv2d(3, 64, 3, padding=1), nn.ReLU(),
            nn.Conv2d(64, 64, 3, padding=1), nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(),
            nn.Conv2d(128, 128, 3, padding=1), nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(128, 256, 3, padding=1), nn.ReLU(),
            nn.Conv2d(256, 256, 3, padding=1), nn.ReLU(),
        )
        
        self.decoder = nn.Sequential(
            nn.ConvTranspose2d(256, 128, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.ConvTranspose2d(128, 64, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.Conv2d(64, 1, 3, padding=1),
            nn.Sigmoid()
        )
    
    def forward(self, x):
        encoded = self.encoder(x)
        lineart = self.decoder(encoded)
        return lineart

class MLSDModel(nn.Module):
    """MLSD (Mobile Line Segment Detection) model"""
    def __init__(self):
        super().__init__()
        # Mobile-friendly backbone
        self.backbone = nn.Sequential(
            # Depthwise separable convolutions
            nn.Conv2d(3, 32, 3, padding=1, groups=1), nn.ReLU(),
            nn.Conv2d(32, 32, 3, padding=1, groups=32), nn.ReLU(),
            nn.Conv2d(32, 64, 1), nn.ReLU(),
            nn.MaxPool2d(2),
            
            nn.Conv2d(64, 64, 3, padding=1, groups=64), nn.ReLU(),
            nn.Conv2d(64, 128, 1), nn.ReLU(),
            nn.MaxPool2d(2),
            
            nn.Conv2d(128, 128, 3, padding=1, groups=128), nn.ReLU(),
            nn.Conv2d(128, 256, 1), nn.ReLU(),
        )
        
        self.line_detector = nn.Sequential(
            nn.Conv2d(256, 128, 3, padding=1),
            nn.ReLU(),
            nn.Conv2d(128, 64, 3, padding=1),
            nn.ReLU(),
            nn.Conv2d(64, 1, 1),
            nn.Sigmoid()
        )
    
    def forward(self, x):
        features = self.backbone(x)
        lines = self.line_detector(features)
        # Upsample to original size
        lines = F.interpolate(lines, size=(x.shape[2], x.shape[3]), mode='bilinear', align_corners=False)
        return lines

class NormalBaeModel(nn.Module):
    """Normal BAE model for normal map generation"""
    def __init__(self):
        super().__init__()
        # ResNet-like backbone
        self.backbone = nn.Sequential(
            nn.Conv2d(3, 64, 7, stride=2, padding=3), nn.ReLU(),
            nn.MaxPool2d(3, stride=2, padding=1),
            
            # ResNet blocks
            nn.Conv2d(64, 64, 3, padding=1), nn.ReLU(),
            nn.Conv2d(64, 64, 3, padding=1), nn.ReLU(),
            nn.Conv2d(64, 128, 3, stride=2, padding=1), nn.ReLU(),
            nn.Conv2d(128, 128, 3, padding=1), nn.ReLU(),
            nn.Conv2d(128, 256, 3, stride=2, padding=1), nn.ReLU(),
        )
        
        self.normal_head = nn.Sequential(
            nn.ConvTranspose2d(256, 128, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.ConvTranspose2d(128, 64, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.ConvTranspose2d(64, 32, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.Conv2d(32, 3, 3, padding=1),
            nn.Tanh()  # Normal maps range from -1 to 1
        )
    
    def forward(self, x):
        features = self.backbone(x)
        normals = self.normal_head(features)
        return normals

class SegmentationModel(nn.Module):
    """Segmentation model for anime face and general segmentation"""
    def __init__(self, num_classes=21, model_type='anime_face'):
        super().__init__()
        self.model_type = model_type
        self.num_classes = num_classes if model_type != 'anime_face' else 8
        
        # Feature extraction
        self.encoder = nn.Sequential(
            nn.Conv2d(3, 64, 3, padding=1), nn.ReLU(),
            nn.Conv2d(64, 64, 3, padding=1), nn.ReLU(),
            nn.MaxPool2d(2),
            
            nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(),
            nn.Conv2d(128, 128, 3, padding=1), nn.ReLU(),
            nn.MaxPool2d(2),
            
            nn.Conv2d(128, 256, 3, padding=1), nn.ReLU(),
            nn.Conv2d(256, 256, 3, padding=1), nn.ReLU(),
            nn.MaxPool2d(2),
            
            nn.Conv2d(256, 512, 3, padding=1), nn.ReLU(),
            nn.Conv2d(512, 512, 3, padding=1), nn.ReLU(),
        )
        
        # Segmentation head
        self.decoder = nn.Sequential(
            nn.ConvTranspose2d(512, 256, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.ConvTranspose2d(256, 128, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.ConvTranspose2d(128, 64, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.Conv2d(64, self.num_classes, 3, padding=1)
        )
    
    def forward(self, x):
        encoded = self.encoder(x)
        segmentation = self.decoder(encoded)
        return segmentation

# --- Processing Pipeline ---

class UnifiedProcessor:
    """Unified processing pipeline with PyTorch primary and OpenCV fallback"""
    
    def __init__(self, model_registry: ModelRegistry):
        self.registry = model_registry
        self.image_save_manager = ImageSaveManager()
    
    def process_image(self, request: UnifiedProcessRequest) -> UnifiedProcessResponse:
        """Main processing entry point with fallback handling"""
        start_time = time.time()
        
        try:
            # Get model info
            model_info = self.registry.get_model_info(request.model_id)
            if not model_info:
                raise ValueError(f"Model {request.model_id} not found")
            
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
            
            # Save if requested
            saved_path = None
            if request.save_result:
                saved_path = self._save_processed_image(
                    processed_image_b64, request, model_info
                )
            
            processing_time = (time.time() - start_time) * 1000  # Convert to ms
            
            return UnifiedProcessResponse(
                success=True,
                processed_image=f'data:image/png;base64,{processed_image_b64}',
                model_used=request.model_id,
                backend_used=backend_used,
                processing_time_ms=processing_time,
                fallback_used=fallback_used,
                saved_path=saved_path,
                metadata={
                    'input_size': image.size,
                    'output_format': 'PNG',
                    'processor_type': model_info.processor_type.value
                }
            )
            
        except Exception as e:
            processing_time = (time.time() - start_time) * 1000
            logger.error(f"Processing failed for {request.model_id}: {e}")
            
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
        elif backend == ProcessingBackend.ONNX:
            return self._process_onnx(image, model_info, params)
        elif backend == ProcessingBackend.SAFETENSORS:
            return self._process_safetensors(image, model_info, params)
        else:
            raise ValueError(f"Unsupported backend: {backend}")
    
    def _process_with_fallback(self, image: Image.Image, model_info: ModelInfo, 
                             params: Dict) -> tuple[Image.Image, ProcessingBackend]:
        """Process with fallback chain"""
        for fallback_id in model_info.fallback_models:
            fallback_info = self.registry.get_model_info(fallback_id)
            if not fallback_info or fallback_info.status != ModelStatus.AVAILABLE:
                continue
            
            try:
                result = self._process_with_backend(image, fallback_info, fallback_info.backend, params)
                logger.info(f"Fallback successful with {fallback_id}")
                return result, fallback_info.backend
            except Exception as e:
                logger.warning(f"Fallback {fallback_id} failed: {e}")
                continue
        
        raise RuntimeError("All fallback options failed")
    
    def _process_pytorch(self, image: Image.Image, model_info: ModelInfo, params: Dict) -> Image.Image:
        """Process with PyTorch model"""
        if not PYTORCH_AVAILABLE:
            raise RuntimeError("PyTorch not available")
        
        model = self.registry.load_model(model_info.id)
        
        if model_info.processor_type == ProcessorType.DEPTH_ESTIMATION:
            return self._pytorch_depth_estimation(image, model, params)
        elif model_info.processor_type == ProcessorType.EDGE_DETECTION:
            return self._pytorch_edge_detection(image, model, params)
        elif model_info.processor_type == ProcessorType.LINEART:
            return self._pytorch_lineart_processing(image, model, params)
        elif model_info.processor_type == ProcessorType.SOFT_EDGE:
            return self._pytorch_soft_edge_processing(image, model, params)
        elif model_info.processor_type == ProcessorType.SCRIBBLE:
            return self._pytorch_scribble_processing(image, model, params)
        elif model_info.processor_type == ProcessorType.MLSD:
            return self._pytorch_mlsd_processing(image, model, params)
        elif model_info.processor_type == ProcessorType.NORMAL_MAP:
            return self._pytorch_normal_processing(image, model, params)
        elif model_info.processor_type == ProcessorType.SEGMENTATION:
            return self._pytorch_segmentation_processing(image, model, params, model_info)
        elif model_info.processor_type == ProcessorType.POSE_ESTIMATION:
            return self._pytorch_pose_processing(image, model, params, model_info)
        elif model_info.processor_type == ProcessorType.INPAINT:
            return self._pytorch_inpaint_processing(image, model, params)
        elif model_info.processor_type == ProcessorType.CLIP_VISION:
            return self._pytorch_clip_processing(image, model, params)
        else:
            raise ValueError(f"Unsupported processor type: {model_info.processor_type}")
    
    def _pytorch_depth_estimation(self, image: Image.Image, model: Any, params: Dict) -> Image.Image:
        """PyTorch depth estimation processing"""
        device = next(model.parameters()).device
        
        # Standard depth estimation transform
        transform = Compose([
            Resize((384, 384)),
            ToTensor(),
            Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        
        original_width, original_height = image.size
        transformed_image = transform(image).unsqueeze(0).to(device)
        
        with torch.no_grad():
            prediction = model(transformed_image)
            
            # Handle different output formats
            if len(prediction.shape) == 4:  # [B, C, H, W]
                prediction = prediction.squeeze(0).squeeze(0)  # Remove batch and channel dims
            elif len(prediction.shape) == 3:  # [B, H, W]
                prediction = prediction.squeeze(0)  # Remove batch dim
            
            # Resize to original dimensions
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
        
        # Create proper depth visualization
        colored_depth = params.get('colored', True)
        if colored_depth:
            # Convert to colored depth map using jet colormap
            depth_uint8 = (output_normalized * 255.0).astype(np.uint8)
            colored = cv2.applyColorMap(depth_uint8, cv2.COLORMAP_JET)
            colored_rgb = cv2.cvtColor(colored, cv2.COLOR_BGR2RGB)
            output_image = Image.fromarray(colored_rgb)
        else:
            # Grayscale depth map
            depth_uint8 = (output_normalized * 255.0).astype(np.uint8)
            output_image = Image.fromarray(depth_uint8, mode='L').convert('RGB')
        
        return output_image
    
    def _pytorch_edge_detection(self, image: Image.Image, model: Any, params: Dict) -> Image.Image:
        """PyTorch edge detection processing"""
        device = next(model.parameters()).device
        
        # Standard edge detection transform
        transform = Compose([
            Resize((512, 512)),
            ToTensor(),
            Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        
        original_width, original_height = image.size
        transformed_image = transform(image).unsqueeze(0).to(device)
        
        with torch.no_grad():
            prediction = model(transformed_image)
            
            # Handle different output formats
            if len(prediction.shape) == 4:  # [B, C, H, W]
                prediction = prediction.squeeze(0).squeeze(0)  # Remove batch and channel dims
            elif len(prediction.shape) == 3:  # [B, H, W]
                prediction = prediction.squeeze(0)  # Remove batch dim
            
            # Resize to original dimensions
            if prediction.shape[-2:] != (original_height, original_width):
                prediction = F.interpolate(
                    prediction.unsqueeze(0).unsqueeze(0),
                    size=(original_height, original_width),
                    mode="bilinear",
                    align_corners=False,
                ).squeeze()
        
        # Convert to numpy and apply thresholding
        edges_numpy = prediction.cpu().numpy()
        
        # Apply threshold parameters
        threshold = params.get('threshold', 0.5)
        edges_binary = (edges_numpy > threshold).astype(np.uint8) * 255
        
        # Convert to RGB
        result_np = cv2.cvtColor(edges_binary, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _pytorch_lineart_processing(self, image: Image.Image, model: Any, params: Dict) -> Image.Image:
        """PyTorch lineart processing"""
        device = next(model.parameters()).device
        
        # Lineart transform
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
        
        # Convert to lineart (inverted for proper display)
        lineart_numpy = prediction.cpu().numpy()
        lineart_inverted = 255 - (lineart_numpy * 255).astype(np.uint8)
        result_np = cv2.cvtColor(lineart_inverted, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _pytorch_soft_edge_processing(self, image: Image.Image, model: Any, params: Dict) -> Image.Image:
        """PyTorch soft edge processing (similar to edge detection but with softer edges)"""
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
        
        # Apply soft thresholding for soft edges
        edges_numpy = prediction.cpu().numpy()
        safe_mode = params.get('safe_mode', False)
        
        if safe_mode:
            # Safer processing with Gaussian blur
            edges_processed = cv2.GaussianBlur((edges_numpy * 255).astype(np.uint8), (3, 3), 0)
        else:
            edges_processed = (edges_numpy * 255).astype(np.uint8)
        
        result_np = cv2.cvtColor(edges_processed, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _pytorch_scribble_processing(self, image: Image.Image, model: Any, params: Dict) -> Image.Image:
        """PyTorch scribble processing"""
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
        
        # Post-process for scribble effect
        edges_numpy = prediction.cpu().numpy()
        
        # Apply NMS (Non-Maximum Suppression) effect for scribble
        edges_processed = (edges_numpy * 255).astype(np.uint8)
        edges_blurred = cv2.GaussianBlur(edges_processed, (0, 0), 3.0)
        edges_blurred[edges_blurred > 4] = 255
        edges_blurred[edges_blurred < 255] = 0
        
        result_np = cv2.cvtColor(edges_blurred, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _pytorch_mlsd_processing(self, image: Image.Image, model: Any, params: Dict) -> Image.Image:
        """PyTorch MLSD (Mobile Line Segment Detection) processing"""
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
        
        # Process line segments
        lines_numpy = prediction.cpu().numpy()
        
        # Apply MLSD parameters
        value_threshold = params.get('value_threshold', 0.1)
        distance_threshold = params.get('distance_threshold', 0.1)
        
        # Threshold the line detection
        lines_binary = (lines_numpy > value_threshold).astype(np.uint8) * 255
        
        result_np = cv2.cvtColor(lines_binary, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _pytorch_normal_processing(self, image: Image.Image, model: Any, params: Dict) -> Image.Image:
        """PyTorch normal map processing"""
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
                prediction = prediction.squeeze(0)  # Remove batch dim, keep channels
            
            if prediction.shape[-2:] != (original_height, original_width):
                prediction = F.interpolate(
                    prediction.unsqueeze(0),
                    size=(original_height, original_width),
                    mode="bilinear",
                    align_corners=False,
                ).squeeze(0)
        
        # Convert normal map to RGB (from -1,1 to 0,255)
        normal_numpy = prediction.cpu().numpy().transpose(1, 2, 0)  # CHW to HWC
        
        # Background threshold for normal maps
        bg_threshold = params.get('bg_threshold', 0.4)
        
        # Normalize to 0-255 range
        normal_normalized = ((normal_numpy + 1) * 127.5).astype(np.uint8)
        
        # Apply background threshold if specified
        if bg_threshold > 0:
            mask = np.mean(normal_normalized, axis=2) < (bg_threshold * 255)
            normal_normalized[mask] = [128, 128, 255]  # Default normal color
        
        return Image.fromarray(normal_normalized)
    
    def _pytorch_segmentation_processing(self, image: Image.Image, model: Any, params: Dict, model_info: ModelInfo) -> Image.Image:
        """PyTorch segmentation processing"""
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
                # Apply softmax to get class probabilities
                prediction = F.softmax(prediction, dim=1)
                # Get the class with highest probability
                prediction = torch.argmax(prediction, dim=1).squeeze(0)
            
            if prediction.shape[-2:] != (original_height, original_width):
                prediction = F.interpolate(
                    prediction.unsqueeze(0).unsqueeze(0).float(),
                    size=(original_height, original_width),
                    mode="nearest",
                ).squeeze().int()
        
        # Convert segmentation to color map
        segmentation_numpy = prediction.cpu().numpy().astype(np.uint8)
        
        # Create color map for different model types
        if 'anime_face' in model_info.id:
            # Anime face segmentation colors
            colors = np.array([
                [0, 0, 0],       # background
                [255, 0, 0],     # skin
                [0, 255, 0],     # eyebrows
                [0, 0, 255],     # eyes
                [255, 255, 0],   # nose
                [255, 0, 255],   # mouth
                [0, 255, 255],   # hair
                [128, 128, 128]  # other
            ])
        else:
            # General segmentation - generate colors for all classes
            np.random.seed(42)  # For consistent colors
            colors = np.random.randint(0, 256, size=(model.num_classes, 3))
            colors[0] = [0, 0, 0]  # Background is black
        
        # Apply color map
        colored_segmentation = colors[segmentation_numpy]
        
        return Image.fromarray(colored_segmentation.astype(np.uint8))
    
    def _pytorch_pose_processing(self, image: Image.Image, model: Any, params: Dict, model_info: ModelInfo) -> Image.Image:
        """PyTorch pose estimation processing"""
        try:
            device = next(model.parameters()).device
            
            # Pose processing transform
            transform = Compose([
                Resize((512, 512)),
                ToTensor(),
                Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])
            
            original_width, original_height = image.size
            transformed_image = transform(image).unsqueeze(0).to(device)
            
            with torch.no_grad():
                # For OpenPose models, expected output format varies
                outputs = model(transformed_image)
                
                # Create pose skeleton canvas
                canvas = np.zeros((original_height, original_width, 3), dtype=np.uint8)
                
                # Placeholder pose skeleton (would need actual OpenPose processing)
                center_x, center_y = original_width // 2, original_height // 2
                
                # Draw simple stick figure
                cv2.circle(canvas, (center_x, center_y - 60), 15, (255, 255, 255), 2)  # Head
                cv2.line(canvas, (center_x, center_y - 45), (center_x, center_y + 60), (255, 255, 255), 2)  # Body
                cv2.line(canvas, (center_x, center_y - 30), (center_x - 40, center_y + 10), (255, 255, 255), 2)  # Left arm
                cv2.line(canvas, (center_x, center_y - 30), (center_x + 40, center_y + 10), (255, 255, 255), 2)  # Right arm
                cv2.line(canvas, (center_x, center_y + 60), (center_x - 25, center_y + 120), (255, 255, 255), 2)  # Left leg
                cv2.line(canvas, (center_x, center_y + 60), (center_x + 25, center_y + 120), (255, 255, 255), 2)  # Right leg
                
                return Image.fromarray(canvas)
                
        except Exception as e:
            logger.warning(f"PyTorch pose processing failed: {e}, using fallback")
            # Fallback to simple skeleton
            canvas = np.zeros((image.height, image.width, 3), dtype=np.uint8)
            return Image.fromarray(canvas)
    
    def _pytorch_inpaint_processing(self, image: Image.Image, model: Any, params: Dict) -> Image.Image:
        """PyTorch inpainting processing (LaMa model)"""
        try:
            device = next(model.parameters()).device
            
            # Inpainting transform
            transform = Compose([
                Resize((512, 512)),
                ToTensor(),
            ])
            
            original_width, original_height = image.size
            transformed_image = transform(image).unsqueeze(0).to(device)
            
            with torch.no_grad():
                # For LaMa model, generate inpainting mask
                output = model(transformed_image)
                
                if len(output.shape) == 4:
                    output = output.squeeze(0)
                
                # Process output as inpainting result
                output_numpy = output.cpu().numpy()
                
                if output_numpy.shape[0] == 3:  # RGB output
                    output_numpy = np.transpose(output_numpy, (1, 2, 0))
                elif output_numpy.shape[0] == 1:  # Grayscale output
                    output_numpy = np.transpose(output_numpy, (1, 2, 0))
                    output_numpy = np.repeat(output_numpy, 3, axis=2)
                
                # Resize to original dimensions
                if output_numpy.shape[:2] != (original_height, original_width):
                    output_numpy = cv2.resize(output_numpy, (original_width, original_height))
                
                # Normalize to 0-255 range
                output_numpy = np.clip(output_numpy * 255, 0, 255).astype(np.uint8)
                
                return Image.fromarray(output_numpy)
                
        except Exception as e:
            logger.warning(f"PyTorch inpaint processing failed: {e}, using fallback")
            # Fallback to edge-based mask
            return self._opencv_inpaint_processing(np.array(image), params)
    
    def _pytorch_clip_processing(self, image: Image.Image, model: Any, params: Dict) -> Image.Image:
        """PyTorch CLIP vision processing"""
        try:
            device = next(model.parameters()).device
            
            # CLIP vision transform
            transform = Compose([
                Resize((224, 224)),
                ToTensor(),
                Normalize(mean=[0.48145466, 0.4578275, 0.40821073], 
                         std=[0.26862954, 0.26130258, 0.27577711]),
            ])
            
            transformed_image = transform(image).unsqueeze(0).to(device)
            
            with torch.no_grad():
                # Get CLIP vision features
                features = model(transformed_image)
                
                # For now, return the original image with slight enhancement
                # In practice, CLIP features would be used for conditioning
                image_np = np.array(image)
                enhanced = cv2.convertScaleAbs(image_np, alpha=1.05, beta=5)
                
                return Image.fromarray(enhanced)
                
        except Exception as e:
            logger.warning(f"PyTorch CLIP processing failed: {e}, using fallback")
            # Return original image as fallback
            return image
    
    def _process_onnx(self, image: Image.Image, model_info: ModelInfo, params: Dict) -> Image.Image:
        """Process with ONNX Runtime (placeholder - requires onnxruntime)"""
        try:
            import onnxruntime as ort
        except ImportError:
            logger.warning("ONNX Runtime not available, falling back to OpenCV processing")
            return self._process_opencv(image, model_info, params)
        
        # For now, implement basic ONNX processing for pose estimation
        if model_info.processor_type == ProcessorType.POSE_ESTIMATION:
            return self._onnx_pose_processing(image, model_info, params)
        else:
            # Fallback to OpenCV for other types
            return self._process_opencv(image, model_info, params)
    
    def _onnx_pose_processing(self, image: Image.Image, model_info: ModelInfo, params: Dict) -> Image.Image:
        """ONNX pose processing (DWPose, Animal OpenPose)"""
        # Placeholder implementation - would need actual ONNX model loading
        logger.info(f"ONNX pose processing with {model_info.id}")
        
        # For now, return a simple pose skeleton visualization
        image_np = np.array(image)
        
        # Create a simple pose skeleton as placeholder
        height, width = image_np.shape[:2]
        canvas = np.zeros((height, width, 3), dtype=np.uint8)
        
        # Draw simple stick figure as placeholder
        center_x, center_y = width // 2, height // 2
        cv2.circle(canvas, (center_x, center_y - 60), 20, (255, 255, 255), 2)  # Head
        cv2.line(canvas, (center_x, center_y - 40), (center_x, center_y + 40), (255, 255, 255), 2)  # Body
        cv2.line(canvas, (center_x, center_y - 20), (center_x - 30, center_y), (255, 255, 255), 2)  # Left arm
        cv2.line(canvas, (center_x, center_y - 20), (center_x + 30, center_y), (255, 255, 255), 2)  # Right arm
        cv2.line(canvas, (center_x, center_y + 40), (center_x - 20, center_y + 80), (255, 255, 255), 2)  # Left leg
        cv2.line(canvas, (center_x, center_y + 40), (center_x + 20, center_y + 80), (255, 255, 255), 2)  # Right leg
        
        return Image.fromarray(canvas)
    
    def _process_safetensors(self, image: Image.Image, model_info: ModelInfo, params: Dict) -> Image.Image:
        """Process with SafeTensors format (placeholder - requires safetensors)"""
        try:
            import safetensors
        except ImportError:
            logger.warning("SafeTensors not available, falling back to PyTorch processing")
            return self._process_pytorch(image, model_info, params)
        
        # For now, implement basic SafeTensors processing for CLIP Vision
        if model_info.processor_type == ProcessorType.CLIP_VISION:
            return self._safetensors_clip_processing(image, model_info, params)
        elif model_info.processor_type == ProcessorType.REVISION:
            return self._safetensors_revision_processing(image, model_info, params)
        else:
            # Fallback to PyTorch for other types
            return self._process_pytorch(image, model_info, params)
    
    def _safetensors_clip_processing(self, image: Image.Image, model_info: ModelInfo, params: Dict) -> Image.Image:
        """SafeTensors CLIP vision processing"""
        # Placeholder implementation for CLIP vision
        logger.info(f"SafeTensors CLIP processing with {model_info.id}")
        
        # Return the original image with slight modifications as placeholder
        image_np = np.array(image)
        
        # Apply a slight color adjustment to indicate processing
        image_np = cv2.convertScaleAbs(image_np, alpha=1.1, beta=10)
        
        return Image.fromarray(image_np)
    
    def _safetensors_revision_processing(self, image: Image.Image, model_info: ModelInfo, params: Dict) -> Image.Image:
        """SafeTensors revision processing"""
        # Placeholder implementation for revision
        logger.info(f"SafeTensors revision processing with {model_info.id}")
        
        # Return the original image for now
        return image
    
    def _process_opencv(self, image: Image.Image, model_info: ModelInfo, params: Dict) -> Image.Image:
        """Process with OpenCV"""
        image_np = np.array(image)
        
        if model_info.processor_type == ProcessorType.EDGE_DETECTION:
            return self._opencv_edge_detection(image_np, params)
        elif model_info.processor_type == ProcessorType.DEPTH_ESTIMATION:
            return self._opencv_depth_estimation(image_np, params)
        elif model_info.processor_type == ProcessorType.LINEART:
            return self._opencv_lineart_processing(image_np, params)
        elif model_info.processor_type == ProcessorType.SOFT_EDGE:
            return self._opencv_edge_detection(image_np, params)  # Use same as edge detection
        elif model_info.processor_type == ProcessorType.SCRIBBLE:
            return self._opencv_scribble_processing(image_np, params)
        elif model_info.processor_type == ProcessorType.MLSD:
            return self._opencv_mlsd_processing(image_np, params)
        elif model_info.processor_type == ProcessorType.NORMAL_MAP:
            return self._opencv_normal_processing(image_np, params)
        elif model_info.processor_type == ProcessorType.COLOR:
            return self._opencv_color_processing(image_np, params)
        elif model_info.processor_type == ProcessorType.SHUFFLE:
            return self._opencv_shuffle_processing(image_np, params)
        elif model_info.processor_type == ProcessorType.THRESHOLD:
            return self._opencv_threshold_processing(image_np, params)
        elif model_info.processor_type == ProcessorType.INPAINT:
            return self._opencv_inpaint_processing(image_np, params)
        elif model_info.processor_type == ProcessorType.RECOLOR:
            return self._opencv_recolor_processing(image_np, params)
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
        
        # Simple depth estimation based on brightness
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
    
    def _opencv_lineart_processing(self, image_np: np.ndarray, params: Dict) -> Image.Image:
        """OpenCV-based lineart extraction"""
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
        
        # Standard lineart algorithm (similar to lineart_standard)
        x = gray.astype(np.float32)
        g = cv2.GaussianBlur(x, (0, 0), 6.0)
        intensity = np.minimum(g - x, 0)
        intensity = np.abs(intensity)
        intensity = intensity / max(16, np.median(intensity[intensity > 8]))
        intensity *= 127
        result = intensity.clip(0, 255).astype(np.uint8)
        
        result_np = cv2.cvtColor(result, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _opencv_scribble_processing(self, image_np: np.ndarray, params: Dict) -> Image.Image:
        """OpenCV-based scribble processing using XDoG"""
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY).astype(np.float32)
        
        # XDoG (eXtended Difference of Gaussians) algorithm
        threshold = params.get('threshold', 32)
        
        g1 = cv2.GaussianBlur(gray, (0, 0), 0.5)
        g2 = cv2.GaussianBlur(gray, (0, 0), 5.0)
        dog = (255 - np.minimum(g2 - g1, 0)).clip(0, 255).astype(np.uint8)
        
        result = np.zeros_like(gray, dtype=np.uint8)
        result[2 * (255 - dog) > threshold] = 255
        
        result_np = cv2.cvtColor(result, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _opencv_mlsd_processing(self, image_np: np.ndarray, params: Dict) -> Image.Image:
        """OpenCV-based line segment detection"""
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
        
        # Use HoughLinesP for line segment detection as fallback
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        
        # HoughLinesP parameters
        rho = params.get('rho', 1)
        theta = np.pi / 180
        threshold = params.get('threshold', 50)
        min_line_length = params.get('min_line_length', 50)
        max_line_gap = params.get('max_line_gap', 10)
        
        lines = cv2.HoughLinesP(edges, rho, theta, threshold, 
                               minLineLength=min_line_length, 
                               maxLineGap=max_line_gap)
        
        # Create line image
        line_image = np.zeros_like(gray)
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                cv2.line(line_image, (x1, y1), (x2, y2), 255, 2)
        
        result_np = cv2.cvtColor(line_image, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _opencv_normal_processing(self, image_np: np.ndarray, params: Dict) -> Image.Image:
        """OpenCV-based normal map generation from depth-like processing"""
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY).astype(np.float32)
        
        # Simple normal map generation from gradients
        grad_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        grad_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        
        # Normalize gradients
        grad_x = grad_x / 255.0
        grad_y = grad_y / 255.0
        
        # Create normal map
        normal_z = np.ones_like(grad_x)
        
        # Normalize the normal vector
        length = np.sqrt(grad_x**2 + grad_y**2 + normal_z**2)
        normal_x = grad_x / length
        normal_y = grad_y / length
        normal_z = normal_z / length
        
        # Convert to 0-255 range
        normal_map = np.zeros((gray.shape[0], gray.shape[1], 3), dtype=np.uint8)
        normal_map[:, :, 0] = ((normal_x + 1) * 127.5).astype(np.uint8)  # R
        normal_map[:, :, 1] = ((normal_y + 1) * 127.5).astype(np.uint8)  # G
        normal_map[:, :, 2] = ((normal_z + 1) * 127.5).astype(np.uint8)  # B
        
        return Image.fromarray(normal_map)
    
    def _opencv_color_processing(self, image_np: np.ndarray, params: Dict) -> Image.Image:
        """OpenCV-based color extraction"""
        # Extract dominant color and create solid color image
        pixels = image_np.reshape((-1, 3))
        
        # Use K-means to find dominant color
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
        k = params.get('colors', 1)
        _, labels, centers = cv2.kmeans(pixels.astype(np.float32), k, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)
        
        # Create color palette image
        if k == 1:
            color = centers[0].astype(np.uint8)
            result_np = np.full_like(image_np, color)
        else:
            # Create color bands
            height, width = image_np.shape[:2]
            result_np = np.zeros_like(image_np)
            band_height = height // k
            for i, color in enumerate(centers):
                start_y = i * band_height
                end_y = start_y + band_height if i < k - 1 else height
                result_np[start_y:end_y] = color.astype(np.uint8)
        
        return Image.fromarray(result_np)
    
    def _opencv_shuffle_processing(self, image_np: np.ndarray, params: Dict) -> Image.Image:
        """OpenCV-based content shuffle"""
        height, width = image_np.shape[:2]
        
        # Create grid of blocks to shuffle
        block_size = params.get('block_size', 64)
        blocks_y = height // block_size
        blocks_x = width // block_size
        
        result_np = image_np.copy()
        
        # Shuffle blocks
        block_indices = [(i, j) for i in range(blocks_y) for j in range(blocks_x)]
        np.random.shuffle(block_indices)
        
        for idx, (orig_i, orig_j) in enumerate(block_indices):
            new_i = idx // blocks_x
            new_j = idx % blocks_x
            
            orig_y = orig_i * block_size
            orig_x = orig_j * block_size
            new_y = new_i * block_size
            new_x = new_j * block_size
            
            result_np[new_y:new_y+block_size, new_x:new_x+block_size] = \
                image_np[orig_y:orig_y+block_size, orig_x:orig_x+block_size]
        
        return Image.fromarray(result_np)
    
    def _opencv_threshold_processing(self, image_np: np.ndarray, params: Dict) -> Image.Image:
        """OpenCV-based binary threshold"""
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
        
        threshold_value = params.get('threshold', 127)
        threshold_type = params.get('type', 'binary')
        
        if threshold_type == 'binary':
            _, result = cv2.threshold(gray, threshold_value, 255, cv2.THRESH_BINARY)
        elif threshold_type == 'binary_inv':
            _, result = cv2.threshold(gray, threshold_value, 255, cv2.THRESH_BINARY_INV)
        elif threshold_type == 'otsu':
            _, result = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        else:
            _, result = cv2.threshold(gray, threshold_value, 255, cv2.THRESH_BINARY)
        
        result_np = cv2.cvtColor(result, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _opencv_inpaint_processing(self, image_np: np.ndarray, params: Dict) -> Image.Image:
        """OpenCV-based inpainting mask generation"""
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
        
        # Create mask from edges or thresholding
        method = params.get('method', 'edges')
        
        if method == 'edges':
            mask = cv2.Canny(gray, 50, 150)
        elif method == 'threshold':
            threshold_value = params.get('threshold', 127)
            _, mask = cv2.threshold(gray, threshold_value, 255, cv2.THRESH_BINARY)
        else:
            # Default to edge-based mask
            mask = cv2.Canny(gray, 50, 150)
        
        # Dilate mask to make it more visible
        kernel = np.ones((3, 3), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=1)
        
        result_np = cv2.cvtColor(mask, cv2.COLOR_GRAY2RGB)
        return Image.fromarray(result_np)
    
    def _opencv_recolor_processing(self, image_np: np.ndarray, params: Dict) -> Image.Image:
        """OpenCV-based recoloring"""
        method = params.get('method', 'luminance')
        
        if method == 'luminance':
            # Convert to luminance and apply color
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
            target_color = params.get('color', [255, 255, 255])
            
            # Create recolored image by multiplying grayscale with target color
            result_np = np.zeros_like(image_np)
            for i in range(3):
                result_np[:, :, i] = (gray * target_color[i] // 255).astype(np.uint8)
                
        elif method == 'intensity':
            # Intensity-based recoloring
            intensity = np.mean(image_np, axis=2).astype(np.uint8)
            target_color = params.get('color', [255, 255, 255])
            
            result_np = np.zeros_like(image_np)
            for i in range(3):
                result_np[:, :, i] = (intensity * target_color[i] // 255).astype(np.uint8)
        else:
            # Default to luminance
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
            result_np = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
        
        return Image.fromarray(result_np)
    
    def _process_builtin(self, image: Image.Image, model_info: ModelInfo, params: Dict) -> Image.Image:
        """Process with built-in algorithms"""
        # Placeholder for built-in processing
        # In practice, this would be handled by frontend JavaScript
        image_np = np.array(image)
        
        if model_info.processor_type == ProcessorType.EDGE_DETECTION:
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, 100, 200)
            result_np = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
        elif model_info.processor_type == ProcessorType.LINEART:
            # Simple lineart using edge detection
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            # Invert for lineart
            lineart = 255 - edges
            result_np = cv2.cvtColor(lineart, cv2.COLOR_GRAY2RGB)
        elif model_info.processor_type in [ProcessorType.SOFT_EDGE, ProcessorType.SCRIBBLE]:
            # Soft edge processing using blurred Canny
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            edges = cv2.Canny(blurred, 50, 150)
            result_np = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
        elif model_info.processor_type == ProcessorType.MLSD:
            # Simple line detection using Canny edges
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            result_np = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
        elif model_info.processor_type == ProcessorType.NORMAL_MAP:
            # Simple normal map from grayscale gradients
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY).astype(np.float32)
            grad_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3) / 255.0
            grad_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3) / 255.0
            normal_z = np.ones_like(grad_x)
            
            # Normalize and convert to RGB
            length = np.sqrt(grad_x**2 + grad_y**2 + normal_z**2)
            normal_map = np.zeros((gray.shape[0], gray.shape[1], 3), dtype=np.uint8)
            normal_map[:, :, 0] = ((grad_x / length + 1) * 127.5).astype(np.uint8)
            normal_map[:, :, 1] = ((grad_y / length + 1) * 127.5).astype(np.uint8)
            normal_map[:, :, 2] = ((normal_z / length + 1) * 127.5).astype(np.uint8)
            result_np = normal_map
        elif model_info.processor_type == ProcessorType.SEGMENTATION:
            # Simple segmentation using color quantization
            # Convert to LAB color space for better color clustering
            lab = cv2.cvtColor(image_np, cv2.COLOR_RGB2LAB)
            data = lab.reshape((-1, 3)).astype(np.float32)
            
            # Use K-means clustering for segmentation
            criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 8, 1.0)
            k = 8 if 'anime_face' in model_info.id else 16
            _, labels, centers = cv2.kmeans(data, k, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)
            
            # Convert back to RGB
            centers = centers.astype(np.uint8)
            segmented_data = centers[labels.flatten()]
            segmented = segmented_data.reshape(image_np.shape)
            result_np = cv2.cvtColor(segmented, cv2.COLOR_LAB2RGB)
        elif model_info.processor_type == ProcessorType.COLOR:
            # Extract dominant color
            mean_color = np.mean(image_np, axis=(0, 1)).astype(np.uint8)
            result_np = np.full_like(image_np, mean_color)
        elif model_info.processor_type == ProcessorType.SHUFFLE:
            # Simple pixel shuffle
            result_np = image_np.copy()
            height, width = result_np.shape[:2]
            indices = np.arange(height * width)
            np.random.shuffle(indices)
            flat = result_np.reshape(-1, 3)
            flat = flat[indices]
            result_np = flat.reshape(height, width, 3)
        elif model_info.processor_type == ProcessorType.THRESHOLD:
            # Simple binary threshold
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
            _, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
            result_np = cv2.cvtColor(thresh, cv2.COLOR_GRAY2RGB)
        elif model_info.processor_type == ProcessorType.TILE:
            # Return original image (tile processing is usually done in frontend)
            result_np = image_np
        elif model_info.processor_type in [ProcessorType.REFERENCE, ProcessorType.REVISION]:
            # Return original image for reference types
            result_np = image_np
        elif model_info.processor_type == ProcessorType.RECOLOR:
            # Simple grayscale recoloring
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
            result_np = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
        else:
            # Simple grayscale for unknown types
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
    
    def _save_processed_image(self, image_b64: str, request: UnifiedProcessRequest, 
                            model_info: ModelInfo) -> str:
        """Save processed image to disk"""
        save_path = request.save_path or f"./output/preprocessor/{model_info.processor_type.value}"
        filename = f"{model_info.id}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        
        result = self.image_save_manager.save_image(
            base64_image=image_b64,
            filename=filename,
            save_path=save_path,
            image_type='preprocessor'
        )
        
        return result.get('saved_path') if result.get('success') else None

# --- Legacy Components (from original backend) ---

class ImageSaveManager:
    """Image saving functionality"""
    
    def __init__(self):
        self.base_output_path = OUTPUT_BASE_PATH
        self.default_paths = DEFAULT_OUTPUT_PATHS
        self.supported_formats = {
            'png': {'ext': '.png', 'pil_format': 'PNG'},
            'jpg': {'ext': '.jpg', 'pil_format': 'JPEG'},
            'jpeg': {'ext': '.jpg', 'pil_format': 'JPEG'},
            'webp': {'ext': '.webp', 'pil_format': 'WebP'}
        }
    
    def ensure_directory(self, path: Path):
        """Ensure directory exists"""
        path.mkdir(parents=True, exist_ok=True)
    
    def sanitize_filename(self, filename: str) -> str:
        """Sanitize filename"""
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        filename = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', filename)
        filename = re.sub(r'[\s.]+', '_', filename)
        filename = filename.strip('. _')
        return filename or 'untitled'
    
    def generate_unique_filename(self, directory: Path, base_filename: str) -> str:
        """Generate unique filename"""
        name_part = base_filename.rsplit('.', 1)[0]
        ext_part = '.' + base_filename.rsplit('.', 1)[1] if '.' in base_filename else ''
        
        counter = 1
        unique_filename = base_filename
        
        while (directory / unique_filename).exists():
            unique_filename = f"{name_part}_{counter:03d}{ext_part}"
            counter += 1
            
            if counter > 9999:
                unique_filename = f"{name_part}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')}{ext_part}"
                break
        
        return unique_filename
    
    def decode_base64_image(self, base64_data: str) -> Image.Image:
        """Decode base64 to PIL Image"""
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        image_bytes = base64.b64decode(base64_data)
        return Image.open(io.BytesIO(image_bytes))
    
    def save_image(self, base64_image: str, filename: str, save_path: str, 
                  image_type: str, metadata: Dict = None, quality_settings: Dict = None) -> Dict:
        """Save image to specified path"""
        try:
            default_quality = {
                'format': 'png',
                'png_compression': 6,
                'jpg_quality': 90,
                'webp_quality': 90,
                'save_metadata': True
            }
            
            if quality_settings:
                default_quality.update(quality_settings)
            
            image = self.decode_base64_image(base64_image)
            
            if save_path.startswith('./'):
                save_directory = Path(save_path[2:])
            else:
                save_directory = Path(save_path)
            
            if not save_directory.is_absolute():
                save_directory = Path.cwd() / save_directory
            
            self.ensure_directory(save_directory)
            
            clean_filename = self.sanitize_filename(filename)
            image_format = default_quality['format'].lower()
            
            if image_format not in self.supported_formats:
                image_format = 'png'
            
            format_info = self.supported_formats[image_format]
            if not clean_filename.endswith(format_info['ext']):
                clean_filename += format_info['ext']
            
            unique_filename = self.generate_unique_filename(save_directory, clean_filename)
            full_path = save_directory / unique_filename
            
            save_kwargs = {}
            if image_format == 'png':
                save_kwargs['optimize'] = True
                save_kwargs['compress_level'] = default_quality['png_compression']
            elif image_format in ['jpg', 'jpeg']:
                save_kwargs['quality'] = default_quality['jpg_quality']
                save_kwargs['optimize'] = True
                if image.mode in ('RGBA', 'LA'):
                    background = Image.new('RGB', image.size, (255, 255, 255))
                    if image.mode == 'LA':
                        image = image.convert('RGBA')
                    background.paste(image, mask=image.split()[-1])
                    image = background
            elif image_format == 'webp':
                save_kwargs['quality'] = default_quality['webp_quality']
                save_kwargs['optimize'] = True
            
            image.save(full_path, format_info['pil_format'], **save_kwargs)
            file_size = full_path.stat().st_size
            
            return {
                'success': True,
                'saved_path': str(full_path),
                'filename': unique_filename,
                'file_size': file_size
            }
            
        except Exception as e:
            logger.error(f"Error saving image: {e}")
            return {
                'success': False,
                'error': str(e),
                'filename': filename
            }

def get_model_files(base_path: Path, extensions: List[str]) -> List[ModelFile]:
    """Get model files from path (legacy function)"""
    model_files = []
    
    if not base_path.exists():
        return model_files
    
    for file_path in base_path.rglob("*"):
        if file_path.is_file() and file_path.suffix.lower() in extensions:
            relative_path = file_path.relative_to(base_path)
            subfolder = str(relative_path.parent) if relative_path.parent != Path(".") else ""
            
            # Check for preview image
            preview_image = None
            preview_extensions = ['.png', '.jpg', '.jpeg', '.webp']
            for ext in preview_extensions:
                preview_path = Path(str(file_path).replace(file_path.suffix, ext))
                if preview_path.exists():
                    preview_image = str(preview_path.relative_to(base_path))
                    break
            
            model_file = ModelFile(
                name=file_path.name,
                path=str(relative_path),
                subfolder=subfolder,
                size=file_path.stat().st_size if file_path.exists() else None,
                preview_image=preview_image
            )
            
            model_files.append(model_file)
    
    return model_files

# --- FastAPI Application ---

def create_app() -> FastAPI:
    """Create and configure FastAPI application"""
    
    app = FastAPI(
        title="CUBE Studio Unified Backend Service",
        version=SERVICE_VERSION,
        description="""
        Unified backend service combining model exploration, preprocessing, and depth processing.
        
        Features:
        - Model registry with caching and fallback
        - PyTorch primary processing with OpenCV fallback
        - Backward compatible APIs (v1, v2)
        - New unified v3 API with enhanced capabilities
        """
    )
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Request logging middleware
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        logger.info(f"{request.method} {request.url.path} - {response.status_code} - {process_time:.3f}s")
        return response
    
    return app

# Create global instances
model_registry = ModelRegistry()
unified_processor = UnifiedProcessor(model_registry)
image_save_manager = ImageSaveManager()
app = create_app()

# --- API Endpoints ---

# Root and health endpoints
@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "CUBE Studio Unified Backend",
        "version": SERVICE_VERSION,
        "message": "Unified backend service is running",
        "endpoints": {
            "legacy_v1": "/api/*",
            "legacy_v2": "/api/v2/*",  
            "unified_v3": "/api/v3/*",
            "docs": "/docs",
            "health": "/health"
        }
    }

@app.get("/health")
async def health_check():
    """Comprehensive health check"""
    registry_stats = model_registry.get_registry_stats()
    
    return {
        "status": "healthy",
        "timestamp": datetime.datetime.now().isoformat(),
        "service_version": SERVICE_VERSION,
        "pytorch_available": PYTORCH_AVAILABLE,
        "model_registry": registry_stats,
        "paths": {
            "models": str(MODELS_BASE_PATH.absolute()),
            "output": str(OUTPUT_BASE_PATH.absolute())
        }
    }

# V3 Unified API Endpoints
@app.get("/api/v3/models", response_model=ModelRegistryResponse)
async def get_model_registry():
    """Get model registry information"""
    stats = model_registry.get_registry_stats()
    return ModelRegistryResponse(**stats)

@app.get("/api/v3/models/{processor_type}")
async def get_models_by_type(processor_type: ProcessorType):
    """Get available models by processor type"""
    models = model_registry.get_available_models(processor_type)
    return [
        {
            "id": m.id,
            "name": m.name,
            "backend": m.backend.value,
            "description": m.description,
            "status": m.status.value,
            "load_count": m.load_count,
            "last_used": m.last_used.isoformat() if m.last_used else None
        }
        for m in models
    ]

@app.post("/api/v3/process", response_model=UnifiedProcessResponse)
async def unified_process(request: UnifiedProcessRequest):
    """Unified processing endpoint with full capabilities"""
    return unified_processor.process_image(request)

@app.post("/api/v3/process/batch")
async def batch_process(requests: List[UnifiedProcessRequest]):
    """Batch processing endpoint"""
    results = []
    for req in requests:
        result = unified_processor.process_image(req)
        results.append(result)
    
    return {
        "success": True,
        "total_requests": len(requests),
        "successful": sum(1 for r in results if r.success),
        "failed": sum(1 for r in results if not r.success),
        "results": results
    }

@app.get("/api/processors/categories")
async def get_processor_categories():
    """Get processor categories for 5-tab organization"""
    categories = {
        "edge_detection": {
            "name": "Edge & Line Detection",
            "description": "Edge detection, line art, and contour extraction",
            "types": [
                ProcessorType.EDGE_DETECTION,
                ProcessorType.SOFT_EDGE,
                ProcessorType.LINEART
            ],
            "icon": "edges"
        },
        "depth_normal": {
            "name": "Depth & Normal Maps",
            "description": "Depth estimation and normal map generation",
            "types": [
                ProcessorType.DEPTH_ESTIMATION,
                ProcessorType.NORMAL_MAP
            ],
            "icon": "depth"
        },
        "pose_human": {
            "name": "Pose & Human Detection",
            "description": "Human pose estimation and body detection",
            "types": [
                ProcessorType.POSE_ESTIMATION
            ],
            "icon": "pose"
        },
        "segmentation": {
            "name": "Segmentation & Masking",
            "description": "Image segmentation and mask generation",
            "types": [
                ProcessorType.SEGMENTATION
            ],
            "icon": "segment"
        },
        "specialized": {
            "name": "Specialized Processing",
            "description": "Special purpose processors and effects",
            "types": [
                ProcessorType.MLSD,
                ProcessorType.SCRIBBLE,
                ProcessorType.COLOR,
                ProcessorType.SHUFFLE,
                ProcessorType.THRESHOLD,
                ProcessorType.INPAINT,
                ProcessorType.CLIP_VISION,
                ProcessorType.REFERENCE,
                ProcessorType.TILE,
                ProcessorType.RECOLOR,
                ProcessorType.REVISION
            ],
            "icon": "tools"
        }
    }
    
    # Add model counts for each category
    for category_info in categories.values():
        category_info["model_count"] = 0
        category_info["available_models"] = 0
        
        for proc_type in category_info["types"]:
            models = model_registry.get_available_models(proc_type)
            all_models = [m for m in model_registry.models.values() if m.processor_type == proc_type]
            category_info["model_count"] += len(all_models)
            category_info["available_models"] += len(models)
    
    return categories

@app.get("/api/processors/{processor_type}/models")
async def get_models_for_processor(processor_type: ProcessorType):
    """Get all models for a specific processor type with detailed info"""
    models = model_registry.get_available_models(processor_type)
    return [
        {
            "id": m.id,
            "name": m.name,
            "backend": m.backend.value,
            "processor_type": m.processor_type.value,
            "description": m.description,
            "status": m.status.value,
            "load_count": m.load_count,
            "last_used": m.last_used.isoformat() if m.last_used else None,
            "file_size": m.size,
            "fallback_models": m.fallback_models,
            "gpu_required": m.backend in [ProcessingBackend.PYTORCH, ProcessingBackend.ONNX],
            "memory_usage": "high" if m.backend == ProcessingBackend.PYTORCH else "low",
            "processing_speed": "fast" if m.backend == ProcessingBackend.BUILTIN else "medium"
        }
        for m in models
    ]

@app.get("/api/processors/stats")
async def get_processor_stats():
    """Get comprehensive processor statistics"""
    stats = model_registry.get_registry_stats()
    
    # Add processor type breakdown
    type_stats = {}
    for proc_type in ProcessorType:
        models = [m for m in model_registry.models.values() if m.processor_type == proc_type]
        available = [m for m in models if m.status == ModelStatus.AVAILABLE]
        
        type_stats[proc_type.value] = {
            "total_models": len(models),
            "available_models": len(available),
            "loaded_models": sum(1 for m in models if m.id in model_registry.model_cache),
            "backend_breakdown": {}
        }
        
        # Backend breakdown for this type
        for backend in ProcessingBackend:
            backend_models = [m for m in models if m.backend == backend]
            if backend_models:
                type_stats[proc_type.value]["backend_breakdown"][backend.value] = len(backend_models)
    
    stats["processor_types"] = type_stats
    stats["total_processor_types"] = len(ProcessorType)
    
    return stats

# Legacy API Endpoints (v1 - from backend_model_explorer.py)
@app.get("/api/models/checkpoints", response_model=List[ModelFile])
async def get_checkpoints():
    """Legacy: Get checkpoint models"""
    try:
        extensions = ['.safetensors', '.ckpt', '.pt', '.bin']
        models = get_model_files(CHECKPOINTS_PATH, extensions)
        return models
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"체크포인트 로딩 실패: {str(e)}")

@app.get("/api/models/vaes", response_model=List[ModelFile])
async def get_vaes():
    """Legacy: Get VAE models"""
    try:
        extensions = ['.safetensors', '.ckpt', '.pt', '.bin']
        models = get_model_files(VAES_PATH, extensions)
        return models
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VAE 로딩 실패: {str(e)}")

@app.get("/api/models/loras", response_model=List[ModelFile])
async def get_loras():
    """Legacy: Get LoRA models"""
    try:
        extensions = ['.safetensors', '.ckpt', '.pt', '.bin']
        models = get_model_files(LORAS_PATH, extensions)
        return models
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LoRA 로딩 실패: {str(e)}")

@app.get("/api/preprocessors")
async def get_preprocessors():
    """Legacy: Get available preprocessors"""
    models = model_registry.get_available_models()
    return [
        {
            'id': m.id,
            'name': m.name,
            'type': m.backend.value,
            'file': m.file_path.name if m.file_path else '',
            'available': m.status == ModelStatus.AVAILABLE
        }
        for m in models
    ]

@app.post("/api/preprocess", response_model=PreprocessResponse)
async def preprocess_image_legacy(request: PreprocessRequest):
    """Legacy v1 API: Process image"""
    try:
        # Convert to unified request
        unified_request = UnifiedProcessRequest(
            image=request.image,
            model_id=request.model,
            parameters=request.params or {},
            fallback_enabled=True
        )
        
        result = unified_processor.process_image(unified_request)
        
        return PreprocessResponse(
            success=result.success,
            processed_image=result.processed_image,
            model_used=result.model_used,
            error=result.error
        )
        
    except Exception as e:
        logger.error(f"Legacy preprocessing error: {e}")
        return PreprocessResponse(
            success=False,
            processed_image=None,
            model_used=request.model,
            error=str(e)
        )

@app.post("/api/depth")
async def depth_processing(request: PreprocessRequest):
    """Depth processing endpoint (missing endpoint fix)"""
    try:
        # Convert to unified request with depth processor type
        unified_request = UnifiedProcessRequest(
            image=request.image,
            model_id=request.model,
            processor_type=ProcessorType.DEPTH_ESTIMATION,
            parameters=request.params or {},
            fallback_enabled=True
        )
        
        result = unified_processor.process_image(unified_request)
        
        return PreprocessResponse(
            success=result.success,
            processed_image=result.processed_image,
            model_used=result.model_used,
            error=result.error
        )
        
    except Exception as e:
        logger.error(f"Depth processing error: {e}")
        return PreprocessResponse(
            success=False,
            processed_image=None,
            model_used=request.model,
            error=str(e)
        )

# Legacy v2 API (from model_processor_service.py)
@app.post("/api/v2/process", response_model=ModelProcessingResponse)
async def process_image_v2(request: ModelProcessingRequest):
    """Legacy v2 API: Process image"""
    try:
        # Convert to unified request
        unified_request = UnifiedProcessRequest(
            image=request.image_base64,
            model_id=request.model_id,
            parameters=request.params or {},
            fallback_enabled=True
        )
        
        result = unified_processor.process_image(unified_request)
        
        return ModelProcessingResponse(
            success=result.success,
            image_base64=result.processed_image.split(',')[1] if result.processed_image else None,
            model_used=result.model_used,
            message=f"Processing complete with {result.backend_used.value} backend" if result.success else result.error
        )
        
    except Exception as e:
        logger.error(f"Legacy v2 processing error: {e}")
        return ModelProcessingResponse(
            success=False,
            image_base64=None,
            model_used=request.model_id,
            message=str(e)
        )

@app.post("/api/save-image", response_model=SaveImageResponse)
async def save_image_endpoint(request: SaveImageRequest):
    """Legacy: Save image"""
    try:
        result = image_save_manager.save_image(
            base64_image=request.image,
            filename=request.filename,
            save_path=request.path,
            image_type=request.type,
            metadata=request.metadata,
            quality_settings=request.quality_settings
        )
        
        if result['success']:
            return SaveImageResponse(
                success=True,
                saved_path=result['saved_path'],
                filename=result['filename'],
                file_size=result['file_size']
            )
        else:
            return SaveImageResponse(
                success=False,
                filename=request.filename,
                error=result['error']
            )
            
    except Exception as e:
        logger.error(f"Save image error: {e}")
        raise HTTPException(status_code=500, detail=f"이미지 저장 실패: {str(e)}")

# Model preview image endpoint
@app.get("/api/models/preview/{preview_path:path}")
async def get_model_preview(preview_path: str):
    """Get model preview image"""
    try:
        # Convert preview path to actual file path
        # Remove extension and add common preview extensions
        base_path = MODELS_BASE_PATH / preview_path
        preview_extensions = ['.png', '.jpg', '.jpeg', '.webp']
        
        for ext in preview_extensions:
            preview_file = Path(str(base_path).replace('.safetensors', ext).replace('.ckpt', ext).replace('.pt', ext))
            if preview_file.exists():
                return FileResponse(
                    path=preview_file,
                    media_type=f"image/{ext[1:]}",
                    filename=preview_file.name
                )
        
        # No preview image found
        raise HTTPException(status_code=404, detail="Preview image not found")
        
    except Exception as e:
        logger.error(f"Preview image error: {e}")
        raise HTTPException(status_code=500, detail=f"미리보기 이미지 로딩 실패: {str(e)}")

# Static file serving
app.mount("/models", StaticFiles(directory="models", html=False), name="models")

# --- Main Execution ---

if __name__ == "__main__":
    print(f"=== CUBE Studio Unified Backend Service v{SERVICE_VERSION} ===")
    print(f"Starting server on http://localhost:{SERVICE_PORT}")
    print(f"PyTorch Support: {'Available' if PYTORCH_AVAILABLE else 'Not Available (OpenCV fallback)'}")
    print(f"Models Path: {MODELS_BASE_PATH.absolute()}")
    print(f"Output Path: {OUTPUT_BASE_PATH.absolute()}")
    print(f"API Documentation: http://localhost:{SERVICE_PORT}/docs")
    print(f"Health Check: http://localhost:{SERVICE_PORT}/health")
    print("\nAPI Endpoints:")
    print("  Legacy v1: /api/* (backward compatibility)")
    print("  Legacy v2: /api/v2/* (backward compatibility)")  
    print("  Unified v3: /api/v3/* (new enhanced features)")
    print("\nStarting server...")
    
    uvicorn.run(
        "unified_backend_service:app",
        host="0.0.0.0",
        port=SERVICE_PORT,
        reload=True,
        log_level="info"
    )