"""
Model Status API
Provides endpoints for monitoring model loading status and memory usage.
"""

import logging
import psutil
import torch
from fastapi import APIRouter, Request
from typing import Dict, Any, Optional
import time
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/models/status")
async def get_model_status(api_request: Request) -> Dict[str, Any]:
    """Get comprehensive model loading status and memory usage."""
    
    try:
        # Get services from app state
        processor_service = api_request.app.state.processor_service
        image_service = api_request.app.state.image_service
        
        # System memory info
        memory_info = psutil.virtual_memory()
        
        # GPU memory info (if available)
        gpu_info = {}
        if torch.cuda.is_available():
            gpu_info = {
                "available": True,
                "device_count": torch.cuda.device_count(),
                "current_device": torch.cuda.current_device(),
                "memory_allocated": torch.cuda.memory_allocated(),
                "memory_reserved": torch.cuda.memory_reserved(),
                "memory_allocated_mb": round(torch.cuda.memory_allocated() / 1024 / 1024, 2),
                "memory_reserved_mb": round(torch.cuda.memory_reserved() / 1024 / 1024, 2)
            }
        else:
            gpu_info = {"available": False}
        
        # Check individual processor model status
        processor_models_status = {}
        
        # Check Depth Anything V2 processor
        try:
            # Use existing processor from app state if available
            if hasattr(api_request.app.state, 'depth_processor'):
                depth_processor = api_request.app.state.depth_processor
            else:
                from ..services.processors.depth_anything_processor import DepthAnythingProcessor
                from ..models.config_manager import get_config_manager
                
                config_manager = get_config_manager()
                depth_processor = DepthAnythingProcessor(config_manager)
            
            processor_models_status["depth_anything_v2_vitb"] = {
                "loaded": depth_processor.model is not None,
                "device": str(depth_processor.device) if depth_processor.device else None,
                "model_info": depth_processor.get_model_info()
            }
        except Exception as e:
            processor_models_status["depth_anything_v2_vitb"] = {
                "loaded": False,
                "error": str(e)
            }
        
        # Check MiDaS models (these are loaded dynamically)
        midas_status = {
            "midas_v21": {"loaded": False, "note": "Loaded on-demand"},
            "dpt_hybrid": {"loaded": False, "note": "Loaded on-demand"}
        }
        
        # Available models from processor service
        available_models = processor_service.get_available_models()
        
        return {
            "timestamp": datetime.now().isoformat(),
            "system": {
                "cpu_percent": psutil.cpu_percent(interval=0.1),
                "memory": {
                    "total_mb": round(memory_info.total / 1024 / 1024, 2),
                    "available_mb": round(memory_info.available / 1024 / 1024, 2),
                    "used_mb": round(memory_info.used / 1024 / 1024, 2),
                    "percent": memory_info.percent
                }
            },
            "gpu": gpu_info,
            "models": {
                "available_models": len(available_models),
                "loaded_models": sum(1 for status in processor_models_status.values() if status.get("loaded", False)),
                "processor_status": processor_models_status,
                "midas_models": midas_status
            },
            "services": {
                "processor_service_initialized": processor_service is not None,
                "image_service_initialized": image_service is not None
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting model status: {e}")
        return {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


@router.post("/models/{model_id}/load")
async def load_model(model_id: str, api_request: Request) -> Dict[str, Any]:
    """Load a specific model and return status."""
    
    try:
        start_time = time.time()
        
        if model_id == "depth_anything_v2_vitb":
            from ..services.processors.depth_anything_processor import DepthAnythingProcessor
            from ..models.config_manager import get_config_manager
            
            config_manager = get_config_manager()
            
            # Store processor in app state for reuse
            if not hasattr(api_request.app.state, 'depth_processor'):
                api_request.app.state.depth_processor = DepthAnythingProcessor(config_manager)
            
            depth_processor = api_request.app.state.depth_processor
            
            # Force model loading
            success = depth_processor.load_model("vitb")
            load_time = time.time() - start_time
            
            if success:
                # Get memory usage after loading
                memory_after = {}
                if torch.cuda.is_available():
                    memory_after = {
                        "gpu_memory_allocated_mb": round(torch.cuda.memory_allocated() / 1024 / 1024, 2),
                        "gpu_memory_reserved_mb": round(torch.cuda.memory_reserved() / 1024 / 1024, 2)
                    }
                
                return {
                    "success": True,
                    "model_id": model_id,
                    "load_time_seconds": round(load_time, 3),
                    "loaded": True,
                    "device": str(depth_processor.device),
                    "memory_usage": memory_after,
                    "model_info": depth_processor.get_model_info()
                }
            else:
                return {
                    "success": False,
                    "model_id": model_id,
                    "error": "Failed to load model",
                    "load_time_seconds": round(load_time, 3)
                }
        
        else:
            return {
                "success": False,
                "model_id": model_id,
                "error": "Model loading not implemented for this model type"
            }
            
    except Exception as e:
        logger.error(f"Error loading model {model_id}: {e}")
        return {
            "success": False,
            "model_id": model_id,
            "error": str(e)
        }


@router.post("/models/{model_id}/unload")
async def unload_model(model_id: str, api_request: Request) -> Dict[str, Any]:
    """Unload a specific model and free memory."""
    
    try:
        start_time = time.time()
        
        if model_id == "depth_anything_v2_vitb":
            # Check if processor exists in app state
            if not hasattr(api_request.app.state, 'depth_processor'):
                return {
                    "success": False,
                    "model_id": model_id,
                    "error": "Model not loaded - no processor instance found"
                }
            
            depth_processor = api_request.app.state.depth_processor
            
            # Get memory usage before unloading
            memory_before = {}
            if torch.cuda.is_available():
                memory_before = {
                    "gpu_memory_allocated_mb": round(torch.cuda.memory_allocated() / 1024 / 1024, 2),
                    "gpu_memory_reserved_mb": round(torch.cuda.memory_reserved() / 1024 / 1024, 2)
                }
            
            # Unload model
            depth_processor.unload_model()
            unload_time = time.time() - start_time
            
            # Get memory usage after unloading
            memory_after = {}
            if torch.cuda.is_available():
                memory_after = {
                    "gpu_memory_allocated_mb": round(torch.cuda.memory_allocated() / 1024 / 1024, 2),
                    "gpu_memory_reserved_mb": round(torch.cuda.memory_reserved() / 1024 / 1024, 2)
                }
            
            memory_freed = {}
            if memory_before and memory_after:
                memory_freed = {
                    "allocated_freed_mb": round(memory_before.get("gpu_memory_allocated_mb", 0) - memory_after.get("gpu_memory_allocated_mb", 0), 2),
                    "reserved_freed_mb": round(memory_before.get("gpu_memory_reserved_mb", 0) - memory_after.get("gpu_memory_reserved_mb", 0), 2)
                }
            
            return {
                "success": True,
                "model_id": model_id,
                "unload_time_seconds": round(unload_time, 3),
                "loaded": False,
                "memory_before": memory_before,
                "memory_after": memory_after,
                "memory_freed": memory_freed
            }
        
        else:
            return {
                "success": False,
                "model_id": model_id,
                "error": "Model unloading not implemented for this model type"
            }
            
    except Exception as e:
        logger.error(f"Error unloading model {model_id}: {e}")
        return {
            "success": False,
            "model_id": model_id,
            "error": str(e)
        }


@router.get("/system/memory")
async def get_memory_usage() -> Dict[str, Any]:
    """Get detailed system and GPU memory usage."""
    
    try:
        # System memory
        memory_info = psutil.virtual_memory()
        
        # GPU memory (detailed)
        gpu_memory = {}
        if torch.cuda.is_available():
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                gpu_memory[f"gpu_{i}"] = {
                    "name": props.name,
                    "total_memory_mb": round(props.total_memory / 1024 / 1024, 2),
                    "allocated_mb": round(torch.cuda.memory_allocated(i) / 1024 / 1024, 2),
                    "reserved_mb": round(torch.cuda.memory_reserved(i) / 1024 / 1024, 2),
                    "free_mb": round((props.total_memory - torch.cuda.memory_reserved(i)) / 1024 / 1024, 2)
                }
        
        return {
            "timestamp": datetime.now().isoformat(),
            "system_memory": {
                "total_mb": round(memory_info.total / 1024 / 1024, 2),
                "available_mb": round(memory_info.available / 1024 / 1024, 2),
                "used_mb": round(memory_info.used / 1024 / 1024, 2),
                "percent_used": memory_info.percent,
                "free_mb": round(memory_info.available / 1024 / 1024, 2)
            },
            "gpu_memory": gpu_memory,
            "gpu_available": torch.cuda.is_available()
        }
        
    except Exception as e:
        logger.error(f"Error getting memory usage: {e}")
        return {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }