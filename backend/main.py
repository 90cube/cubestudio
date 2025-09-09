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

# Backend imports
from backend.models.config_manager import get_config_manager
from backend.models.processor import (
    ProcessorType, scan_available_models, create_processor_registry, PROCESSOR_CATEGORIES
)
from backend.services.model_scanner import ModelScanner
from backend.services.processor_service import ProcessorService
from backend.services.image_service import ImageService

# API routes
from backend.api.processors import router as processors_router
from backend.api.models import router as models_router
from backend.api.processing import router as processing_router

# Initialize configuration
config_manager = get_config_manager()
config_manager.create_missing_directories()
config_manager.print_configuration()

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


def create_app() -> FastAPI:
    """Create and configure FastAPI application"""
    
    # Create FastAPI app
    app = FastAPI(
        title=config_manager.api_title,
        description=config_manager.api_description,
        version=config_manager.api_version
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
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

    # Store services in app state for access in routes
    app.state.model_scanner = model_scanner
    app.state.processor_service = processor_service
    app.state.image_service = image_service
    app.state.enhanced_processing_enabled = enhanced_processing_enabled
    app.state.config = config_manager

    # Health check endpoint
    @app.get("/")
    async def root():
        """Health check"""
        return {"status": "running", "service": f"{config_manager.api_title} {config_manager.api_version}"}

    # Include routers
    app.include_router(processors_router, prefix="/api", tags=["processors"])
    app.include_router(models_router, prefix="/api", tags=["models"])
    app.include_router(processing_router, prefix="/api", tags=["processing"])

    return app


def main():
    """Main application entry point"""
    logger.info(f"[START] Starting {config_manager.api_title} {config_manager.api_version}")
    logger.info(f"[PATH] Models path: {config_manager.preprocessors_path}")
    
    # Print configuration status
    config_manager.print_configuration()
    
    # Create app
    app = create_app()
    
    # Start server
    uvicorn.run(app, host=config_manager.server_host, port=config_manager.server_port, log_level=config_manager.log_level)


if __name__ == "__main__":
    main()