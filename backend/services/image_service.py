"""
Image processing service for CUBE Studio
Handles high-level image processing operations and API integration.
"""

import logging
import time
from typing import Any, Dict, Optional

import numpy as np
from fastapi import HTTPException

from ..utils.image_utils import (
    decode_base64_image,
    encode_image_to_base64,
    process_canny_opencv,
    process_depth_builtin,
    process_openpose_builtin,
    process_depth_pytorch
)
from ..models.config import Config

logger = logging.getLogger(__name__)


class ImageService:
    """
    High-level image processing service.
    Orchestrates image processing operations and manages processing functions.
    """
    
    def __init__(self, processor_registry: Dict, available_models: Dict, config: Optional[Config] = None):
        """
        Initialize the image service.
        
        Args:
            processor_registry: Registry of available processors
            available_models: Dictionary of available model configurations
            config: Optional Config instance. If None, creates a new instance.
        """
        self.processor_registry = processor_registry
        self.available_models = available_models
        self.config = config or Config()
        
        # Initialize processing function mappings
        self.processing_functions = {
            "canny_opencv": process_canny_opencv,
            "depth_builtin": process_depth_builtin,
            "openpose_builtin": process_openpose_builtin,
        }
        
        logger.info(f"ImageService initialized with {len(self.processing_functions)} built-in processors")
    
    def get_processing_functions(self) -> Dict:
        """Get the current processing functions mapping."""
        return self.processing_functions.copy()
    
    def process_image_v3(self, processor: str, image: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Unified processing endpoint v3.
        
        Args:
            processor: Processor ID to use
            image: Base64 encoded image
            parameters: Processing parameters
            
        Returns:
            Dictionary containing processing results
            
        Raises:
            HTTPException: If processing fails
        """
        start_time = time.time()
        
        try:
            # Validate processor
            if processor not in self.processor_registry:
                raise HTTPException(status_code=400, detail=f"Unknown processor: {processor}")
            
            proc_config = self.processor_registry[processor]
            
            # Decode image
            try:
                image_array = decode_base64_image(image)
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))
            
            # Process image
            processed_array = None
            fallback_used = False
            
            if proc_config["available"] and processor in self.processing_functions:
                # Use built-in processor
                try:
                    processed_array = self.processing_functions[processor](image_array, parameters)
                    logger.info(f"[OK] Processed with built-in: {processor}")
                except Exception as e:
                    logger.error(f"[ERROR] Built-in processing failed for {processor}: {e}")
                    fallback_used = True
            
            elif proc_config["available"] and proc_config["backend"] == "pytorch":
                # PyTorch model processing
                try:
                    if processor in ["midas_v21", "dpt_hybrid", "dpt_beit_large_512", "depth_anything_v2_vitb"]:
                        processed_array = process_depth_pytorch(image_array, processor, parameters, self.available_models)
                        logger.info(f"[OK] Processed with pytorch backend: {processor}")
                    else:
                        logger.warning(f"[WARN] PyTorch processor {processor} not implemented, using fallback")
                        fallback_used = True
                except Exception as e:
                    logger.error(f"[ERROR] PyTorch processing failed for {processor}: {e}")
                    fallback_used = True
            
            else:
                # Model not available
                logger.warning(f"[WARN] Model not available for {processor}, using fallback")
                fallback_used = True
            
            # NO FALLBACK - If processing failed, return error
            if processed_array is None or fallback_used:
                error_msg = f"Processing failed for {processor}. Backend processing is required."
                logger.error(f"[CRITICAL] {error_msg}")
                raise HTTPException(status_code=500, detail=error_msg)
            
            # Convert back to base64
            processed_b64 = encode_image_to_base64(processed_array)
            
            processing_time = time.time() - start_time
            
            response = {
                "success": True,
                "processed_image": processed_b64,
                "processing_time": round(processing_time, 3),
                "processor_used": processor,
                "fallback_used": fallback_used
            }
            
            logger.info(f"[PROCESS] Processing complete: {processor} ({processing_time:.3f}s, fallback: {fallback_used})")
            return response
            
        except HTTPException:
            raise
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"[ERROR] Processing error: {e}")
            return {
                "success": False,
                "processing_time": round(processing_time, 3),
                "processor_used": processor,
                "error": str(e)
            }
    
    def process_v2(self, model_id: str, image_base64: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process image with specific model (v2 API compatible with frontend).
        
        Args:
            model_id: Model identifier
            image_base64: Base64 encoded image
            parameters: Processing parameters
            
        Returns:
            Dictionary containing processing results
        """
        start_time = time.time()
        
        try:
            logger.info(f"[V2-API] Processing request - Model: {model_id}")
            logger.info(f"[V2-API] Parameters received: {parameters}")
            
            # Decode image
            image_array = decode_base64_image(image_base64)
            logger.info(f"[V2-API] Image loaded: {image_array.shape}")
            
            # Process based on model_id
            processed_array = None
            if model_id in ['midas_v21', 'dpt_hybrid']:
                # Use PyTorch processing for these models
                logger.info(f"[V2-API] Using PyTorch processing for {model_id}")
                processed_array = process_depth_pytorch(image_array, model_id, parameters, self.available_models)
            else:
                # Use builtin fallback for other models
                logger.info(f"[V2-API] Using builtin processing for {model_id}")
                processed_array = process_depth_builtin(image_array, parameters)
            
            # Convert result to base64
            if processed_array is not None:
                processed_b64 = encode_image_to_base64(processed_array)
                
                processing_time = time.time() - start_time
                logger.info(f"[V2-API] Processing complete: {processing_time:.3f}s")
                
                return {
                    "success": True,
                    "image_base64": processed_b64,
                    "processing_time": round(processing_time, 3),
                    "model_used": model_id
                }
            else:
                raise Exception("Processing failed - no result")
                
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"[V2-API] Processing error: {e}")
            return {
                "success": False,
                "error": str(e),
                "processing_time": round(processing_time, 3)
            }


# Processing function dispatcher - backward compatibility
def create_processing_functions():
    """
    Create processing functions mapping for backward compatibility.
    
    Returns:
        Dictionary mapping processor names to functions
    """
    return {
        "canny_opencv": process_canny_opencv,
        "depth_builtin": process_depth_builtin,
        "openpose_builtin": process_openpose_builtin,
    }