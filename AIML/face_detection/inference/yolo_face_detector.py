"""YOLOv8 face detector for difficult conditions (optional).

Used as a fallback or secondary detector when primary (MediaPipe/OpenCV)
struggles in low light, extreme angles, partial occlusion, or small faces.
"""

import logging
import os
from pathlib import Path

import cv2
import numpy as np

from ..utils.config import (
    YOLO_FACE_CONFIDENCE,
    YOLO_FACE_ENABLED,
    YOLO_FACE_MODEL,
    YOLO_FACE_WEIGHTS,
    YOLO_FACE_FALLBACK_ENABLED,
)

logger = logging.getLogger(__name__)


class YOLOFaceDetector:
    """YOLOv8-based face detector (Ultralytics)."""

    def __init__(self, weights_path: str | os.PathLike | None = None, enabled: bool | None = None):
        self.enabled = YOLO_FACE_ENABLED if enabled is None else enabled
        self.weights = Path(weights_path) if weights_path else Path(YOLO_FACE_WEIGHTS)
        self.model = None
        self._backend = "disabled"
        self._init_backend()

    def _init_backend(self):
        if not self.enabled:
            return
        try:
            from ultralytics import YOLO
        except ImportError:
            logger.warning("ultralytics not installed; YOLO face detector unavailable")
            self.enabled = False
            return

        try:
            if self.weights.exists():
                self.model = YOLO(str(self.weights))
            else:
                logger.warning("YOLO face weights not found at %s (will try '%s')", self.weights, YOLO_FACE_MODEL)
                self.model = YOLO(YOLO_FACE_MODEL)
            self._backend = "yolov8"
            logger.info("Face detector backend (difficult conditions): YOLOv8")
        except Exception as e:
            logger.warning("YOLO face detector init failed: %s", e)
            self.enabled = False
            self._backend = "disabled"

    @property
    def backend_name(self) -> str:
        return self._backend

    @property
    def available(self) -> bool:
        return self.enabled and self.model is not None

    def detect(self, frame: np.ndarray) -> dict:
        empty = {"faces": [], "face_count": 0, "face_present": False, "multiple_faces": False}
        if not self.available or frame is None or frame.size == 0:
            return empty

        try:
            results = self.model.predict(source=frame, conf=YOLO_FACE_CONFIDENCE, verbose=False)
            if not results:
                return empty
            res = results[0]
            boxes = getattr(res, "boxes", None)
            if boxes is None or len(boxes) == 0:
                return empty

            h, w = frame.shape[:2]
            faces = []
            for b in boxes:
                xyxy = b.xyxy[0].cpu().numpy()
                conf = float(b.conf[0].cpu().numpy()) if hasattr(b, "conf") and len(b.conf) > 0 else YOLO_FACE_CONFIDENCE
                x1 = int(max(0, xyxy[0]))
                y1 = int(max(0, xyxy[1]))
                x2 = int(min(w, xyxy[2]))
                y2 = int(min(h, xyxy[3]))
                faces.append(
                    {
                        "bbox": [x1, y1, x2, y2],
                        "confidence": round(conf, 4),
                        "landmarks": None,
                        "embedding": None,
                    }
                )

            return {
                "faces": faces,
                "face_count": len(faces),
                "face_present": len(faces) >= 1,
                "multiple_faces": len(faces) > 1,
            }
        except Exception as e:
            logger.debug("YOLO face detection error: %s", e)
            return empty
