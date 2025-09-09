"""
Model Scanner Service for CUBE Studio
Handles scanning and detection of checkpoint and VAE model files
"""

import os
import logging
from pathlib import Path
from typing import Any, Dict, List

from ..models.config_manager import ConfigManager


class ModelScanner:
    """Scanner for AI model files in the ComfyUI models directory"""
    
    def __init__(self, config: ConfigManager = None):
        """Initialize the ModelScanner with configuration
        
        Args:
            config: Config instance. If None, creates a new instance.
        """
        self.config = config or ConfigManager()
        self.logger = logging.getLogger(__name__)
    
    def scan_checkpoints(self) -> List[Dict[str, Any]]:
        """Scan for checkpoint model files in the checkpoints directory.
        
        Returns:
            List of checkpoint file information with name, path, subfolder, and preview_image.
        """
        checkpoints = []
        checkpoints_path = self.config.checkpoints_path
        
        if not os.path.exists(checkpoints_path):
            self.logger.warning(f"Checkpoints path not found: {checkpoints_path}")
            return checkpoints
        
        for root, dirs, files in os.walk(checkpoints_path):
            for file in files:
                if any(file.lower().endswith(ext) for ext in self.config.checkpoint_extensions):
                    full_path = os.path.join(root, file)
                    
                    # Calculate relative subfolder from checkpoints_path
                    rel_path = os.path.relpath(root, checkpoints_path)
                    subfolder = rel_path if rel_path != '.' else ''
                    
                    # Look for preview images
                    preview_image = None
                    base_name = os.path.splitext(file)[0]
                    for ext in self.config.image_extensions:
                        preview_path = os.path.join(root, base_name + ext)
                        if os.path.exists(preview_path):
                            # Store relative path from checkpoints folder
                            preview_rel_path = os.path.relpath(preview_path, checkpoints_path)
                            preview_image = preview_rel_path.replace('\\', '/')
                            break
                    
                    checkpoint_info = {
                        "name": file,
                        "path": full_path.replace('\\', '/'),
                        "subfolder": subfolder.replace('\\', '/'),
                        "size_mb": round(os.path.getsize(full_path) / (1024 * 1024), 2),
                        "preview_image": preview_image
                    }
                    checkpoints.append(checkpoint_info)
                    
        self.logger.info(f"Scanned {len(checkpoints)} checkpoint files")
        return checkpoints

    def scan_vaes(self) -> List[Dict[str, Any]]:
        """Scan for VAE model files in the vae directory.
        
        Returns:
            List of VAE file information with name, path, subfolder, and preview_image.
        """
        vaes = []
        vae_path = self.config.vae_path
        
        if not os.path.exists(vae_path):
            self.logger.warning(f"VAE path not found: {vae_path}")
            return vaes
        
        for root, dirs, files in os.walk(vae_path):
            for file in files:
                if any(file.lower().endswith(ext) for ext in self.config.vae_extensions):
                    full_path = os.path.join(root, file)
                    
                    # Calculate relative subfolder from vae_path
                    rel_path = os.path.relpath(root, vae_path)
                    subfolder = rel_path if rel_path != '.' else ''
                    
                    # Look for preview images
                    preview_image = None
                    base_name = os.path.splitext(file)[0]
                    for ext in self.config.image_extensions:
                        preview_path = os.path.join(root, base_name + ext)
                        if os.path.exists(preview_path):
                            # Store relative path from vae folder
                            preview_rel_path = os.path.relpath(preview_path, vae_path)
                            preview_image = preview_rel_path.replace('\\', '/')
                            break
                    
                    vae_info = {
                        "name": file,
                        "path": full_path.replace('\\', '/'),
                        "subfolder": subfolder.replace('\\', '/'),
                        "size_mb": round(os.path.getsize(full_path) / (1024 * 1024), 2),
                        "preview_image": preview_image
                    }
                    vaes.append(vae_info)
                    
        self.logger.info(f"Scanned {len(vaes)} VAE files")
        return vaes
    
    def scan_all_models(self) -> Dict[str, List[Dict[str, Any]]]:
        """Scan all model types and return combined results
        
        Returns:
            Dictionary containing checkpoints and vaes lists
        """
        return {
            "checkpoints": self.scan_checkpoints(),
            "vaes": self.scan_vaes()
        }