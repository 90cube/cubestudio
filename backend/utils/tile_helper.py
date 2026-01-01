"""
Tile-based image processing helper
Splits large images into overlapping tiles for memory-efficient upscaling
Implements feathering blend for seamless tile reassembly
"""

import numpy as np
from PIL import Image
from typing import List, Tuple, Dict, Any
import logging

logger = logging.getLogger(__name__)


class TileHelper:
    """Helper class for tiled image processing with overlap and feathering"""

    @staticmethod
    def split_image_into_tiles(
        image: Image.Image,
        tile_size: int = 512,
        overlap: int = 64
    ) -> Tuple[List[Dict[str, Any]], Tuple[int, int]]:
        """
        Split image into overlapping tiles for processing

        Args:
            image: Input PIL Image
            tile_size: Size of each tile (default 512)
            overlap: Overlap between tiles in pixels (default 64)

        Returns:
            Tuple of (tiles_info, original_size)
            tiles_info: List of dicts with tile data and coordinates
            original_size: Original image dimensions (width, height)
        """
        img_array = np.array(image)
        height, width = img_array.shape[:2]
        original_size = (width, height)

        stride = tile_size - overlap
        tiles_info = []

        # Calculate number of tiles needed
        tiles_y = (height - overlap) // stride + (1 if (height - overlap) % stride != 0 else 0)
        tiles_x = (width - overlap) // stride + (1 if (width - overlap) % stride != 0 else 0)

        logger.info(f"Splitting {width}x{height} image into {tiles_x}x{tiles_y} tiles (tile_size={tile_size}, overlap={overlap})")

        for ty in range(tiles_y):
            for tx in range(tiles_x):
                # Calculate tile boundaries
                y_start = ty * stride
                x_start = tx * stride

                # Add overlap, but don't exceed image boundaries
                y_end = min(y_start + tile_size, height)
                x_end = min(x_start + tile_size, width)

                # Adjust start if we're at the edge
                if y_end == height and y_end - y_start < tile_size:
                    y_start = max(0, height - tile_size)
                if x_end == width and x_end - x_start < tile_size:
                    x_start = max(0, width - tile_size)

                # Extract tile
                tile_array = img_array[y_start:y_end, x_start:x_end]
                tile_image = Image.fromarray(tile_array)

                tile_info = {
                    'image': tile_image,
                    'x_start': x_start,
                    'y_start': y_start,
                    'x_end': x_end,
                    'y_end': y_end,
                    'width': x_end - x_start,
                    'height': y_end - y_start,
                    'tile_x': tx,
                    'tile_y': ty
                }

                tiles_info.append(tile_info)

        logger.info(f"Created {len(tiles_info)} tiles")
        return tiles_info, original_size

    @staticmethod
    def create_feather_mask(
        width: int,
        height: int,
        feather_size: int
    ) -> np.ndarray:
        """
        Create feather (gradient) mask for blending overlapping regions

        Args:
            width: Mask width
            height: Mask height
            feather_size: Feather distance from edge (in pixels)

        Returns:
            Numpy array with shape (height, width) containing weights 0.0-1.0
        """
        mask = np.ones((height, width), dtype=np.float32)

        if feather_size <= 0:
            return mask

        # Create gradient for each edge
        for i in range(feather_size):
            weight = (i + 1) / feather_size

            # Top edge
            if i < height:
                mask[i, :] = np.minimum(mask[i, :], weight)

            # Bottom edge
            if height - 1 - i >= 0:
                mask[height - 1 - i, :] = np.minimum(mask[height - 1 - i, :], weight)

            # Left edge
            if i < width:
                mask[:, i] = np.minimum(mask[:, i], weight)

            # Right edge
            if width - 1 - i >= 0:
                mask[:, width - 1 - i] = np.minimum(mask[:, width - 1 - i], weight)

        return mask

    @staticmethod
    def reassemble_tiles(
        tiles_info: List[Dict[str, Any]],
        original_size: Tuple[int, int],
        scale_factor: float,
        overlap: int = 64
    ) -> Image.Image:
        """
        Reassemble processed tiles with feathering blend

        Args:
            tiles_info: List of tile dicts (must contain 'image' and coordinates)
            original_size: Original image size (width, height)
            scale_factor: Upscale factor applied to tiles
            overlap: Overlap size used during splitting (for feathering)

        Returns:
            Reassembled PIL Image
        """
        orig_width, orig_height = original_size
        target_width = int(orig_width * scale_factor)
        target_height = int(orig_height * scale_factor)

        logger.info(f"Reassembling tiles to {target_width}x{target_height} (scale {scale_factor}x)")

        # Initialize output canvas and weight map
        # Handle both RGB and RGBA
        sample_tile = tiles_info[0]['image']
        channels = len(sample_tile.getbands())

        output = np.zeros((target_height, target_width, channels), dtype=np.float32)
        weight_map = np.zeros((target_height, target_width), dtype=np.float32)

        # Feather size in scaled space
        scaled_overlap = int(overlap * scale_factor)

        for tile_info in tiles_info:
            tile_image = tile_info['image']
            tile_array = np.array(tile_image).astype(np.float32)

            # Calculate scaled coordinates
            x_start_scaled = int(tile_info['x_start'] * scale_factor)
            y_start_scaled = int(tile_info['y_start'] * scale_factor)
            x_end_scaled = int(tile_info['x_end'] * scale_factor)
            y_end_scaled = int(tile_info['y_end'] * scale_factor)

            # Adjust tile size if needed (due to rounding)
            tile_height, tile_width = tile_array.shape[:2]
            actual_height = min(tile_height, target_height - y_start_scaled)
            actual_width = min(tile_width, target_width - x_start_scaled)

            if actual_height != tile_height or actual_width != tile_width:
                tile_array = tile_array[:actual_height, :actual_width]

            # Create feather mask
            feather_mask = TileHelper.create_feather_mask(
                actual_width,
                actual_height,
                scaled_overlap
            )

            # Apply mask to tile
            for c in range(channels):
                output[y_start_scaled:y_start_scaled+actual_height,
                       x_start_scaled:x_start_scaled+actual_width, c] += tile_array[:, :, c] * feather_mask

            # Accumulate weights
            weight_map[y_start_scaled:y_start_scaled+actual_height,
                      x_start_scaled:x_start_scaled+actual_width] += feather_mask

        # Normalize by weight map
        weight_map = np.maximum(weight_map, 1e-6)  # Avoid division by zero
        for c in range(channels):
            output[:, :, c] /= weight_map

        # Convert back to uint8
        output = np.clip(output, 0, 255).astype(np.uint8)

        result_image = Image.fromarray(output)
        logger.info(f"Reassembly complete: {result_image.size}")

        return result_image

    @staticmethod
    def calculate_optimal_tile_size(
        image_size: Tuple[int, int],
        max_tile_size: int = 512,
        min_tile_size: int = 256,
        overlap: int = 64
    ) -> int:
        """
        Calculate optimal tile size based on image dimensions

        Args:
            image_size: (width, height) tuple
            max_tile_size: Maximum tile size
            min_tile_size: Minimum tile size
            overlap: Overlap between tiles

        Returns:
            Optimal tile size
        """
        width, height = image_size
        max_dim = max(width, height)

        # If image is small enough, use full image
        if max_dim <= max_tile_size:
            return max_dim

        # Calculate how many tiles we'd need with max_tile_size
        stride = max_tile_size - overlap
        num_tiles = (max_dim - overlap) // stride + 1

        # Try to minimize number of tiles while respecting size limits
        optimal_size = max_tile_size

        for size in range(max_tile_size, min_tile_size - 1, -64):
            stride = size - overlap
            tiles_needed = (max_dim - overlap) // stride + 1

            if tiles_needed <= num_tiles:
                optimal_size = size
                break

        logger.info(f"Optimal tile size for {width}x{height} image: {optimal_size}px")
        return optimal_size


def test_tile_helper():
    """Test tile splitting and reassembly"""
    # Create test image
    test_img = Image.new('RGB', (1024, 768), color=(128, 128, 128))

    # Split into tiles
    tiles_info, orig_size = TileHelper.split_image_into_tiles(
        test_img,
        tile_size=512,
        overlap=64
    )

    print(f"Split {orig_size} image into {len(tiles_info)} tiles")

    # Simulate processing (just pass through)
    for tile_info in tiles_info:
        tile_info['image'] = tile_info['image'].resize(
            (tile_info['width'] * 2, tile_info['height'] * 2),
            Image.LANCZOS
        )

    # Reassemble
    result = TileHelper.reassemble_tiles(
        tiles_info,
        orig_size,
        scale_factor=2.0,
        overlap=64
    )

    print(f"Reassembled to {result.size}")


if __name__ == "__main__":
    test_tile_helper()
