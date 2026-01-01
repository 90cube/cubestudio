#!/usr/bin/env python3
"""
CUBE Studio - Backend Main Application (v4.0)
Modularized backend service with separated API routes.

Main application entry point for the CUBE Studio backend.
"""

# Standard library imports
import logging
import time
from typing import Any, Dict

# Third-party imports
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

# Backend imports
from .models.config_manager import get_config_manager
from .models.processor import (
    ProcessorType, scan_available_models, create_processor_registry, PROCESSOR_CATEGORIES
)
from .services.model_scanner import ModelScanner
from .services.processor_service import ProcessorService
from .services.image_service import ImageService
from .services.checkpoint_loader import CheckpointLoader
from .services.sd_pipeline_service import SDPipelineService

# API routes
from .api.processors import router as processors_router
from .api.models import router as models_router
from .api.processing import router as processing_router
from .api.model_status import router as model_status_router
from .api.pose import router as pose_router
from .api.generation import router as generation_router
from .api.generation_ws import router as generation_ws_router
from .api.controlnet import router as controlnet_router
from .api.upscale import router as upscale_router

# Initialize configuration
config_manager = get_config_manager()
config_manager.create_missing_directories()
config_manager.print_configuration()

# Configure logging - CONSOLE ONLY to prevent frontend restart loops
# File logging disabled per CLAUDE.md frontend restart prevention rules
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
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


def create_app() -> FastAPI:
    """Create and configure FastAPI application"""
    
    # Create FastAPI app
    app = FastAPI(
        title=config_manager.api_title,
        description=config_manager.api_description,
        version=config_manager.api_version
    )

    # CORS middleware - explicit origin for development
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            'http://127.0.0.1:9000',
            'http://localhost:9000',
            'http://127.0.0.1:8080',
            'http://localhost:8080'
        ],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
        expose_headers=['*'],
        max_age=3600
    )

    # Initialize model scanner
    model_scanner = ModelScanner(config_manager)

    # Initialize processor service
    processor_service = ProcessorService(config_manager)

    # Get processor registry and available models from service
    processor_registry = processor_service.get_processor_registry()
    available_models = processor_service.get_available_models()
    available_count = len([m for m in available_models.values() if m['available']])
    total_count = len(available_models)
    logger.info(f"Model scan complete: {available_count}/{total_count} models available")

    # Initialize enhanced preprocessing if available
    enhanced_processing_enabled = False
    if ENHANCED_PREPROCESSING_AVAILABLE:
        try:
            # Set up globals that the integration script expects
            globals()['PREPROCESSOR_MODELS_PATH'] = config_manager.preprocessors_path
            
            # Integrate enhanced preprocessors
            integration_success = integrate_enhanced_preprocessors()
            
            if integration_success:
                logger.info("Enhanced preprocessing system integrated successfully")
                enhanced_processing_enabled = True
            else:
                logger.warning("Enhanced preprocessing integration failed, using fallback")
        except Exception as e:
            logger.error(f"Enhanced preprocessing initialization failed: {e}")
            logger.info("Using standard preprocessing system")

    # Initialize image service
    image_service = ImageService(processor_registry, available_models, config_manager)

    # Initialize checkpoint loader
    checkpoint_loader = CheckpointLoader(config_manager)

    # Initialize SD pipeline service
    sd_pipeline_service = SDPipelineService(config_manager, checkpoint_loader)

    # Store services in app state for access in routes
    app.state.model_scanner = model_scanner
    app.state.processor_service = processor_service
    app.state.image_service = image_service
    app.state.checkpoint_loader = checkpoint_loader
    app.state.sd_pipeline_service = sd_pipeline_service
    app.state.enhanced_processing_enabled = enhanced_processing_enabled
    app.state.config = config_manager

    # Health check endpoint
    @app.get("/")
    async def root():
        """Health check"""
        return {"status": "running", "service": f"{config_manager.api_title} {config_manager.api_version}"}

    # Add compatibility endpoint for /api/pose-detection (must be before routers)
    @app.post("/api/pose-detection")
    async def pose_detection_compat(request: dict):
        """Compatibility endpoint for legacy frontend calls expecting an image result.

        Maps payload keys {model, params} to current processing API {processor, parameters}.
        Always returns an image result.
        """
        try:
            image_service = app.state.image_service

            processor = request.get('model') or request.get('processor') or 'dwpose_builtin'
            image = request.get('image')
            params = request.get('params') or request.get('parameters') or {}
            # Ensure image output
            params = dict(params)
            params['output_format'] = 'image'

            if not image:
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail='Missing image')

            result = image_service.process_image_v3(
                processor=processor,
                image=image,
                parameters=params
            )

            return result
        except Exception as e:
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=str(e))

    # Include routers (MUST be before static file mounts)
    app.include_router(processors_router, prefix="/api", tags=["processors"])
    app.include_router(models_router, prefix="/api", tags=["models"])
    app.include_router(processing_router, prefix="/api", tags=["processing"])
    app.include_router(model_status_router, prefix="/api", tags=["model-status"])
    app.include_router(pose_router, prefix="/api/pose", tags=["pose"])
    app.include_router(generation_router, prefix="/api", tags=["generation"])
    app.include_router(generation_ws_router, prefix="/api", tags=["generation-websocket"])
    app.include_router(controlnet_router, tags=["controlnet"])
    app.include_router(upscale_router, tags=["upscale"])

    # Mount output folder as static files (for generated images)
    output_path = Path("output")
    output_path.mkdir(exist_ok=True)
    app.mount("/output", StaticFiles(directory="output"), name="output")

    return app


def main():
    """Main application entry point"""
    logger.info(f"[START] Starting {config_manager.api_title} {config_manager.api_version}")
    logger.info(f"[PATH] Models path: {config_manager.preprocessors_path}")
    
    # Print configuration status
    config_manager.print_configuration()
    
    # Create app
    app = create_app()
    
    # Start server with increased limits for large image responses
    uvicorn.run(
        app,
        host=config_manager.server_host,
        port=config_manager.server_port,
        log_level=config_manager.log_level,
        limit_concurrency=1000,
        limit_max_requests=10000,
        timeout_keep_alive=300,  # 5 minutes
        h11_max_incomplete_event_size=100 * 1024 * 1024  # 100MB for large base64 responses
    )


if __name__ == "__main__":
    main()
