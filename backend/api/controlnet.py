#!/usr/bin/env python3
"""
CUBE Studio - ControlNet API Routes
Handles ControlNet model detection and management.
"""

import logging
from pathlib import Path
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/controlnet", tags=["controlnet"])


class ControlNetModel(BaseModel):
    """ControlNet model information"""
    name: str
    path: str
    type: str  # SD15, SDXL, etc.
    preprocessor: str  # depth, canny, openpose, etc.
    size: int  # File size in bytes


class ControlNetModelsResponse(BaseModel):
    """Response for available ControlNet models"""
    success: bool
    models: List[ControlNetModel]
    total_count: int
    sd15_count: int
    sdxl_count: int


def detect_preprocessor_type(filename: str) -> str:
    """Detect preprocessor type from filename"""
    filename_lower = filename.lower()

    if 'depth' in filename_lower:
        return 'depth'
    elif 'canny' in filename_lower:
        return 'canny'
    elif 'openpose' in filename_lower or 'pose' in filename_lower:
        return 'openpose'
    elif 'scribble' in filename_lower:
        return 'scribble'
    elif 'hed' in filename_lower or 'edge' in filename_lower:
        return 'hed'
    elif 'normal' in filename_lower:
        return 'normal'
    elif 'seg' in filename_lower or 'semantic' in filename_lower:
        return 'segmentation'
    elif 'style' in filename_lower or 't2i' in filename_lower:
        return 'style'
    else:
        return 'unknown'


def scan_controlnet_models(base_path: Path) -> List[ControlNetModel]:
    """Scan ControlNet models directory"""
    models = []

    if not base_path.exists():
        logger.warning(f"ControlNet models directory not found: {base_path}")
        return models

    # Scan SD15 and SDXL subdirectories
    for model_type_dir in base_path.iterdir():
        if not model_type_dir.is_dir():
            continue

        model_type = model_type_dir.name  # SD15, SDXL, etc.

        # Scan for .safetensors and .pth files
        for model_file in model_type_dir.glob('*'):
            if model_file.suffix.lower() in ['.safetensors', '.pth', '.pt']:
                preprocessor = detect_preprocessor_type(model_file.stem)

                models.append(ControlNetModel(
                    name=model_file.stem,
                    path=str(model_file.relative_to(base_path)),
                    type=model_type,
                    preprocessor=preprocessor,
                    size=model_file.stat().st_size
                ))

    return models


@router.get("/models", response_model=ControlNetModelsResponse)
async def get_controlnet_models():
    """
    Get all available ControlNet models

    Returns:
        List of ControlNet models with metadata
    """
    try:
        # Path to ControlNet models
        controlnet_path = Path("models/controlnet")

        # Scan models
        models = scan_controlnet_models(controlnet_path)

        # Count by type
        sd15_count = sum(1 for m in models if m.type == "SD15")
        sdxl_count = sum(1 for m in models if m.type == "SDXL")

        logger.info(f"Found {len(models)} ControlNet models (SD15: {sd15_count}, SDXL: {sdxl_count})")

        return ControlNetModelsResponse(
            success=True,
            models=models,
            total_count=len(models),
            sd15_count=sd15_count,
            sdxl_count=sdxl_count
        )

    except Exception as e:
        logger.error(f"Failed to scan ControlNet models: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/{model_type}")
async def get_controlnet_models_by_type(model_type: str):
    """
    Get ControlNet models filtered by type (SD15, SDXL)

    Args:
        model_type: Model type to filter (SD15, SDXL)

    Returns:
        List of ControlNet models for specified type
    """
    try:
        controlnet_path = Path("models/controlnet")
        models = scan_controlnet_models(controlnet_path)

        # Filter by type
        filtered_models = [m for m in models if m.type.upper() == model_type.upper()]

        return {
            "success": True,
            "model_type": model_type,
            "models": filtered_models,
            "count": len(filtered_models)
        }

    except Exception as e:
        logger.error(f"Failed to get ControlNet models for type {model_type}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preprocessors")
async def get_available_preprocessors():
    """
    Get list of available preprocessor types

    Returns:
        List of supported preprocessor types
    """
    return {
        "success": True,
        "preprocessors": [
            {"id": "depth", "name": "Depth", "description": "Depth map estimation"},
            {"id": "canny", "name": "Canny Edge", "description": "Edge detection"},
            {"id": "openpose", "name": "OpenPose", "description": "Human pose detection"},
            {"id": "scribble", "name": "Scribble", "description": "Scribble/sketch"},
            {"id": "hed", "name": "HED Soft Edge", "description": "Soft edge detection"},
            {"id": "normal", "name": "Normal Map", "description": "Surface normal estimation"},
            {"id": "segmentation", "name": "Segmentation", "description": "Semantic segmentation"},
            {"id": "style", "name": "Style/T2I", "description": "Style adapter"}
        ]
    }
