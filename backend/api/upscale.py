"""
Upscale API endpoints
Provides image upscaling functionality with RealESRGAN
"""

import logging
import base64
import io
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from PIL import Image

from backend.services.upscale_service import get_upscale_service
from backend.models.config_manager import get_config_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/upscale", tags=["upscale"])

# Initialize services
config_manager = get_config_manager()
upscale_service = get_upscale_service(models_path=config_manager.upscalers_path)


class UpscaleRequest(BaseModel):
    """Request model for upscaling"""
    image: str = Field(..., description="Base64 encoded image")
    model_name: str = Field(..., description="Name of upscale model to use")
    scale_factor: float = Field(default=2.0, ge=1.0, le=4.0, description="Scale factor (1.0-4.0)")
    tile_size: int = Field(default=512, ge=256, le=1024, description="Tile size for processing")
    overlap: int = Field(default=64, ge=0, le=256, description="Overlap between tiles")


class UpscaleResponse(BaseModel):
    """Response model for upscaling"""
    success: bool
    image: Optional[str] = Field(None, description="Base64 encoded upscaled image")
    original_size: Optional[List[int]] = Field(None, description="Original [width, height]")
    upscaled_size: Optional[List[int]] = Field(None, description="Upscaled [width, height]")
    scale_factor: Optional[float] = None
    error: Optional[str] = None


class ModelInfo(BaseModel):
    """Model information"""
    name: str
    filename: str
    filepath: str
    size_mb: float
    native_scale: int
    format: str


class ModelsResponse(BaseModel):
    """Response model for model listing"""
    success: bool
    models: List[ModelInfo]
    count: int


@router.get("/models", response_model=ModelsResponse)
async def get_available_models():
    """
    Get list of available upscale models

    Returns:
        List of model information
    """
    try:
        models = upscale_service.scan_available_models()

        return ModelsResponse(
            success=True,
            models=models,
            count=len(models)
        )

    except Exception as e:
        logger.error(f"Failed to scan models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process", response_model=UpscaleResponse)
async def upscale_image(request: UpscaleRequest):
    """
    Upscale image using specified model

    Args:
        request: UpscaleRequest with image data and parameters

    Returns:
        UpscaleResponse with upscaled image
    """
    try:
        logger.info(f"Upscale request: model={request.model_name}, scale={request.scale_factor}x")

        # Decode base64 image
        try:
            image_data = base64.b64decode(request.image)
            image = Image.open(io.BytesIO(image_data))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")

        original_size = list(image.size)
        logger.info(f"Original image size: {original_size[0]}x{original_size[1]}")

        # Find model file
        models = upscale_service.scan_available_models()
        model_file = None

        for model in models:
            if model['name'] == request.model_name or model['filename'] == request.model_name:
                model_file = model['filepath']
                break

        if not model_file:
            raise HTTPException(status_code=404, detail=f"Model not found: {request.model_name}")

        # Load model if needed
        if upscale_service.loaded_model_name != model_file:
            logger.info(f"Loading model: {model_file}")
            success = upscale_service.load_model(model_file)

            if not success:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to load model. Ensure RealESRGAN library is installed: pip install realesrgan basicsr"
                )

        # Upscale image
        upscaled_image = upscale_service.upscale_image(
            image=image,
            scale_factor=request.scale_factor,
            tile_size=request.tile_size,
            overlap=request.overlap
        )

        if upscaled_image is None:
            raise HTTPException(status_code=500, detail="Upscale processing failed")

        upscaled_size = list(upscaled_image.size)
        logger.info(f"Upscaled image size: {upscaled_size[0]}x{upscaled_size[1]}")

        # Encode result to base64
        buffer = io.BytesIO()
        upscaled_image.save(buffer, format='PNG')
        buffer.seek(0)
        encoded_image = base64.b64encode(buffer.read()).decode('utf-8')

        return UpscaleResponse(
            success=True,
            image=encoded_image,
            original_size=original_size,
            upscaled_size=upscaled_size,
            scale_factor=request.scale_factor
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upscale failed: {e}", exc_info=True)
        return UpscaleResponse(
            success=False,
            error=str(e)
        )


@router.get("/status")
async def get_upscale_status():
    """
    Get current upscale service status

    Returns:
        Status information including loaded model
    """
    model_info = upscale_service.get_model_info()

    return {
        "success": True,
        "model_loaded": model_info is not None,
        "model_info": model_info,
        "device": upscale_service.device
    }


@router.post("/unload")
async def unload_model():
    """
    Unload current model and free memory

    Returns:
        Success status
    """
    try:
        upscale_service.unload_model()

        return {
            "success": True,
            "message": "Model unloaded successfully"
        }

    except Exception as e:
        logger.error(f"Failed to unload model: {e}")
        raise HTTPException(status_code=500, detail=str(e))
