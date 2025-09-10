"""
CUBE Studio Preprocessors Package
Enhanced preprocessor pipeline with standardized interfaces, fallback mechanisms, and batch processing.
"""

from .base_preprocessor import (
    BasePreprocessor,
    ProcessorRegistry,
    processor_registry,
    PreprocessorError,
    ParameterValidationError,
    ModelLoadError,
    ProcessingError
)

from .depth_processor import (
    DepthPreprocessor,
    MiDaSDepthPreprocessor,
    DPTDepthPreprocessor,
    DPTBEiTLarge512Preprocessor,
    BuiltinDepthPreprocessor
)

from .edge_processor import (
    EdgePreprocessor,
    CannyEdgePreprocessor,
    HEDEdgePreprocessor,
    SobelEdgePreprocessor,
    LaplacianEdgePreprocessor
)

from .pose_processor import (
    PosePreprocessor,
    OpenPoseBodyPreprocessor,
    OpenPoseHandPreprocessor,
    BuiltinPosePreprocessor
)

__version__ = "1.0.0"
__author__ = "CUBE Studio"

# Register all processor classes
processor_registry.register_processor_class('depth_builtin', BuiltinDepthPreprocessor)
processor_registry.register_processor_class('midas_v21', MiDaSDepthPreprocessor)
processor_registry.register_processor_class('dpt_hybrid', DPTDepthPreprocessor)
processor_registry.register_processor_class('dpt_beit_large_512', DPTBEiTLarge512Preprocessor)

processor_registry.register_processor_class('canny_builtin', CannyEdgePreprocessor)
processor_registry.register_processor_class('hed', HEDEdgePreprocessor)
processor_registry.register_processor_class('sobel_builtin', SobelEdgePreprocessor)
processor_registry.register_processor_class('laplacian_builtin', LaplacianEdgePreprocessor)

processor_registry.register_processor_class('openpose_builtin', BuiltinPosePreprocessor)
processor_registry.register_processor_class('openpose_body', OpenPoseBodyPreprocessor)
processor_registry.register_processor_class('openpose_hand', OpenPoseHandPreprocessor)

__all__ = [
    # Base classes
    'BasePreprocessor',
    'ProcessorRegistry', 
    'processor_registry',
    
    # Exceptions
    'PreprocessorError',
    'ParameterValidationError', 
    'ModelLoadError',
    'ProcessingError',
    
    # Depth processors
    'DepthPreprocessor',
    'MiDaSDepthPreprocessor',
    'DPTDepthPreprocessor', 
    'BuiltinDepthPreprocessor',
    
    # Edge processors
    'EdgePreprocessor',
    'CannyEdgePreprocessor',
    'HEDEdgePreprocessor',
    'SobelEdgePreprocessor',
    'LaplacianEdgePreprocessor',
    
    # Pose processors
    'PosePreprocessor', 
    'OpenPoseBodyPreprocessor',
    'OpenPoseHandPreprocessor',
    'BuiltinPosePreprocessor'
]