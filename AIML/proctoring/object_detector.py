"""Single shared YOLOv8-nano COCO model for scene analysis.

Both `PersonDetector` and `DeviceDetector` used to keep their own module-level
YOLO instance and run an independent inference pass, so every monitoring cycle
paid for two model loads (once) and two forward passes (always). This module
owns one lazily-loaded model, and `SceneObjectDetector` parses a single pass for
both persons and prohibited electronic devices.
"""

import os
from pathlib import Path

import numpy as np

_model = None

_MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
_WEIGHTS = _MODELS_DIR / "yolov8n.pt"

# COCO class index -> human label for objects that indicate cheating.
PROHIBITED_CLASSES = {
    67: "cell phone",
    63: "laptop",
    65: "remote",
    66: "keyboard",
    62: "tv",
    73: "book",
}

PERSON_CLASS_ID = 0

# Per-class confidence floors. A phone held close to the webcam is frequently
# scored well below the generic 0.45 default (and may be classified as a
# "remote" when only part of the body/camera module is visible), so the phone
# and remote classes get a much lower floor. The model is run at the minimum
# floor and each class is then filtered against its own threshold. Override any
# of these with the matching env var.
_CLASS_CONFIDENCE = {
    67: float(os.environ.get("DEVICE_CONF_PHONE", "0.18")),   # cell phone
    65: float(os.environ.get("DEVICE_CONF_REMOTE", "0.18")),  # remote (phone fragments)
    63: float(os.environ.get("DEVICE_CONF_LAPTOP", "0.35")),  # laptop
    66: float(os.environ.get("DEVICE_CONF_KEYBOARD", "0.35")),  # keyboard
    62: float(os.environ.get("DEVICE_CONF_TV", "0.40")),      # tv
    73: float(os.environ.get("DEVICE_CONF_BOOK", "0.45")),    # book
}

# Inference size. Upscaling the (typically 320px-wide) monitor frame to the
# detector input helps small/partial phones survive the model's own resize.
_IMGSZ = int(os.environ.get("DEVICE_DETECTION_IMGSZ", "640"))


def get_model():
    """Return the shared YOLO model, or False if Ultralytics is unavailable."""
    global _model
    if _model is not None:
        return _model
    try:
        from ultralytics import YOLO

        override = os.environ.get("PROCTORING_DEVICE_MODEL_PATH")
        weights = override or (str(_WEIGHTS) if _WEIGHTS.exists() else "yolov8n.pt")
        _model = YOLO(weights)
        print(f"[object_detector] YOLOv8 COCO loaded from {weights}")
    except Exception as exc:  # noqa: BLE001 - optional dependency
        print(f"[object_detector] YOLOv8 not available: {exc}")
        _model = False
    return _model


class SceneObjectDetector:
    """Detects persons and prohibited electronics in one inference pass."""

    def __init__(self, confidence_threshold: float = 0.45):
        self.confidence_threshold = confidence_threshold

    def detect(self, frame: np.ndarray) -> dict:
        model = get_model()
        if model is False or model is None:
            return {
                "available": False,
                "personCount": 0,
                "persons": [],
                "deviceDetected": False,
                "devices": [],
            }

        # Run at the minimum class floor so a weakly-scored phone still surfaces,
        # then apply each class's own (higher) threshold below.
        floor = min([self.confidence_threshold, *_CLASS_CONFIDENCE.values()])
        try:
            results = model(frame, conf=floor, iou=0.5, imgsz=_IMGSZ, verbose=False)
        except Exception as exc:  # noqa: BLE001
            return {
                "available": False,
                "error": str(exc),
                "personCount": 0,
                "persons": [],
                "deviceDetected": False,
                "devices": [],
            }

        persons = []
        devices = []
        for result in results:
            names = result.names or {}
            for box in result.boxes:
                cls_id = int(box.cls[0])
                conf = round(float(box.conf[0]), 3)
                if cls_id == PERSON_CLASS_ID:
                    x1, y1, x2, y2 = [round(v, 1) for v in box.xyxy[0].tolist()]
                    persons.append({
                        "confidence": conf,
                        "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                    })
                    continue

                label = PROHIBITED_CLASSES.get(cls_id)
                if label and conf >= _CLASS_CONFIDENCE.get(cls_id, self.confidence_threshold):
                    x1, y1, x2, y2 = [round(v, 1) for v in box.xyxy[0].tolist()]
                    devices.append({
                        "class": names.get(cls_id, str(cls_id)),
                        "label": label,
                        "confidence": conf,
                        "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                    })

        return {
            "available": True,
            "personCount": len(persons),
            "persons": persons,
            "deviceDetected": bool(devices),
            "devices": devices,
        }
