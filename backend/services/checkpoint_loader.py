"""
Checkpoint Model Loader Service
Handles loading and unloading of checkpoint models (Stable Diffusion) to GPU memory.
"""

import logging
import torch
import gc
from pathlib import Path
from typing import Optional, Dict, Any
from safetensors.torch import load_file

logger = logging.getLogger(__name__)


class CheckpointLoader:
    """Loads checkpoint models into GPU memory"""

    def __init__(self, config_manager):
        self.config_manager = config_manager
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.loaded_checkpoint = None
        self.loaded_checkpoint_path = None
        self.loaded_vae = None
        self.loaded_vae_path = None

        logger.info(f"CheckpointLoader initialized on device: {self.device}")

    def load_checkpoint(self, checkpoint_path: str) -> Dict[str, Any]:
        """
        Load checkpoint model to GPU memory

        Args:
            checkpoint_path: Relative or absolute path to checkpoint file

        Returns:
            Dict with loading results and memory info
        """
        try:
            # Resolve full path
            if not Path(checkpoint_path).is_absolute():
                full_path = Path(self.config_manager.checkpoints_path) / checkpoint_path
            else:
                full_path = Path(checkpoint_path)

            if not full_path.exists():
                raise FileNotFoundError(f"Checkpoint not found: {full_path}")

            # Unload previous checkpoint if exists
            if self.loaded_checkpoint is not None:
                logger.info(f"Unloading previous checkpoint: {self.loaded_checkpoint_path}")
                self.unload_checkpoint()

            # Check available memory before loading
            file_size_mb = round(full_path.stat().st_size / 1024 / 1024, 2)
            logger.info(f"Loading checkpoint: {full_path}")
            logger.info(f"File size: {file_size_mb} MB")

            # Get memory before loading
            memory_before = self._get_memory_info()
            if memory_before.get("available"):
                logger.info(f"GPU memory before load - Allocated: {memory_before.get('allocated_mb')}MB, Reserved: {memory_before.get('reserved_mb')}MB")

            logger.info("Reading checkpoint file from disk... (this may take 30-120 seconds for large models)")

            # Load checkpoint based on file extension
            if full_path.suffix == '.safetensors':
                state_dict = load_file(str(full_path), device=str(self.device))
            elif full_path.suffix in ['.ckpt', '.pt', '.pth']:
                state_dict = torch.load(str(full_path), map_location=self.device)
            else:
                raise ValueError(f"Unsupported checkpoint format: {full_path.suffix}")

            logger.info("File loaded successfully, transferring to GPU memory...")

            # Store loaded checkpoint
            self.loaded_checkpoint = state_dict
            self.loaded_checkpoint_path = str(checkpoint_path)

            # Get memory after loading
            memory_after = self._get_memory_info()

            if memory_after.get("available"):
                logger.info(f"GPU memory after load - Allocated: {memory_after.get('allocated_mb')}MB, Reserved: {memory_after.get('reserved_mb')}MB")

            logger.info(f"✓ Checkpoint loaded successfully: {checkpoint_path} ({file_size_mb}MB)")

            return {
                "success": True,
                "checkpoint_path": checkpoint_path,
                "device": str(self.device),
                "memory_before": memory_before,
                "memory_after": memory_after,
                "memory_used_mb": memory_after.get("allocated_mb", 0) - memory_before.get("allocated_mb", 0),
                "keys_loaded": len(state_dict.keys()) if isinstance(state_dict, dict) else 0
            }

        except Exception as e:
            logger.error(f"Error loading checkpoint {checkpoint_path}: {e}")
            return {
                "success": False,
                "checkpoint_path": checkpoint_path,
                "error": str(e)
            }

    def unload_checkpoint(self) -> Dict[str, Any]:
        """
        Unload checkpoint from GPU memory

        Returns:
            Dict with unloading results and memory freed
        """
        try:
            if self.loaded_checkpoint is None:
                return {
                    "success": False,
                    "message": "No checkpoint loaded"
                }

            memory_before = self._get_memory_info()

            # Clear checkpoint
            checkpoint_path = self.loaded_checkpoint_path
            self.loaded_checkpoint = None
            self.loaded_checkpoint_path = None

            # Force garbage collection
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

            memory_after = self._get_memory_info()

            logger.info(f"Checkpoint unloaded: {checkpoint_path}")

            return {
                "success": True,
                "checkpoint_path": checkpoint_path,
                "memory_before": memory_before,
                "memory_after": memory_after,
                "memory_freed_mb": memory_before.get("allocated_mb", 0) - memory_after.get("allocated_mb", 0)
            }

        except Exception as e:
            logger.error(f"Error unloading checkpoint: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def load_vae(self, vae_path: str) -> Dict[str, Any]:
        """
        Load VAE model to GPU memory

        Args:
            vae_path: Relative or absolute path to VAE file

        Returns:
            Dict with loading results and memory info
        """
        try:
            # Resolve full path
            if not Path(vae_path).is_absolute():
                full_path = Path(self.config_manager.vae_path) / vae_path
            else:
                full_path = Path(vae_path)

            if not full_path.exists():
                raise FileNotFoundError(f"VAE not found: {full_path}")

            # Unload previous VAE if exists
            if self.loaded_vae is not None:
                logger.info(f"Unloading previous VAE: {self.loaded_vae_path}")
                self.unload_vae()

            # Check file size
            file_size_mb = round(full_path.stat().st_size / 1024 / 1024, 2)
            logger.info(f"Loading VAE: {full_path}")
            logger.info(f"File size: {file_size_mb} MB")

            memory_before = self._get_memory_info()
            if memory_before.get("available"):
                logger.info(f"GPU memory before load - Allocated: {memory_before.get('allocated_mb')}MB, Reserved: {memory_before.get('reserved_mb')}MB")

            logger.info("Reading VAE file from disk...")

            # Load VAE based on file extension
            if full_path.suffix == '.safetensors':
                state_dict = load_file(str(full_path), device=str(self.device))
            elif full_path.suffix in ['.ckpt', '.pt', '.pth']:
                state_dict = torch.load(str(full_path), map_location=self.device)
            else:
                raise ValueError(f"Unsupported VAE format: {full_path.suffix}")

            logger.info("File loaded successfully, transferring to GPU memory...")

            # Store loaded VAE
            self.loaded_vae = state_dict
            self.loaded_vae_path = str(vae_path)

            memory_after = self._get_memory_info()

            if memory_after.get("available"):
                logger.info(f"GPU memory after load - Allocated: {memory_after.get('allocated_mb')}MB, Reserved: {memory_after.get('reserved_mb')}MB")

            logger.info(f"✓ VAE loaded successfully: {vae_path} ({file_size_mb}MB)")

            return {
                "success": True,
                "vae_path": vae_path,
                "device": str(self.device),
                "memory_before": memory_before,
                "memory_after": memory_after,
                "memory_used_mb": memory_after.get("allocated_mb", 0) - memory_before.get("allocated_mb", 0),
                "keys_loaded": len(state_dict.keys()) if isinstance(state_dict, dict) else 0
            }

        except Exception as e:
            logger.error(f"Error loading VAE {vae_path}: {e}")
            return {
                "success": False,
                "vae_path": vae_path,
                "error": str(e)
            }

    def unload_vae(self) -> Dict[str, Any]:
        """
        Unload VAE from GPU memory

        Returns:
            Dict with unloading results and memory freed
        """
        try:
            if self.loaded_vae is None:
                return {
                    "success": False,
                    "message": "No VAE loaded"
                }

            memory_before = self._get_memory_info()

            # Clear VAE
            vae_path = self.loaded_vae_path
            self.loaded_vae = None
            self.loaded_vae_path = None

            # Force garbage collection
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

            memory_after = self._get_memory_info()

            logger.info(f"VAE unloaded: {vae_path}")

            return {
                "success": True,
                "vae_path": vae_path,
                "memory_before": memory_before,
                "memory_after": memory_after,
                "memory_freed_mb": memory_before.get("allocated_mb", 0) - memory_after.get("allocated_mb", 0)
            }

        except Exception as e:
            logger.error(f"Error unloading VAE: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def get_status(self) -> Dict[str, Any]:
        """
        Get current loading status

        Returns:
            Dict with current loaded models and memory info
        """
        return {
            "device": str(self.device),
            "checkpoint": {
                "loaded": self.loaded_checkpoint is not None,
                "path": self.loaded_checkpoint_path
            },
            "vae": {
                "loaded": self.loaded_vae is not None,
                "path": self.loaded_vae_path
            },
            "memory": self._get_memory_info()
        }

    def _get_memory_info(self) -> Dict[str, float]:
        """Get current GPU memory usage"""
        if torch.cuda.is_available():
            return {
                "allocated_mb": round(torch.cuda.memory_allocated() / 1024 / 1024, 2),
                "reserved_mb": round(torch.cuda.memory_reserved() / 1024 / 1024, 2),
                "available": True
            }
        else:
            return {
                "available": False
            }