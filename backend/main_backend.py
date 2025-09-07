#!/usr/bin/env python3
"""
CUBE Studio - Modular Backend Service
Unified backend service with properly separated modular architecture.

Architecture:
- Model Explorer Service: Handles checkpoints, VAE, and LoRA file discovery
- ControlNet Service: Handles depth and edge detection processing
- Image Utils: Common image processing and saving functionality
- Clean separation of concerns and responsibilities

Port: 9004 (Unified service replacing the monolithic approach)
"""

import os
import logging
import time
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import our modular services and data models
from .models.data_models import (
    ModelFile, ProcessorType,
    UnifiedProcessRequest, UnifiedProcessResponse, ModelRegistryResponse,
    PreprocessRequest, PreprocessResponse,
    ModelProcessingRequest, ModelProcessingResponse,
    SaveImageRequest, SaveImageResponse
)
from .services.model_explorer_service import ModelExplorerService
from .services.controlnet_service import ControlNetService
from .utils.image_utils import ImageSaveManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('modular_backend.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# --- Configuration ---
SERVICE_PORT = 9004
SERVICE_VERSION = "4.0.0-modular"

# Paths
MODELS_BASE_PATH = Path("models")
CHECKPOINTS_PATH = MODELS_BASE_PATH / "checkpoints"
VAES_PATH = MODELS_BASE_PATH / "vae"
LORAS_PATH = MODELS_BASE_PATH / "loras"
PREPROCESSORS_PATH = MODELS_BASE_PATH / "preprocessors"
OUTPUT_BASE_PATH = Path("output")

# PyTorch availability check
try:
    import torch
    PYTORCH_AVAILABLE = True
    logger.info("PyTorch available for ControlNet processing")
except ImportError:
    PYTORCH_AVAILABLE = False
    logger.warning("PyTorch not available - using OpenCV/built-in fallbacks")


def create_app() -> FastAPI:
    """Create and configure the modular FastAPI application"""
    
    app = FastAPI(
        title="CUBE Studio Modular Backend Service",
        version=SERVICE_VERSION,
        description="""
        Modular backend service with clean separation of concerns:
        
        Services:
        - Model Explorer: Checkpoint, VAE, and LoRA file management
        - ControlNet: Depth estimation and edge detection processing
        - Image Utils: Common image processing and saving
        
        Features:
        - Clean modular architecture
        - Proper separation of responsibilities
        - Backward compatible APIs (v1, v2)
        - New unified v3 API
        - PyTorch + OpenCV + built-in fallbacks
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


# Create app and initialize services
app = create_app()

# Initialize modular services
model_explorer_service = ModelExplorerService(MODELS_BASE_PATH)
controlnet_service = ControlNetService(PREPROCESSORS_PATH)  
image_save_manager = ImageSaveManager(OUTPUT_BASE_PATH)

logger.info(f"Modular Backend Service v{SERVICE_VERSION} initialized")
logger.info(f"Model Explorer: {MODELS_BASE_PATH}")
logger.info(f"ControlNet: {PREPROCESSORS_PATH}")
logger.info(f"Output: {OUTPUT_BASE_PATH}")


# --- Root and Health Endpoints ---

@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "CUBE Studio Modular Backend",
        "version": SERVICE_VERSION,
        "architecture": "modular",
        "message": "Modular backend service with separated concerns",
        "services": {
            "model_explorer": "Checkpoint, VAE, LoRA file management",
            "controlnet": "Depth estimation and edge detection",
            "image_utils": "Image processing and saving"
        },
        "endpoints": {
            "legacy_v1": "/api/* (Model Explorer APIs)",
            "legacy_v2": "/api/v2/* (ControlNet APIs)",  
            "unified_v3": "/api/v3/* (New unified APIs)",
            "docs": "/docs",
            "health": "/health"
        }
    }

@app.get("/health")
async def health_check():
    """Comprehensive health check"""
    try:
        # Get stats from all services
        model_stats = model_explorer_service.get_stats()
        controlnet_stats = controlnet_service.get_registry_stats()
        
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "service_version": SERVICE_VERSION,
            "architecture": "modular",
            "pytorch_available": PYTORCH_AVAILABLE,
            "services": {
                "model_explorer": {
                    "status": "healthy",
                    "stats": model_stats
                },
                "controlnet": {
                    "status": "healthy", 
                    "stats": controlnet_stats
                },
                "image_utils": {
                    "status": "healthy",
                    "base_path": str(OUTPUT_BASE_PATH)
                }
            },
            "paths": {
                "models": str(MODELS_BASE_PATH.absolute()),
                "output": str(OUTPUT_BASE_PATH.absolute()),
                "preprocessors": str(PREPROCESSORS_PATH.absolute())
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "unhealthy",
                "timestamp": datetime.now().isoformat(),
                "error": str(e)
            }
        )


# --- V3 Unified API Endpoints ---

@app.get("/api/v3/models", response_model=ModelRegistryResponse)
async def get_model_registry():
    """Get unified model registry information"""
    try:
        controlnet_stats = controlnet_service.get_registry_stats()
        return ModelRegistryResponse(**controlnet_stats)
    except Exception as e:
        logger.error(f"Error getting model registry: {e}")
        raise HTTPException(status_code=500, detail=f"모델 레지스트리 조회 실패: {str(e)}")

@app.get("/api/v3/models/{processor_type}")
async def get_models_by_type(processor_type: ProcessorType):
    """Get available models by processor type"""
    try:
        models = controlnet_service.get_available_models(processor_type)
        return models
    except Exception as e:
        logger.error(f"Error getting models by type {processor_type}: {e}")
        raise HTTPException(status_code=500, detail=f"모델 타입별 조회 실패: {str(e)}")

@app.post("/api/v3/process", response_model=UnifiedProcessResponse)
async def unified_process(request: UnifiedProcessRequest):
    """Unified processing endpoint - routes to ControlNet service"""
    try:
        return controlnet_service.process_image(request)
    except Exception as e:
        logger.error(f"Unified processing error: {e}")
        raise HTTPException(status_code=500, detail=f"통합 처리 실패: {str(e)}")

@app.post("/api/v3/process/batch")
async def batch_process(requests: List[UnifiedProcessRequest]):
    """Batch processing endpoint"""
    try:
        results = []
        for req in requests:
            result = controlnet_service.process_image(req)
            results.append(result)
        
        return {
            "success": True,
            "total_requests": len(requests),
            "successful": sum(1 for r in results if r.success),
            "failed": sum(1 for r in results if not r.success),
            "results": results
        }
    except Exception as e:
        logger.error(f"Batch processing error: {e}")
        raise HTTPException(status_code=500, detail=f"배치 처리 실패: {str(e)}")


# --- V1 Legacy API Endpoints (Model Explorer Service) ---

@app.get("/api/models/checkpoints", response_model=List[ModelFile])
async def get_checkpoints():
    """Legacy: Get checkpoint models via Model Explorer service"""
    try:
        return model_explorer_service.get_checkpoints()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting checkpoints: {e}")
        raise HTTPException(status_code=500, detail=f"체크포인트 로딩 실패: {str(e)}")

@app.get("/api/models/vaes", response_model=List[ModelFile])
async def get_vaes():
    """Legacy: Get VAE models via Model Explorer service"""
    try:
        return model_explorer_service.get_vaes()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting VAEs: {e}")
        raise HTTPException(status_code=500, detail=f"VAE 로딩 실패: {str(e)}")

@app.get("/api/models/loras", response_model=List[ModelFile])
async def get_loras():
    """Legacy: Get LoRA models via Model Explorer service"""
    try:
        return model_explorer_service.get_loras()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting LoRAs: {e}")
        raise HTTPException(status_code=500, detail=f"LoRA 로딩 실패: {str(e)}")

@app.get("/api/preprocessors")
async def get_preprocessors():
    """Legacy: Get available preprocessors via ControlNet service"""
    try:
        models = controlnet_service.get_available_models()
        return models
    except Exception as e:
        logger.error(f"Error getting preprocessors: {e}")
        raise HTTPException(status_code=500, detail=f"전처리기 조회 실패: {str(e)}")

@app.post("/api/preprocess", response_model=PreprocessResponse)
async def preprocess_image_legacy(request: PreprocessRequest):
    """Legacy v1 API: Process image via ControlNet service"""
    try:
        # Convert to unified request
        unified_request = UnifiedProcessRequest(
            image=request.image,
            model_id=request.model,
            parameters=request.params or {},
            fallback_enabled=True
        )
        
        result = controlnet_service.process_image(unified_request)
        
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
    """Depth processing endpoint via ControlNet service"""
    try:
        # Convert to unified request with depth processor type
        unified_request = UnifiedProcessRequest(
            image=request.image,
            model_id=request.model,
            processor_type=ProcessorType.DEPTH_ESTIMATION,
            parameters=request.params or {},
            fallback_enabled=True
        )
        
        result = controlnet_service.process_image(unified_request)
        
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


# --- V2 Legacy API Endpoints (ControlNet Service) ---

@app.post("/api/v2/process", response_model=ModelProcessingResponse)
async def process_image_v2(request: ModelProcessingRequest):
    """Legacy v2 API: Process image via ControlNet service"""
    try:
        # Convert to unified request
        unified_request = UnifiedProcessRequest(
            image=request.image_base64,
            model_id=request.model_id,
            parameters=request.params or {},
            fallback_enabled=True
        )
        
        result = controlnet_service.process_image(unified_request)
        
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


# --- Common Endpoints ---

@app.post("/api/save-image", response_model=SaveImageResponse)
async def save_image_endpoint(request: SaveImageRequest):
    """Save image via Image Utils service"""
    try:
        return image_save_manager.save_image_from_request(request)
    except Exception as e:
        logger.error(f"Save image error: {e}")
        raise HTTPException(status_code=500, detail=f"이미지 저장 실패: {str(e)}")

@app.get("/api/models/preview/{preview_path:path}")
async def get_model_preview(preview_path: str):
    """Get model preview image via Model Explorer service"""
    try:
        return model_explorer_service.get_model_preview(preview_path)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting preview: {e}")
        raise HTTPException(status_code=500, detail=f"미리보기 이미지 로딩 실패: {str(e)}")


# --- Static File Serving ---

# Mount static files for model access
app.mount("/models", StaticFiles(directory="models", html=False), name="models")


# --- Main Execution ---

if __name__ == "__main__":
    print(f"=== CUBE Studio Modular Backend Service v{SERVICE_VERSION} ===")
    print(f"Architecture: Modular with separated services")
    print(f"Starting server on http://localhost:{SERVICE_PORT}")
    print(f"PyTorch Support: {'Available' if PYTORCH_AVAILABLE else 'Not Available (OpenCV fallback)'}")
    print("")
    print("Services:")
    print(f"  Model Explorer: {MODELS_BASE_PATH.absolute()}")
    print(f"  ControlNet: {PREPROCESSORS_PATH.absolute()}")
    print(f"  Image Utils: {OUTPUT_BASE_PATH.absolute()}")
    print("")
    print(f"API Documentation: http://localhost:{SERVICE_PORT}/docs")
    print(f"Health Check: http://localhost:{SERVICE_PORT}/health")
    print("")
    print("API Endpoints:")
    print("  Legacy v1: /api/* (Model Explorer - checkpoints, VAE, LoRA)")
    print("  Legacy v2: /api/v2/* (ControlNet - depth, edge processing)")  
    print("  Unified v3: /api/v3/* (New modular enhanced features)")
    print("")
    print("Starting modular backend service...")
    
    uvicorn.run(
        "backend.main_backend:app",
        host="0.0.0.0",
        port=SERVICE_PORT,
        reload=True,
        log_level="info"
    )