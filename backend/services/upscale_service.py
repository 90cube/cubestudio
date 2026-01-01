"""
Image upscaling service using RealESRGAN with tiled processing
Supports multiple upscale models and custom scale factors
"""

import os
import logging
import torch
import numpy as np
from PIL import Image
from pathlib import Path
from typing import Optional, Dict, List, Any, Tuple
from backend.utils.tile_helper import TileHelper

logger = logging.getLogger(__name__)


class UpscaleService:
    """Service for image upscaling with RealESRGAN and tile-based processing"""

    def __init__(self, models_path: Optional[Path] = None):
        """
        Initialize upscale service

        Args:
            models_path: Path to upscale models directory
        """
        self.models_path = models_path
        self.loaded_model = None
        self.loaded_model_name = None
        self.device = self._get_device()

        logger.info(f"UpscaleService initialized with device: {self.device}")

    def _get_device(self) -> str:
        """Determine optimal device (cuda/cpu)"""
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def scan_available_models(self) -> List[Dict[str, Any]]:
        """
        Scan upscale_models directory for available models

        Returns:
            List of model info dicts
        """
        if not self.models_path or not self.models_path.exists():
            logger.warning(f"Upscale models path not found: {self.models_path}")
            return []

        models = []
        supported_extensions = ['.pth', '.safetensors']

        for file_path in self.models_path.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in supported_extensions:
                # Parse model info from filename
                model_info = self._parse_model_info(file_path)
                models.append(model_info)
                logger.info(f"Found upscale model: {file_path.name}")

        return sorted(models, key=lambda x: x['name'])

    def _parse_model_info(self, file_path: Path) -> Dict[str, Any]:
        """
        Parse model information from filename

        Args:
            file_path: Path to model file

        Returns:
            Model info dict
        """
        filename = file_path.stem
        file_size_mb = file_path.stat().st_size / (1024 * 1024)

        # Try to extract scale from filename (e.g., RealESRGAN_x4plus -> 4)
        scale = 4  # Default
        if '_x2' in filename.lower():
            scale = 2
        elif '_x4' in filename.lower():
            scale = 4
        elif '_x8' in filename.lower():
            scale = 8

        return {
            'name': filename,
            'filename': file_path.name,
            'filepath': str(file_path),
            'size_mb': round(file_size_mb, 2),
            'native_scale': scale,
            'format': file_path.suffix[1:]  # Remove leading dot
        }

    def load_model(self, model_path: str) -> bool:
        """
        Load RealESRGAN model

        Args:
            model_path: Path to model file

        Returns:
            True if successfully loaded
        """
        try:
            # Check if already loaded
            if self.loaded_model and self.loaded_model_name == model_path:
                logger.info(f"Model already loaded: {model_path}")
                return True

            logger.info(f"Loading RealESRGAN model: {model_path}")

            # Import RealESRGAN components
            try:
                from basicsr.archs.rrdbnet_arch import RRDBNet
                from realesrgan import RealESRGANer
            except ImportError as e:
                logger.error(f"RealESRGAN library not found: {e}")
                logger.info("Install with: pip install realesrgan basicsr")
                return False

            # Determine model architecture from filename
            model_name = Path(model_path).stem.lower()

            if 'x4plus' in model_name or 'x4' in model_name:
                # RealESRGAN x4plus (most common)
                model = RRDBNet(
                    num_in_ch=3,
                    num_out_ch=3,
                    num_feat=64,
                    num_block=23,
                    num_grow_ch=32,
                    scale=4
                )
                native_scale = 4
            elif 'x2' in model_name:
                # RealESRGAN x2
                model = RRDBNet(
                    num_in_ch=3,
                    num_out_ch=3,
                    num_feat=64,
                    num_block=23,
                    num_grow_ch=32,
                    scale=2
                )
                native_scale = 2
            elif 'animevideo' in model_name or 'anime' in model_name:
                # RealESRGAN for anime
                model = RRDBNet(
                    num_in_ch=3,
                    num_out_ch=3,
                    num_feat=64,
                    num_block=6,
                    num_grow_ch=32,
                    scale=4
                )
                native_scale = 4
            else:
                # Default architecture
                model = RRDBNet(
                    num_in_ch=3,
                    num_out_ch=3,
                    num_feat=64,
                    num_block=23,
                    num_grow_ch=32,
                    scale=4
                )
                native_scale = 4

            # Create upsampler
            half_precision = self.device == "cuda"

            self.loaded_model = RealESRGANer(
                scale=native_scale,
                model_path=model_path,
                model=model,
                tile=512,  # Tile size for VRAM efficiency
                tile_pad=10,  # Padding to reduce edge artifacts
                pre_pad=0,
                half=half_precision,
                device=self.device
            )

            self.loaded_model_name = model_path

            logger.info(f"Model loaded successfully: {model_name} (scale={native_scale}x, device={self.device})")
            return True

        except Exception as e:
            logger.error(f"Failed to load model: {e}", exc_info=True)
            self.loaded_model = None
            self.loaded_model_name = None
            return False

    def upscale_image(
        self,
        image: Image.Image,
        scale_factor: float = 2.0,
        tile_size: int = 512,
        overlap: int = 64
    ) -> Optional[Image.Image]:
        """
        Upscale image using loaded model with tiled processing

        Args:
            image: Input PIL Image
            scale_factor: Target scale factor (1.0 to 4.0)
            tile_size: Size of tiles for processing
            overlap: Overlap between tiles for blending

        Returns:
            Upscaled PIL Image or None if failed
        """
        if not self.loaded_model:
            logger.error("No model loaded. Call load_model() first.")
            return None

        try:
            logger.info(f"Upscaling {image.size} image by {scale_factor}x (tile_size={tile_size}, overlap={overlap})")

            # Convert to RGB if needed
            if image.mode != 'RGB':
                image = image.convert('RGB')

            # Convert to numpy array (BGR format for RealESRGAN)
            img_np = np.array(image)
            img_bgr = img_np[:, :, ::-1]  # RGB to BGR

            # Use RealESRGAN's built-in enhance method
            # It handles tiling internally
            try:
                output, _ = self.loaded_model.enhance(img_bgr, outscale=scale_factor)
            except RuntimeError as e:
                if "out of memory" in str(e).lower():
                    logger.warning("GPU out of memory, falling back to CPU")
                    # Try with CPU
                    if self.device == "cuda":
                        torch.cuda.empty_cache()
                        # Reload model on CPU
                        old_device = self.device
                        self.device = "cpu"
                        self.load_model(self.loaded_model_name)
                        output, _ = self.loaded_model.enhance(img_bgr, outscale=scale_factor)
                        # Restore CUDA for next time
                        self.device = old_device
                else:
                    raise

            # Convert back to RGB
            output_rgb = output[:, :, ::-1]  # BGR to RGB

            result_image = Image.fromarray(output_rgb)

            logger.info(f"Upscale complete: {image.size} -> {result_image.size}")

            return result_image

        except Exception as e:
            logger.error(f"Upscale failed: {e}", exc_info=True)
            return None

    def upscale_image_with_custom_tiles(
        self,
        image: Image.Image,
        scale_factor: float = 2.0,
        tile_size: int = 512,
        overlap: int = 64
    ) -> Optional[Image.Image]:
        """
        Upscale image using manual tile splitting (alternative method)

        Args:
            image: Input PIL Image
            scale_factor: Target scale factor
            tile_size: Size of tiles
            overlap: Overlap between tiles

        Returns:
            Upscaled PIL Image or None if failed
        """
        if not self.loaded_model:
            logger.error("No model loaded. Call load_model() first.")
            return None

        try:
            logger.info(f"Manual tile upscaling {image.size} by {scale_factor}x")

            # Split into tiles
            tiles_info, original_size = TileHelper.split_image_into_tiles(
                image,
                tile_size=tile_size,
                overlap=overlap
            )

            # Process each tile
            for i, tile_info in enumerate(tiles_info):
                tile_image = tile_info['image']

                # Convert to numpy (BGR)
                tile_np = np.array(tile_image)
                tile_bgr = tile_np[:, :, ::-1]

                # Upscale tile
                output_tile, _ = self.loaded_model.enhance(tile_bgr, outscale=scale_factor)

                # Convert back to RGB
                output_rgb = output_tile[:, :, ::-1]
                tile_info['image'] = Image.fromarray(output_rgb)

                logger.debug(f"Processed tile {i+1}/{len(tiles_info)}")

            # Reassemble tiles
            result_image = TileHelper.reassemble_tiles(
                tiles_info,
                original_size,
                scale_factor=scale_factor,
                overlap=overlap
            )

            logger.info(f"Manual tile upscale complete: {result_image.size}")

            return result_image

        except Exception as e:
            logger.error(f"Manual tile upscale failed: {e}", exc_info=True)
            return None

    def get_model_info(self) -> Optional[Dict[str, Any]]:
        """
        Get information about currently loaded model

        Returns:
            Model info dict or None if no model loaded
        """
        if not self.loaded_model:
            return None

        return {
            'model_path': self.loaded_model_name,
            'device': self.device,
            'half_precision': self.device == "cuda"
        }

    def unload_model(self):
        """Unload current model and free memory"""
        if self.loaded_model:
            logger.info(f"Unloading model: {self.loaded_model_name}")
            self.loaded_model = None
            self.loaded_model_name = None

            if torch.cuda.is_available():
                torch.cuda.empty_cache()


# Singleton instance
_upscale_service = None


def get_upscale_service(models_path: Optional[Path] = None) -> UpscaleService:
    """
    Get or create upscale service singleton

    Args:
        models_path: Path to upscale models directory

    Returns:
        UpscaleService instance
    """
    global _upscale_service

    if _upscale_service is None:
        _upscale_service = UpscaleService(models_path=models_path)

    return _upscale_service
