"""
Depth-Anything-V2 Processor Service
Handles Depth Anything V2 model processing independently.
"""

import logging
import torch
import numpy as np
from PIL import Image
from typing import Optional, Tuple, Dict, Any
import cv2

logger = logging.getLogger(__name__)


class DepthAnythingProcessor:
    """Depth Anything V2 processor for depth map generation."""
    
    def __init__(self, config_manager):
        """Initialize Depth Anything processor.
        
        Args:
            config_manager: Configuration manager instance
        """
        self.config = config_manager
        self.model = None
        self.device = None
        self.model_configs = {
            'vits': {'encoder': 'vits', 'features': 64, 'out_channels': [48, 96, 192, 384]},
            'vitb': {'encoder': 'vitb', 'features': 128, 'out_channels': [96, 192, 384, 768]},
            'vitl': {'encoder': 'vitl', 'features': 256, 'out_channels': [256, 512, 1024, 1024]},
            'vitg': {'encoder': 'vitg', 'features': 384, 'out_channels': [1536, 1536, 1536, 1536]}
        }
        
    def load_model(self, model_type: str = "vitb") -> bool:
        """Load Depth Anything V2 model.
        
        Args:
            model_type: Model variant (vits, vitb, vitl, vitg)
            
        Returns:
            True if model loaded successfully, False otherwise
        """
        try:
            from ...depth_anything_v2.dpt import DepthAnythingV2
            
            # Set device - use same detection as DPT module
            if torch.cuda.is_available():
                self.device = torch.device("cuda")
            elif torch.backends.mps.is_available():
                self.device = torch.device("mps")
            else:
                self.device = torch.device("cpu")
            logger.info(f"[DEPTH-ANYTHING] Using device: {self.device}")
            
            # Create model
            self.model = DepthAnythingV2(**self.model_configs[model_type])
            
            # Load weights
            model_path = self.config.preprocessors_path / f"depth_anything_v2_{model_type}.pth"
            if not model_path.exists():
                logger.error(f"[DEPTH-ANYTHING] Model file not found: {model_path}")
                return False
                
            state_dict = torch.load(str(model_path), map_location='cpu')
            self.model.load_state_dict(state_dict)
            self.model = self.model.to(self.device).eval()
            
            logger.info(f"[DEPTH-ANYTHING] Model loaded successfully: {model_type}")
            return True
            
        except Exception as e:
            logger.error(f"[DEPTH-ANYTHING] Failed to load model: {e}")
            return False
    
    def process_image(
        self, 
        image: np.ndarray,
        input_size: int = 518,
        grayscale: bool = False,
        normalize: bool = True,
        invert: bool = False
    ) -> Optional[np.ndarray]:
        """Process image with Depth Anything V2.
        
        Args:
            image: Input image as numpy array (RGB)
            input_size: Input size for the model
            grayscale: Return grayscale depth map
            normalize: Normalize depth values to 0-1
            invert: Invert depth values (near/far)
            
        Returns:
            Processed depth map as numpy array or None if failed
        """
        if self.model is None:
            if not self.load_model():
                return None
                
        try:
            # Prepare image
            if len(image.shape) == 2:
                image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
            elif image.shape[2] == 4:
                image = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)
            
            # Get original size
            original_height, original_width = image.shape[:2]
            
            # Run inference with the loaded model
            with torch.no_grad():
                depth = self.model.infer_image(image, input_size)
            
            # Note: infer_image already returns depth at original image size
            # Post-process depth map
            if normalize:
                if depth.max() > depth.min():
                    depth = (depth - depth.min()) / (depth.max() - depth.min())
                else:
                    depth = depth  # Keep as-is if uniform
            
            if invert:
                depth = 1.0 - depth
            
            # Convert to uint8
            if grayscale:
                depth_uint8 = (depth * 255).astype(np.uint8)
                # Convert to RGB for consistency with system
                depth_uint8 = cv2.cvtColor(depth_uint8, cv2.COLOR_GRAY2RGB)
            else:
                # Apply colormap for visualization
                depth_uint8 = (depth * 255).astype(np.uint8)
                depth_uint8 = cv2.applyColorMap(depth_uint8, cv2.COLORMAP_INFERNO)
                depth_uint8 = cv2.cvtColor(depth_uint8, cv2.COLOR_BGR2RGB)
            
            logger.info(f"[DEPTH-ANYTHING] Processed image: {depth_uint8.shape}")
            return depth_uint8
            
        except Exception as e:
            logger.error(f"[DEPTH-ANYTHING] Processing failed: {e}")
            return None
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model.
        
        Returns:
            Dictionary with model information
        """
        return {
            "name": "Depth Anything V2",
            "loaded": self.model is not None,
            "device": str(self.device) if self.device else "not initialized",
            "variants": list(self.model_configs.keys()),
            "description": "State-of-the-art monocular depth estimation model"
        }
    
    def unload_model(self):
        """Unload model from memory."""
        if self.model is not None:
            del self.model
            self.model = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            logger.info("[DEPTH-ANYTHING] Model unloaded")