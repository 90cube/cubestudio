"""
Processing API Router
Handles all image processing API endpoints.
"""

import logging
from fastapi import APIRouter, Request, HTTPException

from backend.models.api_models import (
    ProcessRequest, ProcessV2Request, ProcessResponse, ProcessV2Response
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/v3/process")
async def process_image_v3(request: ProcessRequest, api_request: Request):
    """Unified processing endpoint v3"""
    image_service = api_request.app.state.image_service
    
    result = image_service.process_image_v3(
        processor=request.processor,
        image=request.image,
        parameters=request.parameters
    )
    
    # Convert dict result to ProcessResponse if successful
    if result.get("success", False):
        return ProcessResponse(
            success=result["success"],
            processed_image=result["processed_image"],
            processing_time=result["processing_time"],
            processor_used=result["processor_used"],
            fallback_used=result["fallback_used"]
        )
    else:
        return ProcessResponse(
            success=result["success"],
            processing_time=result["processing_time"],
            processor_used=result["processor_used"],
            error=result.get("error")
        )


@router.post("/v2/process")
async def process_v2(request: ProcessV2Request, api_request: Request):
    """Process image with specific model (v2 API compatible with frontend)"""
    image_service = api_request.app.state.image_service
    
    return image_service.process_v2(
        model_id=request.model_id,
        image_base64=request.image_base64,
        parameters=request.parameters
    )