"""
Pose Processing API Router
Handles pose extraction and skeleton rendering endpoints.
"""

import base64
import io
import logging
import time
from typing import Dict, Any
from fastapi import APIRouter, Request, HTTPException
from PIL import Image
import numpy as np

from ..models.api_models import (
    PoseExtractRequest, PoseExtractResponse,
    SkeletonRenderRequest, SkeletonRenderResponse
)
from ..services.image_service import ImageService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/extract", response_model=PoseExtractResponse)
async def extract_pose(request: PoseExtractRequest, api_request: Request):
    """
    Extract pose data from image as JSON.
    
    This endpoint processes an image and returns pose keypoints in JSON format
    for editing in the frontend Konva.js editor.
    """
    start_time = time.time()
    
    try:
        # Get image service from app state
        image_service: ImageService = api_request.app.state.image_service
        
        # Set output_format to json for pose extraction
        parameters = request.parameters.copy()
        parameters['output_format'] = 'json'
        
        # Process the image to get pose data
        result = image_service.process_image_v3(
            processor=request.processor,
            image=request.image,
            parameters=parameters
        )
        
        processing_time = time.time() - start_time
        
        if result.get("success", False):
            # The result should contain pose data in JSON format
            pose_data = result.get("processed_result")
            
            if isinstance(pose_data, dict) and 'people' in pose_data:
                return PoseExtractResponse(
                    success=True,
                    pose_data=pose_data,
                    processing_time=processing_time,
                    processor_used=result.get("processor_used", request.processor)
                )
            else:
                return PoseExtractResponse(
                    success=False,
                    processing_time=processing_time,
                    processor_used=result.get("processor_used", request.processor),
                    error="Invalid pose data format returned by processor"
                )
        else:
            return PoseExtractResponse(
                success=False,
                processing_time=processing_time,
                processor_used=result.get("processor_used", request.processor),
                error=result.get("error", "Pose extraction failed")
            )
            
    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"Pose extraction failed: {str(e)}")
        return PoseExtractResponse(
            success=False,
            processing_time=processing_time,
            processor_used=request.processor,
            error=str(e)
        )


@router.post("/render", response_model=SkeletonRenderResponse)
async def render_skeleton(request: SkeletonRenderRequest, api_request: Request):
    """
    Render skeleton image from pose JSON data.
    
    This endpoint takes modified pose data from the frontend editor
    and renders a skeleton image for final use.
    """
    start_time = time.time()
    
    try:
        # Get image service from app state
        image_service: ImageService = api_request.app.state.image_service
        
        # Create a dummy processor for skeleton rendering
        processor_id = "dwpose_builtin"
        
        # Get the processor instance
        processor_registry = image_service.processor_registry
        if processor_id not in processor_registry:
            raise HTTPException(status_code=404, detail=f"Processor '{processor_id}' not found")
        
        processor_config = processor_registry[processor_id]
        
        # Import the DWPose processor
        from ..services.processors.dwpose_processor import DWPoseBuiltinPreprocessor
        
        # Create processor instance
        processor = DWPoseBuiltinPreprocessor(processor_id)
        
        # Create a blank image with the specified dimensions
        width = request.image_width
        height = request.image_height
        dummy_image = np.zeros((height, width, 3), dtype=np.uint8)
        
        # Set rendering parameters
        parameters = request.parameters.copy()
        parameters.update({
            'output_format': 'image',
            'skeleton_color': parameters.get('skeleton_color', 'white'),
            'point_color': parameters.get('point_color', 'red'),
            'background_color': parameters.get('background_color', 'black'),
            'line_width': parameters.get('line_width', 2),
            'point_radius': parameters.get('point_radius', 4),
            'draw_skeleton': parameters.get('draw_skeleton', True),
            'draw_points': parameters.get('draw_points', True)
        })
        
        # Render skeleton from pose data
        skeleton_image = processor._render_skeleton_from_data(
            dummy_image, request.pose_data, parameters
        )
        
        # Convert to base64
        pil_image = Image.fromarray(skeleton_image)
        buffer = io.BytesIO()
        pil_image.save(buffer, format='PNG')
        buffer.seek(0)
        skeleton_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        processing_time = time.time() - start_time
        
        return SkeletonRenderResponse(
            success=True,
            skeleton_image=skeleton_b64,
            processing_time=processing_time
        )
        
    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"Skeleton rendering failed: {str(e)}")
        return SkeletonRenderResponse(
            success=False,
            processing_time=processing_time,
            error=str(e)
        )


@router.get("/processors")
async def get_pose_processors(api_request: Request):
    """Get available pose processors."""
    try:
        processor_service = api_request.app.state.processor_service
        pose_processors = processor_service.get_processors_by_category("pose_human")
        
        return {
            "success": True,
            "processors": pose_processors,
            "count": len(pose_processors)
        }
        
    except Exception as e:
        logger.error(f"Failed to get pose processors: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test")
async def test_pose_endpoint():
    """Test endpoint to verify pose API is working."""
    return {
        "success": True,
        "message": "Pose API is working",
        "endpoints": {
            "extract": "POST /api/pose/extract - Extract pose data from image",
            "render": "POST /api/pose/render - Render skeleton from pose data",
            "processors": "GET /api/pose/processors - Get available pose processors"
        }
    }