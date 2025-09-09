#!/usr/bin/env python3
"""
CUBE Studio - Processor Service
Handles preprocessor management, categories, and statistics.

Extracted from unified_backend_service.py for better modularity.
"""

import datetime
import logging
from typing import Dict, List, Any, Optional
from backend.models.processor import (
    ProcessorType, scan_available_models, create_processor_registry, PROCESSOR_CATEGORIES
)
from backend.models.config import Config

logger = logging.getLogger(__name__)

class ProcessorService:
    """Service class for managing preprocessors and their statistics"""
    
    def __init__(self, config: Optional[Config] = None):
        """Initialize ProcessorService with configuration
        
        Args:
            config: Optional Config instance. If None, creates a new instance.
        """
        self.config = config or Config()
        
        # Initialize processor registry
        self.available_models = scan_available_models(self.config)
        self.processor_registry = create_processor_registry(self.available_models)
        
        # Log initialization
        available_count = len([m for m in self.available_models.values() if m['available']])
        total_count = len(self.available_models)
        logger.info(f"ProcessorService initialized: {available_count}/{total_count} models available")
    
    def get_processors(self) -> List[Dict[str, Any]]:
        """Get all available processors
        
        Returns:
            List of processor dictionaries with full information
        """
        processors = []
        for proc_id, config in self.processor_registry.items():
            processors.append({
                "id": proc_id,
                "name": config["name"],
                "type": config["type"],
                "category": config["category"],
                "available": config["available"],
                "backend": config["backend"],
                "parameters": config["parameters"],
                "model_size_mb": self.available_models.get(proc_id.replace("_builtin", ""), {}).get("size_mb", 0)
            })
        
        logger.info(f"Processors list requested: {len(processors)} processors")
        return processors
    
    def get_processor_categories(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get processors organized by categories for 5-tab system
        
        Returns:
            Dictionary with category names as keys and processor lists as values
        """
        categories = {
            "edge_lines": [],
            "depth_normals": [],
            "pose_human": [],
            "segmentation": [],
            "advanced": []
        }
        
        for proc_id, config in self.processor_registry.items():
            category = config["category"]
            if category in categories:
                categories[category].append({
                    "id": proc_id,
                    "name": config["name"],
                    "available": config["available"],
                    "backend": config["backend"],
                    "parameters": config["parameters"]
                })
        
        total_processors = sum(len(cat) for cat in categories.values())
        logger.info(f"Categories requested: {total_processors} processors in {len(categories)} categories")
        return categories
    
    def get_processor_stats(self) -> Dict[str, Any]:
        """Get processor statistics
        
        Returns:
            Dictionary containing processor and model statistics
        """
        total_processors = len(self.processor_registry)
        available_processors = len([p for p in self.processor_registry.values() if p["available"]])
        total_models = len(self.available_models)
        available_models = len([m for m in self.available_models.values() if m["available"]])
        
        stats = {
            "total_processors": total_processors,
            "available_processors": available_processors,
            "total_model_files": total_models,
            "available_model_files": available_models,
            "availability_rate": round(available_processors / total_processors * 100, 1) if total_processors > 0 else 0,
            "model_availability_rate": round(available_models / total_models * 100, 1) if total_models > 0 else 0,
            "models_path": str(self.config.preprocessors_path),
            "scan_time": datetime.datetime.now().isoformat()
        }
        
        logger.info(f"Stats requested: {available_processors}/{total_processors} processors, {available_models}/{total_models} models")
        return stats
    
    def get_enhanced_processor_info(self) -> Dict[str, Any]:
        """Get enhanced processor information (placeholder for future implementation)
        
        Returns:
            Dictionary with enhanced processor information
        """
        # This is a placeholder that would integrate with the enhanced preprocessing system
        # when it's available
        try:
            # Try to import and use enhanced preprocessing if available
            from integrate_enhanced_preprocessors import get_enhanced_processor_info as get_enhanced_info
            return get_enhanced_info()
        except ImportError:
            logger.warning("Enhanced preprocessing system not available")
            return {
                "available": False,
                "reason": "Enhanced preprocessing system not installed or initialized"
            }
    
    def get_enhanced_processor_stats(self) -> Dict[str, Any]:
        """Get enhanced processor statistics (placeholder for future implementation)
        
        Returns:
            Dictionary with enhanced processor statistics
        """
        # This is a placeholder that would integrate with the enhanced preprocessing system
        # when it's available
        try:
            # Try to import and use enhanced preprocessing if available
            from integrate_enhanced_preprocessors import get_enhanced_processor_stats as get_enhanced_stats
            return get_enhanced_stats()
        except ImportError:
            logger.warning("Enhanced preprocessing system not available")
            return {
                "available": False,
                "reason": "Enhanced preprocessing system not installed or initialized"
            }
    
    def get_processor_by_id(self, processor_id: str) -> Optional[Dict[str, Any]]:
        """Get processor configuration by ID
        
        Args:
            processor_id: The processor identifier
            
        Returns:
            Processor configuration dictionary or None if not found
        """
        config = self.processor_registry.get(processor_id)
        if config:
            return {
                "id": processor_id,
                "name": config["name"],
                "type": config["type"],
                "category": config["category"],
                "available": config["available"],
                "backend": config["backend"],
                "parameters": config["parameters"],
                "model_size_mb": self.available_models.get(processor_id.replace("_builtin", ""), {}).get("size_mb", 0)
            }
        return None
    
    def is_processor_available(self, processor_id: str) -> bool:
        """Check if a processor is available for use
        
        Args:
            processor_id: The processor identifier
            
        Returns:
            True if processor is available, False otherwise
        """
        config = self.processor_registry.get(processor_id)
        return config is not None and config.get("available", False)
    
    def get_processors_by_category(self, category: str) -> List[Dict[str, Any]]:
        """Get all processors in a specific category
        
        Args:
            category: The category name (edge_lines, depth_normals, etc.)
            
        Returns:
            List of processors in the specified category
        """
        processors = []
        for proc_id, config in self.processor_registry.items():
            if config["category"] == category:
                processors.append({
                    "id": proc_id,
                    "name": config["name"],
                    "type": config["type"],
                    "available": config["available"],
                    "backend": config["backend"],
                    "parameters": config["parameters"]
                })
        
        logger.info(f"Category '{category}' requested: {len(processors)} processors")
        return processors
    
    def get_processors_by_backend(self, backend: str) -> List[Dict[str, Any]]:
        """Get all processors using a specific backend
        
        Args:
            backend: The backend type (builtin, pytorch, opencv, etc.)
            
        Returns:
            List of processors using the specified backend
        """
        processors = []
        for proc_id, config in self.processor_registry.items():
            if config["backend"] == backend:
                processors.append({
                    "id": proc_id,
                    "name": config["name"],
                    "type": config["type"],
                    "category": config["category"],
                    "available": config["available"],
                    "parameters": config["parameters"]
                })
        
        logger.info(f"Backend '{backend}' requested: {len(processors)} processors")
        return processors
    
    def refresh_processor_registry(self) -> None:
        """Refresh the processor registry by rescanning available models"""
        logger.info("Refreshing processor registry...")
        
        # Rescan available models
        self.available_models = scan_available_models()
        
        # Recreate processor registry
        self.processor_registry = create_processor_registry(self.available_models)
        
        # Log results
        available_count = len([m for m in self.available_models.values() if m['available']])
        total_count = len(self.available_models)
        logger.info(f"Processor registry refreshed: {available_count}/{total_count} models available")
    
    def get_processor_registry(self) -> Dict[str, Dict[str, Any]]:
        """Get the full processor registry
        
        Returns:
            Complete processor registry dictionary
        """
        return self.processor_registry
    
    def get_available_models(self) -> Dict[str, Dict[str, Any]]:
        """Get the available models dictionary
        
        Returns:
            Complete available models dictionary
        """
        return self.available_models