"""
API models for CUBE Studio backend
Contains Pydantic models for request/response validation
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

# Request Models
class ProcessRequest(BaseModel):
    """Request model for v3 processing endpoint."""
    image: str = Field(..., description="Base64 encoded image data")
    processor: str = Field(..., description="Processor identifier")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Processing parameters")

class ProcessV2Request(BaseModel):
    """Request model for v2 processing endpoint (ControlNet compatible)."""
    image_base64: str = Field(..., description="Base64 encoded image with data: prefix")
    model_id: str = Field(..., description="Model ID (midas_v21, dpt_hybrid, etc.)")
    parameters: Dict[str, Any] = Field(
        default_factory=dict, 
        description="Processing parameters (brightness, contrast, smoothing, depthStrength)"
    )

# Response Models
class ProcessResponse(BaseModel):
    """Response model for processing endpoints."""
    success: bool = Field(..., description="Whether processing succeeded")
    processed_image: Optional[str] = Field(None, description="Base64 encoded processed image")
    pose_data: Optional[Dict[str, Any]] = Field(None, description="JSON pose data for DWPose processors")
    processing_time: float = Field(..., description="Processing time in seconds")
    processor_used: str = Field(..., description="Actual processor used")
    fallback_used: bool = Field(False, description="Whether fallback processing was used")
    error: Optional[str] = None
    model_status: Optional[Dict[str, Any]] = Field(None, description="Detailed model status information")
    error_details: Optional[Dict[str, Any]] = Field(None, description="Detailed error information")

class ProcessV2Response(BaseModel):
    """Response model for v2 processing endpoint."""
    success: bool = Field(..., description="Whether processing succeeded")
    image_base64: Optional[str] = Field(None, description="Base64 encoded processed image with data: prefix")
    processing_time: float = Field(..., description="Processing time in seconds")
    model_used: str = Field(..., description="Model identifier used")
    error: Optional[str] = None

# Model Information Models
class ModelInfo(BaseModel):
    """Model information structure."""
    filename: str = Field(..., description="Model filename")
    filepath: Optional[str] = Field(None, description="Full file path")
    size_mb: float = Field(..., description="File size in megabytes")
    available: bool = Field(..., description="Whether model file exists")

class ProcessorInfo(BaseModel):
    """Processor information structure."""
    id: str = Field(..., description="Processor identifier")
    name: str = Field(..., description="Display name")
    type: str = Field(..., description="Processor type")
    category: str = Field(..., description="Category for UI organization")
    available: bool = Field(..., description="Whether processor is available")
    backend: str = Field(..., description="Processing backend (opencv, pytorch, etc.)")
    parameters: Dict[str, Any] = Field(..., description="Available parameters and their ranges")
    model_size_mb: float = Field(0, description="Model file size if applicable")
    unavailability_reason: Optional[str] = Field(None, description="Reason why processor is not available")
    required_files: Optional[List[str]] = Field(None, description="List of required model files")
    missing_files: Optional[List[str]] = Field(None, description="List of missing model files")
    troubleshooting_tips: Optional[List[str]] = Field(None, description="Tips for resolving availability issues")
    model_path: Optional[str] = Field(None, description="Expected model directory path")

class CheckpointInfo(BaseModel):
    """Checkpoint model information."""
    name: str = Field(..., description="Model filename")
    path: str = Field(..., description="Full file path")
    subfolder: str = Field("", description="Relative subfolder path")
    size_mb: float = Field(..., description="File size in megabytes")
    preview_image: Optional[str] = Field(None, description="Preview image path if available")

class VAEInfo(BaseModel):
    """VAE model information."""
    name: str = Field(..., description="VAE filename")
    path: str = Field(..., description="Full file path")
    subfolder: str = Field("", description="Relative subfolder path")
    size_mb: float = Field(..., description="File size in megabytes")
    preview_image: Optional[str] = Field(None, description="Preview image path if available")

# Statistics Models
class ProcessorStats(BaseModel):
    """Processor statistics."""
    total_processors: int = Field(..., description="Total number of processors")
    available_processors: int = Field(..., description="Number of available processors")
    total_model_files: int = Field(..., description="Total number of model files")
    available_model_files: int = Field(..., description="Number of available model files")
    availability_rate: float = Field(..., description="Processor availability percentage")
    model_availability_rate: float = Field(..., description="Model availability percentage")
    models_path: str = Field(..., description="Models directory path")
    scan_time: str = Field(..., description="Last scan timestamp")

class EnhancedProcessorInfo(BaseModel):
    """Enhanced processor information."""
    available: bool = Field(..., description="Whether enhanced processing is available")
    processors: Optional[Dict[str, Any]] = Field(None, description="Enhanced processor details")
    stats: Optional[Dict[str, Any]] = Field(None, description="Enhanced processor statistics")
    backend: Optional[str] = Field(None, description="Backend type")
    reason: Optional[str] = Field(None, description="Reason if not available")

# Category Models
class ProcessorCategory(BaseModel):
    """Processor category information."""
    id: str = Field(..., description="Processor identifier")
    name: str = Field(..., description="Display name")
    available: bool = Field(..., description="Whether processor is available")
    backend: str = Field(..., description="Processing backend")
    parameters: Dict[str, Any] = Field(..., description="Available parameters")

class ProcessorCategories(BaseModel):
    """All processor categories."""
    edge_lines: List[ProcessorCategory] = Field(default_factory=list)
    depth_normals: List[ProcessorCategory] = Field(default_factory=list)
    pose_human: List[ProcessorCategory] = Field(default_factory=list)
    segmentation: List[ProcessorCategory] = Field(default_factory=list)
    advanced: List[ProcessorCategory] = Field(default_factory=list)

# Pose Processing Models
class PoseExtractRequest(BaseModel):
    """Request model for pose extraction."""
    image: str = Field(..., description="Base64 encoded image data")
    processor: str = Field(default="dwpose_builtin", description="Pose processor to use")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Pose detection parameters")

class PoseExtractResponse(BaseModel):
    """Response model for pose extraction."""
    success: bool = Field(..., description="Whether pose extraction succeeded")
    pose_data: Optional[Dict[str, Any]] = Field(None, description="JSON pose data with keypoints")
    processing_time: float = Field(..., description="Processing time in seconds")
    processor_used: str = Field(..., description="Processor used")
    error: Optional[str] = Field(None, description="Error message if failed")

class SkeletonRenderRequest(BaseModel):
    """Request model for skeleton rendering."""
    pose_data: Dict[str, Any] = Field(..., description="JSON pose data with keypoints")
    image_width: int = Field(512, description="Output image width")
    image_height: int = Field(512, description="Output image height") 
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Rendering parameters")

class SkeletonRenderResponse(BaseModel):
    """Response model for skeleton rendering."""
    success: bool = Field(..., description="Whether skeleton rendering succeeded")
    skeleton_image: Optional[str] = Field(None, description="Base64 encoded skeleton image")
    processing_time: float = Field(..., description="Processing time in seconds")
    error: Optional[str] = Field(None, description="Error message if failed")

# Health Check Models
class HealthResponse(BaseModel):
    """Health check response."""
    status: str = Field(..., description="Service status")
    service: str = Field(..., description="Service name and version")