"""
Feather Blending Utility
ComfyUI 스타일 고급 마스크 페더링 및 자연스러운 이미지 블렌딩

Distance transform 기반 feathering으로 경계를 부드럽게 처리
"""

import logging
import cv2
import numpy as np
from PIL import Image
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


class FeatherBlender:
    """고급 feathering 블렌딩 헬퍼"""

    @staticmethod
    def feather_mask(
        mask: np.ndarray,
        feather_pixels: int = 16,
        blur_kernel_size: Optional[int] = None
    ) -> np.ndarray:
        """
        마스크 경계를 부드럽게 페더링

        Args:
            mask: [H, W] 0-255 numpy array
            feather_pixels: 페더링 범위 (픽셀)
            blur_kernel_size: Gaussian blur 커널 크기 (None=자동)

        Returns:
            Feathered mask [H, W] 0.0-1.0 float
        """
        try:
            if feather_pixels <= 0:
                # No feathering
                return mask.astype(np.float32) / 255.0

            # Binary mask 생성
            mask_binary = (mask > 127).astype(np.uint8)

            # Distance transform (마스크 내부에서 경계까지의 거리)
            distance = cv2.distanceTransform(
                mask_binary,
                distanceType=cv2.DIST_L2,
                maskSize=5
            )

            # Feathering falloff 계산
            # distance / feather_pixels → [0, 1+]
            # 경계(0)에서 멀수록 1에 가까움
            feather_falloff = np.clip(distance / feather_pixels, 0, 1)

            # Mask에 falloff 적용
            mask_float = mask.astype(np.float32) / 255.0
            feathered = mask_float * feather_falloff

            # Gaussian blur로 더 부드럽게
            if blur_kernel_size is None:
                # 자동 계산: feather_pixels의 2배 + 1
                blur_kernel_size = max(3, feather_pixels * 2 + 1)

            # Ensure odd kernel size
            if blur_kernel_size % 2 == 0:
                blur_kernel_size += 1

            blurred = cv2.GaussianBlur(
                feathered,
                (blur_kernel_size, blur_kernel_size),
                sigmaX=0,  # Auto sigma
                sigmaY=0
            )

            logger.debug(
                f"Feathered mask: feather_pixels={feather_pixels}, "
                f"blur_kernel={blur_kernel_size}, "
                f"mean={blurred.mean():.3f}"
            )

            return blurred

        except Exception as e:
            logger.error(f"Mask feathering failed: {e}", exc_info=True)
            # Fallback: simple normalization
            return mask.astype(np.float32) / 255.0

    @staticmethod
    def create_gradient_mask(
        size: Tuple[int, int],
        feather_inner: int = 0,
        feather_outer: int = 16
    ) -> np.ndarray:
        """
        Gradient 마스크 생성 (테스트/디버깅용)

        Args:
            size: (width, height)
            feather_inner: 내부 페더링
            feather_outer: 외부 페더링

        Returns:
            Gradient mask [H, W] 0.0-1.0
        """
        width, height = size

        # Create base mask (전체 흰색)
        mask = np.ones((height, width), dtype=np.uint8) * 255

        # Apply feathering
        feathered = FeatherBlender.feather_mask(
            mask,
            feather_pixels=feather_outer
        )

        return feathered

    @staticmethod
    def blend_images(
        original: Image.Image,
        processed: Image.Image,
        mask: Image.Image,
        feather_pixels: int = 16
    ) -> Image.Image:
        """
        Feathering을 사용한 자연스러운 이미지 블렌딩

        Args:
            original: 원본 이미지
            processed: 처리된 이미지
            mask: 마스크 (L mode, white=use processed)
            feather_pixels: 페더링 범위

        Returns:
            블렌딩된 이미지
        """
        try:
            # 크기 확인
            if original.size != processed.size:
                logger.warning(
                    f"Image size mismatch: {original.size} vs {processed.size}, "
                    f"resizing processed"
                )
                processed = processed.resize(original.size, Image.LANCZOS)

            if mask.size != original.size:
                logger.warning(
                    f"Mask size mismatch: {mask.size} vs {original.size}, "
                    f"resizing mask"
                )
                mask = mask.resize(original.size, Image.LANCZOS)

            # Convert to numpy arrays
            orig_array = np.array(original.convert("RGB")).astype(np.float32)
            proc_array = np.array(processed.convert("RGB")).astype(np.float32)
            mask_array = np.array(mask.convert("L"))

            # Feather mask
            feathered_mask = FeatherBlender.feather_mask(
                mask_array,
                feather_pixels=feather_pixels
            )

            # Expand mask to 3 channels: [H, W] → [H, W, 3]
            feathered_mask = feathered_mask[..., None]

            # Blend
            # mask=1.0 → use processed
            # mask=0.0 → use original
            blended = orig_array * (1 - feathered_mask) + proc_array * feathered_mask

            # Clip and convert
            blended = np.clip(blended, 0, 255).astype(np.uint8)

            result = Image.fromarray(blended, mode='RGB')

            logger.debug(
                f"Blended images: size={original.size}, "
                f"feather={feather_pixels}, mask_mean={feathered_mask.mean():.3f}"
            )

            return result

        except Exception as e:
            logger.error(f"Image blending failed: {e}", exc_info=True)
            # Fallback: return processed image
            return processed

    @staticmethod
    def blend_images_advanced(
        original: Image.Image,
        processed: Image.Image,
        mask: Image.Image,
        feather_pixels: int = 16,
        blend_mode: str = 'normal',
        opacity: float = 1.0
    ) -> Image.Image:
        """
        고급 블렌딩 (블렌드 모드 및 opacity 지원)

        Args:
            original: 원본 이미지
            processed: 처리된 이미지
            mask: 마스크
            feather_pixels: 페더링 범위
            blend_mode: 'normal', 'multiply', 'screen', 'overlay'
            opacity: 블렌딩 강도 (0.0-1.0)

        Returns:
            블렌딩된 이미지
        """
        try:
            # 기본 블렌딩
            result = FeatherBlender.blend_images(
                original, processed, mask, feather_pixels
            )

            if opacity < 1.0:
                # Opacity 적용
                orig_array = np.array(original.convert("RGB")).astype(np.float32)
                result_array = np.array(result).astype(np.float32)

                result_array = orig_array * (1 - opacity) + result_array * opacity
                result_array = np.clip(result_array, 0, 255).astype(np.uint8)

                result = Image.fromarray(result_array, mode='RGB')

            # Blend mode는 나중에 추가 가능 (필요 시)
            if blend_mode != 'normal':
                logger.warning(f"Blend mode '{blend_mode}' not implemented, using 'normal'")

            return result

        except Exception as e:
            logger.error(f"Advanced blending failed: {e}")
            return processed

    @staticmethod
    def create_edge_mask(
        mask: np.ndarray,
        edge_width: int = 8
    ) -> np.ndarray:
        """
        마스크의 경계 영역만 추출

        Args:
            mask: [H, W] binary mask
            edge_width: 경계 너비 (픽셀)

        Returns:
            Edge mask [H, W]
        """
        try:
            mask_binary = (mask > 127).astype(np.uint8)

            # Dilate
            kernel_dilate = np.ones((edge_width * 2, edge_width * 2), np.uint8)
            dilated = cv2.dilate(mask_binary, kernel_dilate, iterations=1)

            # Erode
            kernel_erode = np.ones((edge_width * 2, edge_width * 2), np.uint8)
            eroded = cv2.erode(mask_binary, kernel_erode, iterations=1)

            # Edge = dilated - eroded
            edge = dilated - eroded

            return edge.astype(np.float32)

        except Exception as e:
            logger.error(f"Edge mask creation failed: {e}")
            return mask.astype(np.float32)

    @staticmethod
    def visualize_feathering(
        mask: Image.Image,
        feather_pixels: int = 16
    ) -> Image.Image:
        """
        Feathering 결과 시각화 (디버깅용)

        Args:
            mask: Original mask
            feather_pixels: Feathering range

        Returns:
            Visualization image (grayscale)
        """
        try:
            mask_array = np.array(mask.convert('L'))

            feathered = FeatherBlender.feather_mask(
                mask_array,
                feather_pixels=feather_pixels
            )

            # [0, 1] → [0, 255]
            vis_array = (feathered * 255).astype(np.uint8)

            # 컬러맵 적용 (선택)
            # vis_colored = cv2.applyColorMap(vis_array, cv2.COLORMAP_JET)
            # return Image.fromarray(cv2.cvtColor(vis_colored, cv2.COLOR_BGR2RGB))

            return Image.fromarray(vis_array, mode='L')

        except Exception as e:
            logger.error(f"Feathering visualization failed: {e}")
            return mask
