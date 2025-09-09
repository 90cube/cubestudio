"""
Models API Router
Handles all model-related API endpoints (checkpoints, VAEs, etc.).
"""

import logging
from fastapi import APIRouter, Request, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/models/checkpoints")
async def get_checkpoints(request: Request):
    """Get available checkpoint models"""
    model_scanner = request.app.state.model_scanner
    
    try:
        checkpoints = model_scanner.scan_checkpoints()
        logger.info(f"[API] Checkpoints list requested: {len(checkpoints)} models found")
        return checkpoints
    except Exception as e:
        logger.error(f"[API] Error scanning checkpoints: {e}")
        raise HTTPException(status_code=500, detail=f"Error scanning checkpoints: {str(e)}")


@router.get("/models/vaes")
async def get_vaes(request: Request):
    """Get available VAE models"""
    model_scanner = request.app.state.model_scanner
    
    try:
        vaes = model_scanner.scan_vaes()
        logger.info(f"[API] VAEs list requested: {len(vaes)} models found")
        return vaes
    except Exception as e:
        logger.error(f"[API] Error scanning VAEs: {e}")
        raise HTTPException(status_code=500, detail=f"Error scanning VAEs: {str(e)}")