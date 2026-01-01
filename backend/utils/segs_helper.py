"""
SEGS (Segmentation) Helper
ComfyUI Impact Pack SEGS 구조를 Cubestudio에 구현

SEGS 구조:
    segs_header: (image_size, crop_factor)
    segs_data: [
        {
            'cropped_image': PIL.Image,
            'cropped_mask': PIL.Image,
            'confidence': float,
            'crop_region': (x1, y1, x2, y2),
            'original_bbox': (x1, y1, x2, y2),
            'label': int
        },
        ...
    ]
"""

import logging
from typing import List, Dict, Tuple, Any
from PIL import Image
import numpy as np

logger = logging.getLogger(__name__)


class SEGSHelper:
    """ComfyUI SEGS 구조 처리 헬퍼"""

    @staticmethod
    def create_segs_from_detections(
        image: Image.Image,
        detections: List[Dict[str, Any]],
        crop_factor: float = 1.5,
        min_crop_size: int = 64
    ) -> Tuple[Tuple, List[Dict]]:
        """
        YOLO detections를 SEGS 구조로 변환

        Args:
            image: 원본 이미지
            detections: YOLO detection 결과 리스트
                [{'bbox': [x1,y1,x2,y2], 'mask': array, 'confidence': float, ...}]
            crop_factor: BBox 확장 비율 (1.5 = 150% 크기)
            min_crop_size: 최소 crop 크기 (너무 작으면 제외)

        Returns:
            (segs_header, segs_data)
            segs_header: (image_size, crop_factor)
            segs_data: List of cropped segments
        """
        if not detections:
            logger.warning("No detections provided to SEGS")
            return ((image.size, crop_factor), [])

        image_width, image_height = image.size
        segs_data = []

        # Confidence 순으로 정렬 (높은 순)
        sorted_detections = sorted(
            detections,
            key=lambda x: x.get('confidence', 0),
            reverse=True
        )

        for idx, det in enumerate(sorted_detections):
            try:
                bbox = det.get('bbox')
                if not bbox or len(bbox) != 4:
                    logger.warning(f"Detection {idx}: Invalid bbox {bbox}")
                    continue

                # BBox 확장
                expanded_bbox = SEGSHelper.expand_bbox(
                    bbox,
                    crop_factor=crop_factor,
                    image_size=(image_width, image_height)
                )

                # 최소 크기 체크
                crop_w = expanded_bbox[2] - expanded_bbox[0]
                crop_h = expanded_bbox[3] - expanded_bbox[1]

                if crop_w < min_crop_size or crop_h < min_crop_size:
                    logger.warning(
                        f"Detection {idx}: Crop too small ({crop_w}x{crop_h}), skipping"
                    )
                    continue

                # Crop 이미지
                cropped_img = image.crop(expanded_bbox)

                # Crop 마스크
                mask = det.get('mask')
                if mask is not None:
                    # Segmentation mask인 경우
                    if isinstance(mask, np.ndarray):
                        # Resize mask to image size if needed
                        if mask.shape != (image_height, image_width):
                            from PIL import Image as PILImage
                            import cv2
                            mask = cv2.resize(
                                mask.astype(np.uint8),
                                (image_width, image_height),
                                interpolation=cv2.INTER_LINEAR
                            )
                        mask_img = Image.fromarray((mask * 255).astype(np.uint8), mode='L')
                    else:
                        mask_img = mask

                    cropped_mask = mask_img.crop(expanded_bbox)
                else:
                    # BBox만 있는 경우: 전체 흰색 마스크
                    cropped_mask = Image.new('L', cropped_img.size, 255)

                # SEGS entry 생성
                seg_entry = {
                    'cropped_image': cropped_img,
                    'cropped_mask': cropped_mask,
                    'confidence': det.get('confidence', 1.0),
                    'crop_region': expanded_bbox,
                    'original_bbox': tuple(bbox),
                    'label': det.get('class_id', 0),
                    'detection_type': det.get('type', 'bbox')
                }

                segs_data.append(seg_entry)

                logger.debug(
                    f"SEGS entry {idx}: bbox={bbox}, crop={expanded_bbox}, "
                    f"size={cropped_img.size}, confidence={seg_entry['confidence']:.3f}"
                )

            except Exception as e:
                logger.error(f"Failed to process detection {idx}: {e}", exc_info=True)
                continue

        segs_header = ((image_width, image_height), crop_factor)

        logger.info(
            f"Created SEGS: {len(segs_data)}/{len(detections)} segments "
            f"(crop_factor={crop_factor})"
        )

        return segs_header, segs_data

    @staticmethod
    def expand_bbox(
        bbox: Tuple[float, float, float, float],
        crop_factor: float,
        image_size: Tuple[int, int]
    ) -> Tuple[int, int, int, int]:
        """
        BBox를 crop_factor만큼 확장 (중심 기준)

        Args:
            bbox: (x1, y1, x2, y2)
            crop_factor: 확장 비율 (1.0 = 원본, 1.5 = 150%)
            image_size: (width, height) 이미지 크기

        Returns:
            (x1, y1, x2, y2) 확장된 bbox (정수)
        """
        x1, y1, x2, y2 = bbox
        img_w, img_h = image_size

        # BBox 중심 및 크기
        bbox_w = x2 - x1
        bbox_h = y2 - y1
        center_x = (x1 + x2) / 2
        center_y = (y1 + y2) / 2

        # 확장된 크기
        new_w = bbox_w * crop_factor
        new_h = bbox_h * crop_factor

        # 새 bbox 계산
        new_x1 = center_x - new_w / 2
        new_y1 = center_y - new_h / 2
        new_x2 = center_x + new_w / 2
        new_y2 = center_y + new_h / 2

        # 이미지 경계 내로 제한
        new_x1 = max(0, new_x1)
        new_y1 = max(0, new_y1)
        new_x2 = min(img_w, new_x2)
        new_y2 = min(img_h, new_y2)

        # 정수로 변환
        return (
            int(round(new_x1)),
            int(round(new_y1)),
            int(round(new_x2)),
            int(round(new_y2))
        )

    @staticmethod
    def paste_segment(
        base_image: Image.Image,
        segment_image: Image.Image,
        crop_region: Tuple[int, int, int, int],
        mask: Image.Image = None
    ) -> Image.Image:
        """
        처리된 segment를 원본 이미지에 붙여넣기

        Args:
            base_image: 원본 이미지
            segment_image: 처리된 segment
            crop_region: (x1, y1, x2, y2) 붙여넣을 위치
            mask: 선택적 마스크 (None이면 전체 붙여넣기)

        Returns:
            합성된 이미지
        """
        result = base_image.copy()

        # 크기 확인
        x1, y1, x2, y2 = crop_region
        expected_size = (x2 - x1, y2 - y1)

        if segment_image.size != expected_size:
            logger.warning(
                f"Segment size mismatch: {segment_image.size} vs {expected_size}, "
                f"resizing segment"
            )
            segment_image = segment_image.resize(expected_size, Image.LANCZOS)

        if mask is not None:
            if mask.size != expected_size:
                mask = mask.resize(expected_size, Image.LANCZOS)
            # 마스크를 사용한 붙여넣기
            result.paste(segment_image, (x1, y1), mask)
        else:
            # 전체 붙여넣기
            result.paste(segment_image, (x1, y1))

        return result

    @staticmethod
    def validate_segs(segs_header: Tuple, segs_data: List[Dict]) -> bool:
        """
        SEGS 구조 유효성 검증

        Args:
            segs_header: (image_size, crop_factor)
            segs_data: List of segments

        Returns:
            True if valid, False otherwise
        """
        try:
            # Header 검증
            if not isinstance(segs_header, tuple) or len(segs_header) != 2:
                logger.error("Invalid SEGS header format")
                return False

            image_size, crop_factor = segs_header

            if not isinstance(image_size, tuple) or len(image_size) != 2:
                logger.error("Invalid image_size in SEGS header")
                return False

            if not isinstance(crop_factor, (int, float)) or crop_factor <= 0:
                logger.error(f"Invalid crop_factor: {crop_factor}")
                return False

            # Data 검증
            if not isinstance(segs_data, list):
                logger.error("SEGS data must be a list")
                return False

            required_keys = ['cropped_image', 'cropped_mask', 'crop_region']

            for idx, seg in enumerate(segs_data):
                if not isinstance(seg, dict):
                    logger.error(f"SEGS entry {idx} is not a dict")
                    return False

                for key in required_keys:
                    if key not in seg:
                        logger.error(f"SEGS entry {idx} missing key: {key}")
                        return False

                # 이미지 타입 확인
                if not isinstance(seg['cropped_image'], Image.Image):
                    logger.error(f"SEGS entry {idx}: cropped_image not PIL Image")
                    return False

                if not isinstance(seg['cropped_mask'], Image.Image):
                    logger.error(f"SEGS entry {idx}: cropped_mask not PIL Image")
                    return False

            return True

        except Exception as e:
            logger.error(f"SEGS validation error: {e}")
            return False
