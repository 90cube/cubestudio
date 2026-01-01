"""
Backend models package for CUBE Studio
Exports all configuration, processor types, and API models
"""

# Configuration exports
from .config import (
    MODELS_BASE_PATH, PREPROCESSOR_MODELS_PATH, CHECKPOINTS_PATH, VAE_PATH,
    REAL_MODEL_FILES, CHECKPOINT_EXTENSIONS, VAE_EXTENSIONS, IMAGE_EXTENSIONS,
    MIDAS_PATH, LOG_FILE, LOG_FORMAT, DEFAULT_HOST, DEFAULT_PORT, LOG_LEVEL,
    CORS_ALLOW_ORIGINS, CORS_ALLOW_CREDENTIALS, CORS_ALLOW_METHODS, CORS_ALLOW_HEADERS,
    API_TITLE, API_DESCRIPTION, API_VERSION, ENHANCED_PREPROCESSING_MODULE
)

# Processor exports
from .processor import (
    ProcessorType, scan_available_models, create_processor_registry, PROCESSOR_CATEGORIES
)

# API model exports
from .api_models import (
    ProcessRequest, ProcessV2Request, ProcessResponse, ProcessV2Response,
    ModelInfo, ProcessorInfo, CheckpointInfo, VAEInfo, ProcessorStats, 
    EnhancedProcessorInfo, ProcessorCategory, ProcessorCategories, HealthResponse
)

__all__ = [
    # Configuration
    'MODELS_BASE_PATH', 'PREPROCESSOR_MODELS_PATH', 'CHECKPOINTS_PATH', 'VAE_PATH',
    'REAL_MODEL_FILES', 'CHECKPOINT_EXTENSIONS', 'VAE_EXTENSIONS', 'IMAGE_EXTENSIONS',
    'MIDAS_PATH', 'LOG_FILE', 'LOG_FORMAT', 'DEFAULT_HOST', 'DEFAULT_PORT', 'LOG_LEVEL',
    'CORS_ALLOW_ORIGINS', 'CORS_ALLOW_CREDENTIALS', 'CORS_ALLOW_METHODS', 'CORS_ALLOW_HEADERS',
    'API_TITLE', 'API_DESCRIPTION', 'API_VERSION', 'ENHANCED_PREPROCESSING_MODULE',
    
    # Processor
    'ProcessorType', 'scan_available_models', 'create_processor_registry', 'PROCESSOR_CATEGORIES',
    
    # API Models
    'ProcessRequest', 'ProcessV2Request', 'ProcessResponse', 'ProcessV2Response',
    'ModelInfo', 'ProcessorInfo', 'CheckpointInfo', 'VAEInfo', 'ProcessorStats',
    'EnhancedProcessorInfo', 'ProcessorCategory', 'ProcessorCategories', 'HealthResponse'
]