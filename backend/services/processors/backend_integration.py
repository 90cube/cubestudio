"""
Backend Integration for Enhanced Preprocessor Pipeline
Seamless integration with existing unified_backend_service.py while maintaining backward compatibility.
"""

import logging
import time
from typing import Any, Dict, List, Optional, Union, Tuple
import numpy as np

from .base_preprocessor import BasePreprocessor, ProcessingError
from . import processor_registry

logger = logging.getLogger(__name__)


class EnhancedProcessorManager:
    """
    Enhanced processor manager that integrates with existing backend service.
    Provides seamless fallback to original processing functions while leveraging
    new preprocessor capabilities.
    """
    
    def __init__(self, model_path_base: str = None, available_models: Dict[str, Dict] = None):
        """
        Initialize the enhanced processor manager.
        
        Args:
            model_path_base: Base path for model files
            available_models: Dictionary of available model information
        """
        self.model_path_base = model_path_base or ""
        self.available_models = available_models or {}
        self._processor_cache = {}
        
        logger.info("Enhanced Processor Manager initialized")
    
    def get_processor(self, processor_id: str) -> BasePreprocessor:
        """Get or create a processor instance with model path resolution."""
        if processor_id in self._processor_cache:
            return self._processor_cache[processor_id]
        
        # Resolve model path if needed
        model_path = self._resolve_model_path(processor_id)
        
        try:
            processor = processor_registry.get_processor(
                processor_id,
                model_path=model_path,
                cache_models=True,
                max_memory_mb=2048  # 2GB limit per processor
            )
            
            self._processor_cache[processor_id] = processor
            return processor
            
        except Exception as e:
            logger.error(f"Failed to create processor {processor_id}: {e}")
            raise
    
    def _resolve_model_path(self, processor_id: str) -> Optional[str]:
        """Resolve model path from available models info."""
        # Remove _builtin suffix for model lookup
        model_key = processor_id.replace('_builtin', '')
        
        if model_key in self.available_models:
            model_info = self.available_models[model_key]
            if model_info.get('available', False):
                return model_info.get('filepath')
        
        return None
    
    def process_image(self, 
                     image: np.ndarray, 
                     processor_id: str, 
                     parameters: Dict[str, Any] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Process a single image using the enhanced preprocessor system.
        
        Args:
            image: Input image as numpy array (RGB)
            processor_id: Processor identifier 
            parameters: Processing parameters
            
        Returns:
            Tuple of (processed_image, processing_info)
        """
        start_time = time.time()
        
        try:
            # Get processor instance
            processor = self.get_processor(processor_id)
            
            # Process the image
            processed_image, processing_info = processor.process_single(image, parameters)
            
            # Add manager-level info
            processing_info.update({
                'total_time': time.time() - start_time,
                'enhanced_processing': True,
                'manager_version': '1.0'
            })
            
            return processed_image, processing_info
            
        except Exception as e:
            # Fallback info
            processing_info = {
                'total_time': time.time() - start_time,
                'enhanced_processing': False,
                'error': str(e),
                'fallback_needed': True
            }
            
            logger.error(f"Enhanced processing failed for {processor_id}: {e}")
            raise ProcessingError(f"Enhanced processing failed: {e}")
    
    def process_batch(self,
                     images: List[np.ndarray],
                     processor_id: str,
                     parameters: Dict[str, Any] = None) -> List[Tuple[np.ndarray, Dict[str, Any]]]:
        """
        Process a batch of images using the enhanced preprocessor system.
        
        Args:
            images: List of input images as numpy arrays (RGB)
            processor_id: Processor identifier
            parameters: Processing parameters
            
        Returns:
            List of (processed_image, processing_info) tuples
        """
        try:
            processor = self.get_processor(processor_id)
            return processor.process_batch(images, parameters)
            
        except Exception as e:
            logger.error(f"Enhanced batch processing failed for {processor_id}: {e}")
            raise ProcessingError(f"Enhanced batch processing failed: {e}")
    
    def get_processor_info(self, processor_id: str) -> Dict[str, Any]:
        """Get information about a processor including parameters and capabilities."""
        try:
            processor = self.get_processor(processor_id)
            
            info = {
                'processor_id': processor_id,
                'parameters': processor.get_parameter_schema(),
                'defaults': processor.get_default_parameters(),
                'stats': processor.get_stats(),
                'model_path': processor.model_path,
                'device': processor.device,
                'enhanced': True
            }
            
            return info
            
        except Exception as e:
            logger.error(f"Failed to get processor info for {processor_id}: {e}")
            return {
                'processor_id': processor_id,
                'enhanced': False,
                'error': str(e)
            }
    
    def cleanup_processors(self):
        """Clean up all processor instances."""
        for processor in self._processor_cache.values():
            try:
                processor.cleanup_memory()
            except Exception as e:
                logger.error(f"Failed to cleanup processor {processor.processor_id}: {e}")
        
        self._processor_cache.clear()
        processor_registry.cleanup_all()
        
        logger.info("All processors cleaned up")
    
    def get_system_stats(self) -> Dict[str, Any]:
        """Get system-wide processing statistics."""
        stats = {
            'total_processors': len(self._processor_cache),
            'enhanced_enabled': True,
            'processors': {}
        }
        
        for proc_id, processor in self._processor_cache.items():
            try:
                stats['processors'][proc_id] = processor.get_stats()
            except Exception as e:
                stats['processors'][proc_id] = {'error': str(e)}
        
        return stats


# Global enhanced processor manager instance
enhanced_manager = None


def initialize_enhanced_processing(model_path_base: str = None, available_models: Dict = None):
    """Initialize the enhanced processing system."""
    global enhanced_manager
    
    enhanced_manager = EnhancedProcessorManager(
        model_path_base=model_path_base,
        available_models=available_models
    )
    
    logger.info("Enhanced preprocessing system initialized")
    return enhanced_manager


def process_with_enhanced_pipeline(image_data: str, 
                                 processor_id: str, 
                                 parameters: Dict[str, Any] = None,
                                 fallback_function: callable = None) -> Tuple[str, Dict[str, Any]]:
    """
    Process image using enhanced pipeline with automatic fallback.
    
    Args:
        image_data: Base64 encoded image data
        processor_id: Processor identifier
        parameters: Processing parameters
        fallback_function: Fallback function if enhanced processing fails
        
    Returns:
        Tuple of (processed_base64_image, processing_info)
    """
    global enhanced_manager
    
    if enhanced_manager is None:
        raise RuntimeError("Enhanced processing not initialized")
    
    start_time = time.time()
    processing_info = {
        'enhanced_attempted': True,
        'fallback_used': False,
        'processing_time': 0.0
    }
    
    try:
        # Decode input image
        image_array = BasePreprocessor.decode_base64_image(image_data)
        
        # Process with enhanced pipeline
        processed_array, proc_info = enhanced_manager.process_image(
            image_array, processor_id, parameters
        )
        
        # Encode result
        processed_base64 = BasePreprocessor.encode_base64_image(processed_array)
        
        # Update processing info
        processing_info.update(proc_info)
        processing_info['total_time'] = time.time() - start_time
        processing_info['success'] = True
        
        return processed_base64, processing_info
        
    except Exception as e:
        # Try fallback if available
        if fallback_function is not None:
            try:
                logger.info(f"Enhanced processing failed, trying fallback for {processor_id}")
                
                fallback_result = fallback_function(image_data, processor_id, parameters)
                
                processing_info.update({
                    'fallback_used': True,
                    'enhanced_error': str(e),
                    'total_time': time.time() - start_time,
                    'success': True
                })
                
                # Handle different fallback return formats
                if isinstance(fallback_result, tuple):
                    return fallback_result[0], processing_info
                else:
                    return fallback_result, processing_info
                
            except Exception as fallback_error:
                processing_info.update({
                    'fallback_used': True,
                    'enhanced_error': str(e),
                    'fallback_error': str(fallback_error),
                    'total_time': time.time() - start_time,
                    'success': False
                })
                
                raise ProcessingError(f"Both enhanced and fallback processing failed: {e}, {fallback_error}")
        
        # No fallback available
        processing_info.update({
            'enhanced_error': str(e),
            'total_time': time.time() - start_time,
            'success': False
        })
        
        raise ProcessingError(f"Enhanced processing failed: {e}")


def create_enhanced_api_wrapper(original_process_func: callable):
    """
    Create a wrapper for original processing function that tries enhanced processing first.
    
    Args:
        original_process_func: Original processing function to wrap
        
    Returns:
        Enhanced wrapper function
    """
    def enhanced_wrapper(image_data: str, processor_id: str, parameters: Dict[str, Any] = None):
        """Enhanced wrapper that tries new processing first, falls back to original."""
        try:
            # Try enhanced processing
            return process_with_enhanced_pipeline(
                image_data, processor_id, parameters, original_process_func
            )
        except Exception as e:
            logger.warning(f"Enhanced wrapper failed, using original function: {e}")
            # Direct fallback to original
            return original_process_func(image_data, processor_id, parameters)
    
    return enhanced_wrapper


# Compatibility functions for seamless integration
def get_enhanced_processor_registry():
    """Get the enhanced processor registry for inspection."""
    return processor_registry


def validate_processor_parameters(processor_id: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Validate parameters for a specific processor."""
    global enhanced_manager
    
    if enhanced_manager is None:
        raise RuntimeError("Enhanced processing not initialized")
    
    try:
        processor = enhanced_manager.get_processor(processor_id)
        return processor.validate_parameters(parameters)
    except Exception as e:
        logger.error(f"Parameter validation failed for {processor_id}: {e}")
        return parameters  # Return original if validation fails


def get_processor_schema(processor_id: str) -> Dict[str, Any]:
    """Get parameter schema for a specific processor."""
    global enhanced_manager
    
    if enhanced_manager is None:
        return {}
    
    try:
        processor = enhanced_manager.get_processor(processor_id)
        return processor.get_parameter_schema()
    except Exception as e:
        logger.error(f"Failed to get schema for {processor_id}: {e}")
        return {}


def cleanup_enhanced_processing():
    """Cleanup the enhanced processing system."""
    global enhanced_manager
    
    if enhanced_manager is not None:
        enhanced_manager.cleanup_processors()
        enhanced_manager = None
    
    logger.info("Enhanced processing system cleaned up")