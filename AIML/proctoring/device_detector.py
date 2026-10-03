"""Electronic device detection using YOLOv8-nano pretrained on COCO.

Prohibited COCO classes: cell phone, laptop, remote, keyboard, tv, book.

Thin wrapper over the shared `SceneObjectDetector` so the model is loaded and
run only once per monitoring cycle.
"""

import os

import numpy as np

from .object_detector import SceneObjectDetector

DEVICE_ENV = os.environ.get("PROCTORING_DEVICE_MODEL", "coco")
CUSTOM_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "device_detector.pt")


class DeviceDetector:
    def __init__(self, confidence_threshold: float = 0.45):
        self.confidence_threshold = confidence_threshold
        self._detector = SceneObjectDetector(confidence_threshold=confidence_threshold)

    def detect(self, frame: np.ndarray) -> dict:
        result = self._detector.detect(frame)
        if result.get("error"):
            return {"error": result["error"], "deviceDetected": False, "devices": [], "count": 0}
        devices = result.get("devices", [])
        return {
            "deviceDetected": bool(devices),
            "devices": devices,
            "count": len(devices),
        }
