"""
Detailer Service
Provides object detection and selective inpainting for image enhancement.
"""

import logging
import numpy as np
from PIL import Image, ImageFilter
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any
import cv2

logger = logging.getLogger(__name__)


class DetailerService:
    """Service for object detection and selective inpainting"""

    def __init__(self, models_base_path: Optional[str] = None):
        """
        Initialize detailer service

        Args:
            models_base_path: Base path to models directory
        """
        self.models_base_path = self._resolve_base_path(models_base_path)

        if not self.models_base_path.exists():
            try:
                self.models_base_path.mkdir(parents=True, exist_ok=True)
                logger.info(f"Created models directory: {self.models_base_path}")
            except Exception as e:
                logger.warning(f"Failed to create models directory {self.models_base_path}: {e}")

        self.ultralytics_path = self.models_base_path / "ultralytics"
        if not self.ultralytics_path.exists():
            try:
                self.ultralytics_path.mkdir(parents=True, exist_ok=True)
                logger.info(f"Created Ultralytics directory: {self.ultralytics_path}")
            except Exception as e:
                logger.warning(f"Failed to create Ultralytics directory {self.ultralytics_path}: {e}")

        self.loaded_models = {}

        logger.info(f"DetailerService initialized with models at: {self.ultralytics_path}")

    def load_detection_model(self, model_name: str):
        """
        Load Ultralytics detection model

        Args:
            model_name: Model name (e.g., 'bbox/face_yolov8m.pt')

        Returns:
            Loaded model instance
        """
        if model_name in self.loaded_models:
            return self.loaded_models[model_name]

        try:
            from ultralytics import YOLO

            requested_path = Path(model_name)
            candidate_paths = []

            if requested_path.is_absolute():
                candidate_paths.append(requested_path)
            else:
                candidate_paths.append(self.ultralytics_path / requested_path)
                candidate_paths.append(self.models_base_path / requested_path)

            model_path = None
            for candidate in candidate_paths:
                if candidate.exists():
                    model_path = candidate
                    break

            if model_path is None:
                raise FileNotFoundError(f"Model not found: {self.ultralytics_path / requested_path}")

            logger.info(f"Loading detection model '{model_name}' from: {model_path}")
            model = YOLO(str(model_path))
            self.loaded_models[model_name] = model

            return model

        except ImportError:
            logger.error("Ultralytics not installed. Install with: pip install ultralytics")
            raise
        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {e}")
            raise

    def _resolve_base_path(self, override_path: Optional[str]) -> Path:
        """
        Resolve the base models directory.

        Preference order:
        1. Provided override path
        2. ConfigManager.models_base_path (if available)
        3. Project-root/models fallback
        """
        if override_path:
            return Path(override_path)

        try:
            from backend.models.config_manager import get_config_manager
            config_manager = get_config_manager()
            if config_manager:
                return config_manager.models_base_path
        except Exception as e:
            logger.debug(f"DetailerService config resolution failed, using fallback: {e}")

        project_root = Path(__file__).resolve().parents[2]
        return project_root / "models"

    def detect_objects(
        self,
        image: Image.Image,
        model_name: str,
        confidence: float = 0.3
    ) -> List[Dict[str, Any]]:
        """
        Detect objects in image using YOLO model

        Args:
            image: PIL Image to process
            model_name: Detection model name
            confidence: Confidence threshold (0.0-1.0)

        Returns:
            List of detections with bounding boxes and masks
        """
        try:
            model = self.load_detection_model(model_name)

            # Convert PIL to numpy array
            img_array = np.array(image)

            # Run detection
            results = model.predict(
                img_array,
                conf=confidence,
                verbose=False
            )

            detections = []

            for result in results:
                # Handle bounding box detections
                if hasattr(result, 'boxes') and result.boxes is not None:
                    boxes = result.boxes
                    for i, box in enumerate(boxes):
                        detection = {
                            'type': 'bbox',
                            'bbox': box.xyxy[0].cpu().numpy().tolist(),  # [x1, y1, x2, y2]
                            'confidence': float(box.conf[0]),
                            'class_id': int(box.cls[0]) if hasattr(box, 'cls') else 0,
                            'mask': None
                        }
                        detections.append(detection)

                # Handle segmentation masks
                if hasattr(result, 'masks') and result.masks is not None:
                    masks = result.masks
                    boxes = result.boxes

                    for i, (mask, box) in enumerate(zip(masks, boxes)):
                        # Get mask as numpy array
                        mask_array = mask.data.cpu().numpy()[0]  # Shape: (H, W)

                        detection = {
                            'type': 'segmentation',
                            'bbox': box.xyxy[0].cpu().numpy().tolist(),
                            'confidence': float(box.conf[0]),
                            'class_id': int(box.cls[0]) if hasattr(box, 'cls') else 0,
                            'mask': mask_array
                        }
                        detections.append(detection)

            logger.info(f"Detected {len(detections)} objects with confidence >= {confidence}")
            return detections

        except Exception as e:
            logger.error(f"Object detection failed: {e}")
            raise

    def create_mask_from_detection(
        self,
        detection: Dict[str, Any],
        image_size: Tuple[int, int],
        padding: int = 32,
        blur: int = 4
    ) -> Image.Image:
        """
        Create mask from detection result

        Args:
            detection: Detection dict with bbox or mask
            image_size: (width, height) of original image
            padding: Padding pixels around detection
            blur: Gaussian blur radius

        Returns:
            PIL Image mask (L mode, 0-255)
        """
        width, height = image_size

        # Create empty mask
        mask = Image.new('L', (width, height), 0)

        if detection['type'] == 'segmentation' and detection['mask'] is not None:
            # Use segmentation mask
            mask_array = detection['mask']

            # Resize mask to image size if needed
            if mask_array.shape != (height, width):
                mask_array = cv2.resize(
                    mask_array.astype(np.uint8),
                    (width, height),
                    interpolation=cv2.INTER_LINEAR
                )

            # Convert to PIL Image
            mask = Image.fromarray((mask_array * 255).astype(np.uint8), mode='L')

        else:
            # Use bounding box
            from PIL import ImageDraw
            draw = ImageDraw.Draw(mask)

            x1, y1, x2, y2 = detection['bbox']

            # Apply padding
            x1 = max(0, x1 - padding)
            y1 = max(0, y1 - padding)
            x2 = min(width, x2 + padding)
            y2 = min(height, y2 + padding)

            # Draw rectangle
            draw.rectangle([x1, y1, x2, y2], fill=255)

        # Apply padding with dilation (if using segmentation mask)
        if padding > 0 and detection['type'] == 'segmentation':
            mask_array = np.array(mask)
            kernel = np.ones((padding, padding), np.uint8)
            mask_array = cv2.dilate(mask_array, kernel, iterations=1)
            mask = Image.fromarray(mask_array, mode='L')

        # Apply blur for smooth edges
        if blur > 0:
            mask = mask.filter(ImageFilter.GaussianBlur(radius=blur))

        return mask

    def merge_masks(self, masks: List[Image.Image]) -> Image.Image:
        """
        Merge multiple masks into a single mask

        Args:
            masks: List of PIL Image masks

        Returns:
            Merged mask (L mode)
        """
        if not masks:
            return None

        if len(masks) == 1:
            return masks[0]

        # Merge by taking maximum value at each pixel
        merged_array = np.zeros_like(np.array(masks[0]))

        for mask in masks:
            mask_array = np.array(mask)
            merged_array = np.maximum(merged_array, mask_array)

        return Image.fromarray(merged_array, mode='L')

    def create_inpainting_batch(
        self,
        image: Image.Image,
        detections: List[Dict[str, Any]],
        padding: int = 32,
        blur: int = 4
    ) -> List[Tuple[Image.Image, Image.Image]]:
        """
        Create inpainting batches from detections

        Args:
            image: Original PIL Image
            detections: List of detection results
            padding: Mask padding
            blur: Mask blur

        Returns:
            List of (image, mask) tuples for inpainting
        """
        batches = []
        image_size = image.size

        for detection in detections:
            mask = self.create_mask_from_detection(
                detection,
                image_size,
                padding=padding,
                blur=blur
            )

            batches.append((image.copy(), mask))

        logger.info(f"Created {len(batches)} inpainting batches")
        return batches

    def apply_inpainted_region(
        self,
        original: Image.Image,
        inpainted: Image.Image,
        mask: Image.Image
    ) -> Image.Image:
        """
        Apply inpainted region to original image using mask

        Args:
            original: Original image
            inpainted: Inpainted result
            mask: Mask defining region to apply (L mode)

        Returns:
            Composite image
        """
        # Ensure all images are same size
        if original.size != inpainted.size or original.size != mask.size:
            logger.warning("Image sizes don't match, resizing inpainted and mask")
            inpainted = inpainted.resize(original.size, Image.Resampling.LANCZOS)
            mask = mask.resize(original.size, Image.Resampling.LANCZOS)

        # Convert to RGBA for compositing
        original_rgba = original.convert('RGBA')
        inpainted_rgba = inpainted.convert('RGBA')

        # Use mask as alpha channel
        mask_array = np.array(mask).astype(np.float32) / 255.0

        original_array = np.array(original_rgba).astype(np.float32)
        inpainted_array = np.array(inpainted_rgba).astype(np.float32)

        # Blend using mask
        result_array = original_array * (1 - mask_array[..., None]) + inpainted_array * mask_array[..., None]
        result_array = result_array.astype(np.uint8)

        result = Image.fromarray(result_array, mode='RGBA').convert('RGB')

        return result

    def unload_models(self):
        """Unload all loaded models to free memory"""
        self.loaded_models.clear()
        logger.info("All detection models unloaded")
