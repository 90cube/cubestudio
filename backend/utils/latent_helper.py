"""
Latent Space Manipulation Helper
VAE encoding/decoding 및 latent space 조작을 위한 유틸리티

ComfyUI 스타일 latent 조작을 Diffusers 프레임워크에 통합
"""

import logging
import torch
import torch.nn.functional as F
from PIL import Image
import numpy as np
from typing import Tuple, Optional

logger = logging.getLogger(__name__)


class LatentHelper:
    """Latent space 조작 헬퍼"""

    def __init__(self, vae, device: torch.device):
        """
        Initialize LatentHelper

        Args:
            vae: Diffusers VAE model (AutoencoderKL)
            device: torch device (cuda/cpu)
        """
        self.vae = vae
        self.device = device
        self.scaling_factor = getattr(vae.config, 'scaling_factor', 0.18215)

        logger.info(
            f"LatentHelper initialized: scaling_factor={self.scaling_factor}, "
            f"device={device}"
        )

    @torch.no_grad()
    def encode_image(self, image: Image.Image) -> torch.Tensor:
        """
        PIL Image → Latent tensor

        Args:
            image: PIL Image (RGB)

        Returns:
            Latent tensor [1, C, H/8, W/8]
            Typically [1, 4, H/8, W/8] for SD1.5/SDXL
        """
        try:
            # PIL Image → Numpy array
            img_array = np.array(image.convert("RGB"))

            # Normalize to [0, 1]
            img_array = img_array.astype(np.float32) / 255.0

            # NHWC → NCHW
            img_array = img_array[None].transpose(0, 3, 1, 2)

            # Convert to tensor with VAE's dtype (CRITICAL: match pipeline dtype)
            img_tensor = torch.from_numpy(img_array).to(
                device=self.device,
                dtype=self.vae.dtype  # Use VAE's dtype (float16 or float32)
            )

            # Normalize to [-1, 1] (SD standard)
            img_tensor = 2.0 * img_tensor - 1.0

            # VAE encode
            latent_dist = self.vae.encode(img_tensor).latent_dist
            latent = latent_dist.sample()

            # Apply scaling factor (ensure same dtype)
            latent = latent * self.scaling_factor

            # CRITICAL: Ensure latent matches VAE dtype
            latent = latent.to(dtype=self.vae.dtype)

            logger.debug(
                f"Encoded image {image.size} → latent {tuple(latent.shape)}, "
                f"dtype={latent.dtype}"
            )

            return latent

        except Exception as e:
            logger.error(f"Image encoding failed: {e}", exc_info=True)
            raise

    @torch.no_grad()
    def decode_latent(
        self,
        latent: torch.Tensor,
        output_type: str = "pil"
    ) -> Image.Image:
        """
        Latent tensor → PIL Image

        Args:
            latent: Latent tensor [1, C, H/8, W/8]
            output_type: "pil" or "np"

        Returns:
            PIL Image or numpy array
        """
        try:
            # Remove scaling factor
            latent = latent / self.scaling_factor

            # VAE decode
            image_tensor = self.vae.decode(latent).sample

            # [-1, 1] → [0, 1]
            image_tensor = (image_tensor / 2 + 0.5).clamp(0, 1)

            # [1, C, H, W] → [H, W, C]
            image_array = image_tensor.cpu().permute(0, 2, 3, 1).numpy()

            # [0, 1] → [0, 255]
            image_array = (image_array[0] * 255).astype(np.uint8)

            if output_type == "pil":
                return Image.fromarray(image_array)
            else:
                return image_array

        except Exception as e:
            logger.error(f"Latent decoding failed: {e}", exc_info=True)
            raise

    def create_latent_mask(
        self,
        mask_image: Image.Image,
        latent_shape: Tuple[int, int, int, int],
        invert: bool = False
    ) -> torch.Tensor:
        """
        PIL mask → Latent size mask

        Args:
            mask_image: PIL Image (L mode, 0-255)
                       White (255) = area to process
                       Black (0) = area to preserve
            latent_shape: (B, C, H, W) of latent
            invert: If True, invert mask values

        Returns:
            Latent mask [1, 1, H, W] normalized to [0, 1]
        """
        try:
            # PIL → Numpy
            mask_array = np.array(mask_image.convert("L"))

            # Normalize to [0, 1]
            mask_array = mask_array.astype(np.float32) / 255.0

            # Invert if needed
            if invert:
                mask_array = 1.0 - mask_array

            # Numpy → Tensor
            mask_tensor = torch.from_numpy(mask_array).to(
                device=self.device,
                dtype=torch.float32
            )

            # Add batch and channel dims: [H, W] → [1, 1, H, W]
            mask_tensor = mask_tensor.unsqueeze(0).unsqueeze(0)

            # Resize to latent dimensions
            _, _, latent_h, latent_w = latent_shape

            if mask_tensor.shape[2] != latent_h or mask_tensor.shape[3] != latent_w:
                mask_latent = F.interpolate(
                    mask_tensor,
                    size=(latent_h, latent_w),
                    mode='bilinear',
                    align_corners=False
                )
            else:
                mask_latent = mask_tensor

            logger.debug(
                f"Created latent mask: {mask_image.size} → {tuple(mask_latent.shape)}"
            )

            return mask_latent

        except Exception as e:
            logger.error(f"Latent mask creation failed: {e}", exc_info=True)
            raise

    def apply_noise_to_latent(
        self,
        latent: torch.Tensor,
        mask: torch.Tensor,
        noise: torch.Tensor,
        timestep: torch.Tensor,
        scheduler
    ) -> torch.Tensor:
        """
        마스크 영역에만 noise 적용 (ComfyUI 방식)

        Args:
            latent: Original latent [1, C, H, W]
            mask: Latent mask [1, 1, H, W] (1=process, 0=preserve)
            noise: Random noise [1, C, H, W]
            timestep: Timestep tensor
            scheduler: Diffusers scheduler

        Returns:
            Noisy latent with mask applied
        """
        try:
            # Add noise to entire latent
            noisy_latent = scheduler.add_noise(latent, noise, timestep)

            # Apply mask: preserve unmasked, noise masked
            # mask=1 → use noisy_latent
            # mask=0 → use original latent
            masked_latent = latent * (1 - mask) + noisy_latent * mask

            logger.debug(
                f"Applied noise with mask: "
                f"timestep={timestep.item() if timestep.numel()==1 else timestep}, "
                f"mask_mean={mask.mean().item():.3f}"
            )

            return masked_latent

        except Exception as e:
            logger.error(f"Noise application failed: {e}", exc_info=True)
            raise

    def apply_mask_to_latent(
        self,
        latent_original: torch.Tensor,
        latent_processed: torch.Tensor,
        mask: torch.Tensor
    ) -> torch.Tensor:
        """
        두 latent를 마스크로 블렌딩 (ComfyUI progressive masking)

        Args:
            latent_original: Original latent [1, C, H, W]
            latent_processed: Processed latent [1, C, H, W]
            mask: Latent mask [1, 1, H, W]

        Returns:
            Blended latent
        """
        # mask=1 → use processed
        # mask=0 → use original
        blended = latent_original * (1 - mask) + latent_processed * mask

        return blended

    def resize_latent(
        self,
        latent: torch.Tensor,
        target_size: Tuple[int, int],
        mode: str = 'bilinear'
    ) -> torch.Tensor:
        """
        Latent 크기 조정

        Args:
            latent: [1, C, H, W]
            target_size: (H, W)
            mode: 'bilinear', 'nearest', etc.

        Returns:
            Resized latent
        """
        resized = F.interpolate(
            latent,
            size=target_size,
            mode=mode,
            align_corners=False if mode != 'nearest' else None
        )

        return resized

    def get_latent_size(self, image_size: Tuple[int, int]) -> Tuple[int, int]:
        """
        이미지 크기 → Latent 크기 계산

        Args:
            image_size: (width, height)

        Returns:
            (latent_width, latent_height)
        """
        # SD는 8x downsampling
        width, height = image_size
        latent_w = width // 8
        latent_h = height // 8

        return (latent_w, latent_h)

    def get_image_size_from_latent(
        self,
        latent_size: Tuple[int, int]
    ) -> Tuple[int, int]:
        """
        Latent 크기 → 이미지 크기 계산

        Args:
            latent_size: (latent_width, latent_height)

        Returns:
            (width, height)
        """
        latent_w, latent_h = latent_size
        width = latent_w * 8
        height = latent_h * 8

        return (width, height)

    @torch.no_grad()
    def test_reconstruction(self, image: Image.Image) -> Tuple[Image.Image, float]:
        """
        VAE reconstruction 테스트 (품질 확인용)

        Args:
            image: Test image

        Returns:
            (reconstructed_image, mse_error)
        """
        try:
            # Encode → Decode
            latent = self.encode_image(image)
            reconstructed = self.decode_latent(latent)

            # MSE 계산
            original_array = np.array(image.convert("RGB")).astype(np.float32)
            recon_array = np.array(reconstructed).astype(np.float32)

            mse = np.mean((original_array - recon_array) ** 2)

            logger.info(
                f"VAE reconstruction test: "
                f"input={image.size}, output={reconstructed.size}, MSE={mse:.2f}"
            )

            return reconstructed, mse

        except Exception as e:
            logger.error(f"Reconstruction test failed: {e}")
            raise
