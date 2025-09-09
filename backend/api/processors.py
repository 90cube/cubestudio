"""
Processors API Router
Handles all processor-related API endpoints.
"""

import logging
from fastapi import APIRouter, Request, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/processors")
async def get_processors(request: Request):
    """Get all available processors"""
    processor_service = request.app.state.processor_service
    processors = processor_service.get_processors()
    logger.info(f"[API] Processors list requested: {len(processors)} processors")
    return processors


@router.get("/processors/categories")
async def get_processor_categories(request: Request):
    """Get processors organized by categories for 5-tab system"""
    processor_service = request.app.state.processor_service
    categories = processor_service.get_processor_categories()
    logger.info(f"[API] Categories requested: {sum(len(cat) for cat in categories.values())} processors in {len(categories)} categories")
    return categories


@router.get("/processors/stats")
async def get_processor_stats(request: Request):
    """Get processor statistics"""
    processor_service = request.app.state.processor_service
    stats = processor_service.get_processor_stats()
    logger.info(f"[API] Stats requested: {stats['available_processors']}/{stats['total_processors']} processors, {stats['available_model_files']}/{stats['total_model_files']} models")
    return stats


@router.get("/processors/enhanced")
async def get_enhanced_processors(request: Request):
    """Get enhanced processor information and capabilities"""
    processor_service = request.app.state.processor_service
    enhanced_processing_enabled = request.app.state.enhanced_processing_enabled
    
    if not enhanced_processing_enabled:
        return {
            "available": False,
            "reason": "Enhanced processing system not available or not initialized"
        }
    
    try:
        enhanced_info = processor_service.get_enhanced_processor_info()
        enhanced_stats = processor_service.get_enhanced_processor_stats()
        
        return {
            "available": True,
            "processors": enhanced_info,
            "stats": enhanced_stats,
            "backend": "enhanced"
        }
    except Exception as e:
        logger.error(f"Error getting enhanced processor info: {e}")
        return {
            "available": False,
            "reason": f"Error retrieving enhanced processor information: {str(e)}"
        }


@router.get("/preprocessors")
async def get_preprocessors(request: Request):
    """Get all available preprocessors (alias for /api/processors)"""
    processor_service = request.app.state.processor_service
    processor_registry = processor_service.get_processor_registry()
    
    processors = []
    for processor_id, config in processor_registry.items():
        processors.append({
            "id": processor_id,
            "name": config["name"],
            "type": config["type"].value,
            "category": config["category"],
            "available": config["available"],
            "parameters": config["parameters"]
        })
    
    logger.info(f"[API] Preprocessors list requested: {len(processors)} preprocessors available")
    return processors