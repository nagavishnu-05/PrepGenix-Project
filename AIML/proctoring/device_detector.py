"""Electronic device detection using YOLOv8-nano pretrained on COCO.

COCO classes for prohibited devices:
  67 = cell phone
  63 = laptop

Also supports custom YOLO model via PROCTORING_DEVICE_MODEL=custom.
"""

import os
import numpy as np

_model = None
_custom_model = None

PROHIBITED_CLASSES = {
    "cell phone": "PHONE",
    "laptop": "LAPTOP",
    "remote": "REMOTE",
    "keyboard": "KEYBOARD",
    "tv": "TV",
}

DEVICE_ENV = os.environ.get("PROCTORING_DEVICE_MODEL", "coco")
CUSTOM_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "device_detector.pt")


def _load_model():
    global _model
    if _model is not None:
        return _model
    try:
        from ultralytics import YOLO
        model_path = os.path.join(os.path.dirname(__file__), "..", "models", "yolov8n.pt")
        if not os.path.exists(model_path):
            model_path = "yolov8n.pt"
        _model = YOLO(model_path)
    except Exception as e:
        print(f"[device_detector] YOLOv8 not available: {e}")
        _model = False
    return _model


def _load_custom_model():
    global _custom_model
    if _custom_model is not None:
        return _custom_model
    if not os.path.exists(CUSTOM_MODEL_PATH):
        return None
    try:
        from ultralytics import YOLO
        _custom_model = YOLO(CUSTOM_MODEL_PATH)
    except Exception:
        return None
    return _custom_model


class DeviceDetector:
    def __init__(self, confidence_threshold: float = 0.50):
        self.confidence_threshold = confidence_threshold

    def detect(self, frame: np.ndarray) -> dict:
        if DEVICE_ENV == "custom":
            custom = _load_custom_model()
            if custom:
                return self._run_model(custom, frame, source="custom")

        model = _load_model()
        if not model or model is False:
            return {"error": "YOLOv8 not available", "deviceDetected": False, "devices": []}
        return self._run_model(model, frame, source="coco")

    def _run_model(self, model, frame: np.ndarray, source: str = "coco") -> dict:
        try:
            results = model(frame, conf=self.confidence_threshold, verbose=False)
        except Exception as e:
            return {"error": str(e), "deviceDetected": False, "devices": []}

        devices = []
        phone_detected = False

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                cls_name = r.names.get(cls_id, str(cls_id))
                conf = float(box.conf[0])
                label = PROHIBITED_CLASSES.get(cls_name.lower())
                if label or "phone" in cls_name.lower():
                    devices.append({
                        "class": cls_name,
                        "label": label or "PHONE",
                        "confidence": round(conf, 3),
                        "source": source,
                    })
                    phone_detected = True

        return {
            "deviceDetected": phone_detected,
            "devices": devices,
            "count": len(devices),
        }
