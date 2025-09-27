"""
Easy DWPose adapter for CUBE Studio

This adapter integrates a canonical DWPose implementation (YOLOX + RTMPose ONNX)
to provide reliable pose extraction (JSON) and skeleton rendering.

It uses local ONNX models if present under models/preprocessors/DWPose and can
operate fully offline. Coordinates are normalized (0..1) in the returned JSON.
"""

from typing import Any, Dict, Optional, Union

import os
import cv2
import numpy as np

from ..vendors.easy_dwpose.body_estimation.wholebody import Wholebody
from ..vendors.easy_dwpose.body_estimation.utils import resize_image
from ..vendors.easy_dwpose.draw.openpose import draw_pose as draw_openpose


class DWPoseEasyAdapter:
    """Thin wrapper around vendor easy_dwpose to match this project's needs."""

    def __init__(self, models_dir: str, device: Optional[str] = None):
        self.models_dir = models_dir
        self.device = (device or "cpu").lower()

        det_model = os.path.join(models_dir, "yolox_l.onnx")
        pose_model = os.path.join(models_dir, "dw-ll_ucoco_384.onnx")
        if not os.path.exists(det_model) or not os.path.exists(pose_model):
            raise FileNotFoundError(
                f"DWPose ONNX models not found in {models_dir}. Expected yolox_l.onnx and dw-ll_ucoco_384.onnx"
            )

        # CUDA if available and requested
        if self.device == "auto":
            try:
                import torch  # noqa: F401
                self.device = "cuda"
            except Exception:
                self.device = "cpu"

        self.estimator = Wholebody(model_det=det_model, model_pose=pose_model, device=self.device)

    def _format_pose(self, candidates: np.ndarray, scores: np.ndarray, width: int, height: int) -> Dict[str, Any]:
        """Normalize candidates and assemble OpenPose-like pose dict.

        candidates: (N, K, 2), scores: (N, K)
        """
        num_candidates, kpts, locs = candidates.shape
        cand = candidates.copy().astype(np.float32)
        cand[..., 0] /= float(width)
        cand[..., 1] /= float(height)

        bodies = cand[:, :18].reshape(num_candidates * 18, locs)

        body_scores = scores[:, :18].copy()
        for i in range(len(body_scores)):
            for j in range(len(body_scores[i])):
                body_scores[i][j] = int(18 * i + j) if body_scores[i][j] > 0.3 else -1

        faces = cand[:, 24:92]
        faces_scores = scores[:, 24:92] if scores.shape[1] >= 92 else np.zeros_like(faces[..., 0])

        hands_left = cand[:, 92:113] if cand.shape[1] >= 113 else np.zeros((num_candidates, 21, 2), dtype=np.float32)
        hands_right = cand[:, 113:] if cand.shape[1] > 113 else np.zeros((num_candidates, 21, 2), dtype=np.float32)
        hands = np.vstack([hands_left, hands_right])
        hands_scores = None  # not used by renderer

        pose = dict(
            bodies=bodies,
            body_scores=body_scores,
            hands=hands,
            hands_scores=hands_scores,
            faces=faces,
            faces_scores=faces_scores,
        )
        return pose

    def detect(
        self,
        image_rgb: np.ndarray,
        detect_resolution: int = 512,
        output_format: str = "json",
        include_face: bool = True,
        include_hands: bool = True,
    ) -> Union[Dict[str, Any], np.ndarray]:
        """Run detection and return either JSON pose or rendered image.

        - Returns pose dict with normalized coordinates for 'json'
        - Returns rendered RGB image for 'image'
        """
        if image_rgb.ndim != 3 or image_rgb.shape[2] != 3:
            raise ValueError("Expected RGB image with shape (H, W, 3)")

        orig_h, orig_w = image_rgb.shape[:2]
        resized = resize_image(image_rgb, target_resolution=detect_resolution)
        h, w = resized.shape[:2]

        # Wholebody returns absolute coordinates in resized image space
        kpts, scores = self.estimator(resized)
        pose = self._format_pose(kpts, scores, w, h)

        if output_format == "json":
            # Also include canvas size so renderer can default correctly
            return {
                **pose,
                "canvas_width": w,
                "canvas_height": h,
                "version": "dwpose-easy-1.0",
            }

        # Render on resized canvas then scale back to original size
        rendered = draw_openpose(pose, height=h, width=w, include_face=include_face, include_hands=include_hands)
        if (h, w) != (orig_h, orig_w):
            rendered = cv2.resize(rendered, (orig_w, orig_h), interpolation=cv2.INTER_LANCZOS4)
        return rendered

