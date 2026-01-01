"""
Configuration module for CUBE Studio backend
Contains all configuration constants and settings with flexible path management
"""

import os
from pathlib import Path
from typing import Dict, Any

# Load environment variables from .env file if it exists
def load_env_file():
    """Load environment variables from .env file"""
    env_file = Path(__file__).parent.parent.parent / '.env'
    if env_file.exists():
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    if key not in os.environ:
                        os.environ[key] = value

# Load .env file on import
load_env_file()

# Project root detection
PROJECT_ROOT = Path(__file__).parent.parent.parent.resolve()

# Environment variable support for flexible deployment
def get_models_base_path() -> Path:
    """Get models base path with fallback chain:
    1. Environment variable CUBE_MODELS_PATH
    2. Project relative path ./models
    3. Fallback to empty path (will need manual setup)
    """
    # Try environment variable first
    env_path = os.environ.get('CUBE_MODELS_PATH')
    if env_path and os.path.exists(env_path):
        return Path(env_path)
    
    # Try project relative path
    project_models = PROJECT_ROOT / "models"
    if project_models.exists():
        return project_models
    
    # Fallback - will need setup
    return Path("./models")

# Dynamic path configuration
MODELS_BASE_PATH = get_models_base_path()
PREPROCESSOR_MODELS_PATH = MODELS_BASE_PATH / "preprocessors"
CHECKPOINTS_PATH = MODELS_BASE_PATH / "checkpoints"
VAE_PATH = MODELS_BASE_PATH / "vae"

# Real model file mapping based on actual files
REAL_MODEL_FILES = {
    # Depth models
    "dpt_hybrid": "dpt_hybrid-midas-501f0c75.pt",
    "dpt_beit_large_512": "dpt_beit_large_512.pt",
    "midas_v21": "midas_v21_384.pt",
    "depth_anything_v2_vitb": "depth_anything_v2_vitb.pth",
    
    # Edge detection
    "hed": "ControlNetHED.pth", 
    "network_bsds500": "network-bsds500.pth",
    
    # Pose detection
    "body_pose": "body_pose_model.pth",
    "hand_pose": "hand_pose_model.pth",
    "dw_openpose": "pose_dw-ll_ucoco_384.pth",
    
    # Segmentation
    "oneformer_coco": "150_16_swin_l_oneformer_coco_100ep.pth",
    "oneformer_ade20k": "250_16_swin_l_oneformer_ade20k_160k.pth",
    
    # Line detection
    "mlsd": "mlsd_large_512_fp32.pth",
    
    # Other models
    "clip": "clip_g.pth",
    "lama": "ControlNetLama.pth",
    "realesrgan": "RealESRGAN_x4plus.pth",
}

# Supported file extensions
CHECKPOINT_EXTENSIONS = ['.safetensors', '.ckpt', '.pt', '.bin']
VAE_EXTENSIONS = ['.safetensors', '.ckpt', '.pt', '.bin']
IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

# MiDaS integration configuration with flexible path management
def get_midas_path() -> Path:
    """Get MiDaS path with fallback chain:
    1. Environment variable CUBE_MIDAS_PATH
    2. Project relative path ./external/MiDaS
    3. Fallback to None (will use internal depth processor)
    """
    # Try environment variable first
    env_path = os.environ.get('CUBE_MIDAS_PATH')
    if env_path and os.path.exists(env_path):
        return Path(env_path)
    
    # Try project relative path
    project_midas = PROJECT_ROOT / "external" / "MiDaS"
    if project_midas.exists():
        return project_midas
    
    # Return None - will use internal processor
    return None

MIDAS_PATH = get_midas_path()

# Logging configuration with project-relative paths
LOG_FILE = PROJECT_ROOT / 'unified_backend.log'
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'

# Output configuration
OUTPUT_DIR = PROJECT_ROOT / "output"
TEMP_DIR = PROJECT_ROOT / "temp"

# Ensure required directories exist
def ensure_directories():
    """Create required directories if they don't exist"""
    directories = [OUTPUT_DIR, TEMP_DIR, PREPROCESSOR_MODELS_PATH]
    for directory in directories:
        if directory and not directory.exists():
            directory.mkdir(parents=True, exist_ok=True)

# Create directories on import
ensure_directories()

# Server configuration with environment support
DEFAULT_HOST = os.environ.get('CUBE_HOST', "127.0.0.1")
DEFAULT_PORT = int(os.environ.get('CUBE_PORT', 8080))
LOG_LEVEL = os.environ.get('CUBE_LOG_LEVEL', "info")

# Debug mode
DEBUG_MODE = os.environ.get('CUBE_DEBUG', 'false').lower() == 'true'

# CORS configuration
CORS_ALLOW_ORIGINS = ["*"]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = ["*"]
CORS_ALLOW_HEADERS = ["*"]

# FastAPI configuration
API_TITLE = "CUBE Studio Unified Backend"
API_DESCRIPTION = "Real preprocessor system with model file scanning"
API_VERSION = "4.0.0"

# Processing configuration
DEFAULT_TIMEOUT = 300  # seconds
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
SUPPORTED_IMAGE_FORMATS = ['RGB', 'RGBA', 'L']

# Enhanced preprocessing integration
ENHANCED_PREPROCESSING_MODULE = "integrate_enhanced_preprocessors"

# Configuration validation and diagnostics
def validate_configuration():
    """Validate current configuration and return status"""
    status = {
        'valid': True,
        'warnings': [],
        'errors': [],
        'paths': {}
    }
    
    # Check models path
    if MODELS_BASE_PATH.exists():
        status['paths']['models'] = str(MODELS_BASE_PATH)
        
        # Check subdirectories
        required_dirs = ['checkpoints', 'vae', 'preprocessors']
        for dir_name in required_dirs:
            dir_path = MODELS_BASE_PATH / dir_name
            if not dir_path.exists():
                status['warnings'].append(f"Models subdirectory missing: {dir_name}")
    else:
        status['errors'].append(f"Models base path not found: {MODELS_BASE_PATH}")
        status['valid'] = False
    
    # Check MiDaS
    if MIDAS_PATH:
        if MIDAS_PATH.exists():
            status['paths']['midas'] = str(MIDAS_PATH)
        else:
            status['warnings'].append(f"MiDaS path configured but not found: {MIDAS_PATH}")
    else:
        status['warnings'].append("MiDaS path not configured - will use internal depth processor")
    
    # Check output directories
    status['paths']['output'] = str(OUTPUT_DIR)
    status['paths']['temp'] = str(TEMP_DIR)
    status['paths']['project_root'] = str(PROJECT_ROOT)
    
    return status

def print_configuration_status():
    """Print current configuration status"""
    status = validate_configuration()
    
    print("=== CUBE Studio Configuration Status ===")
    print(f"Project Root: {PROJECT_ROOT}")
    print(f"Models Path: {MODELS_BASE_PATH}")
    print(f"MiDaS Path: {MIDAS_PATH or 'Not configured (using internal)'}")
    print(f"Output Dir: {OUTPUT_DIR}")
    print(f"Debug Mode: {DEBUG_MODE}")
    print(f"Server: {DEFAULT_HOST}:{DEFAULT_PORT}")
    
    if status['warnings']:
        print("\nWarnings:")
        for warning in status['warnings']:
            print(f"  - {warning}")
    
    if status['errors']:
        print("\nErrors:")
        for error in status['errors']:
            print(f"  - {error}")
        print("\nConfiguration has errors - some features may not work properly")
    else:
        print("\nConfiguration is valid")
    
    return status


class Config:
    """Configuration class for CUBE Studio with centralized settings management"""
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        """Singleton pattern - ensure only one Config instance exists"""
        if cls._instance is None:
            cls._instance = super(Config, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize configuration (only runs once due to singleton pattern)"""
        if Config._initialized:
            return
        
        # Path configuration
        self.project_root = PROJECT_ROOT
        self.models_base_path = MODELS_BASE_PATH
        self.preprocessor_models_path = PREPROCESSOR_MODELS_PATH
        self.checkpoints_path = CHECKPOINTS_PATH
        self.vae_path = VAE_PATH
        self.midas_path = MIDAS_PATH
        self.output_dir = OUTPUT_DIR
        self.temp_dir = TEMP_DIR
        
        # File and extension configuration
        self.real_model_files = REAL_MODEL_FILES
        self.checkpoint_extensions = CHECKPOINT_EXTENSIONS
        self.vae_extensions = VAE_EXTENSIONS
        self.image_extensions = IMAGE_EXTENSIONS
        
        # Logging configuration
        self.log_file = LOG_FILE
        self.log_format = LOG_FORMAT
        self.log_level = LOG_LEVEL
        
        # Server configuration
        self.default_host = DEFAULT_HOST
        self.default_port = DEFAULT_PORT
        self.debug_mode = DEBUG_MODE
        
        # CORS configuration
        self.cors_allow_origins = CORS_ALLOW_ORIGINS
        self.cors_allow_credentials = CORS_ALLOW_CREDENTIALS
        self.cors_allow_methods = CORS_ALLOW_METHODS
        self.cors_allow_headers = CORS_ALLOW_HEADERS
        
        # API configuration
        self.api_title = API_TITLE
        self.api_description = API_DESCRIPTION
        self.api_version = API_VERSION
        
        # Processing configuration
        self.default_timeout = DEFAULT_TIMEOUT
        self.max_image_size = MAX_IMAGE_SIZE
        self.supported_image_formats = SUPPORTED_IMAGE_FORMATS
        
        # Enhanced preprocessing
        self.enhanced_preprocessing_module = ENHANCED_PREPROCESSING_MODULE
        
        Config._initialized = True
    
    def get_path_config(self) -> Dict[str, str]:
        """Get all path configurations as a dictionary"""
        return {
            'project_root': str(self.project_root),
            'models_base_path': str(self.models_base_path),
            'preprocessor_models_path': str(self.preprocessor_models_path),
            'checkpoints_path': str(self.checkpoints_path),
            'vae_path': str(self.vae_path),
            'midas_path': str(self.midas_path) if self.midas_path else None,
            'output_dir': str(self.output_dir),
            'temp_dir': str(self.temp_dir)
        }
    
    def get_server_config(self) -> Dict[str, Any]:
        """Get server configuration as a dictionary"""
        return {
            'host': self.default_host,
            'port': self.default_port,
            'debug_mode': self.debug_mode,
            'log_level': self.log_level
        }
    
    def validate(self) -> Dict[str, Any]:
        """Validate current configuration and return status"""
        return validate_configuration()
    
    def print_status(self) -> Dict[str, Any]:
        """Print configuration status and return validation result"""
        return print_configuration_status()