"""Single shared YOLOv8-nano COCO model for scene analysis.

Both `PersonDetector` and `DeviceDetector` used to keep their own module-level
YOLO instance and run an independent inference pass, so every monitoring cycle
paid for two model loads (once) and two forward passes (always). This module
owns one lazily-loaded model, and `SceneObjectDetector` parses a single pass for
both persons and prohibited electronic devices.

Partial phones
--------------
A general-purpose COCO model scores a phone that shows only a thin edge or a
corner far below the class default, and in the full (typically 320px) monitor
frame it may occupy only a few pixels. Two things help:

  * crop inference - the detector is also run on overlapping tiles, so a phone
    that is a handful of pixels in the full frame becomes tens of pixels in a
    crop and is resolvable again. Detections across tiles are merged with NMS.
  * confidence levels - every device is tagged ``confirmed`` or ``possible``.
    A weak edge is only ever a "possible object" review signal; the temporal
    tracker in the violation manager decides whether it becomes a real device.

Optional evidence capture writes anonymized-ish crops and scores to
``DEVICE_EVIDENCE_DIR`` for threshold tuning and training-data collection.
"""

import json
import os
import time
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

# Above this confidence a detection may become a confirmed device (subject to
# temporal + location evidence). Below it, a detection is only ever "possible".
_CONFIRMED_CONFIDENCE = float(os.environ.get("DEVICE_CONFIRMED_CONFIDENCE", "0.35"))

# Inference size. Upscaling the (typically 320px-wide) monitor frame to the
# detector input helps small/partial phones survive the model's own resize.
_IMGSZ = int(os.environ.get("DEVICE_DETECTION_IMGSZ", "640"))

# Crop inference: run the detector on a grid of overlapping tiles in addition
# to the full frame. Off on constrained machines.
_CROP_INFERENCE = os.environ.get("DEVICE_CROP_INFERENCE_ENABLED", "true").lower() == "true"
_CROP_TILES = max(1, int(os.environ.get("DEVICE_CROP_TILES", "2")))
_CROP_OVERLAP = float(os.environ.get("DEVICE_CROP_OVERLAP", "0.2"))

# Optional debug evidence. Empty disables it entirely.
_EVIDENCE_DIR = os.environ.get("DEVICE_EVIDENCE_DIR", "").strip()

_IOU_MERGE = float(os.environ.get("DEVICE_NMS_IOU", "0.5"))


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


def _iou(a: dict, b: dict) -> float:
    x1 = max(a["x1"], b["x1"])
    y1 = max(a["y1"], b["y1"])
    x2 = min(a["x2"], b["x2"])
    y2 = min(a["y2"], b["y2"])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, a["x2"] - a["x1"]) * max(0.0, a["y2"] - a["y1"])
    area_b = max(0.0, b["x2"] - b["x1"]) * max(0.0, b["y2"] - b["y1"])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _merge_detections(detections: list[dict]) -> list[dict]:
    """Greedy NMS per class so a phone seen in two overlapping tiles counts once."""
    kept: list[dict] = []
    for det in sorted(detections, key=lambda d: d["confidence"], reverse=True):
        duplicate = False
        for existing in kept:
            if existing["class"] != det["class"]:
                continue
            if _iou(existing["box"], det["box"]) >= _IOU_MERGE:
                duplicate = True
                break
        if not duplicate:
            kept.append(det)
    return kept


class SceneObjectDetector:
    """Detects persons and prohibited electronics in one inference pass.

    Devices are additionally searched for in overlapping crops so partial phones
    are not lost to the full-frame resize.
    """

    def __init__(self, confidence_threshold: float = 0.45):
        self.confidence_threshold = confidence_threshold

    def detect(self, frame: np.ndarray) -> dict:
        model = get_model()
        unavailable = {
            "available": False,
            "personCount": 0,
            "persons": [],
            "deviceDetected": False,
            "confirmedDevices": [],
            "possibleDevices": [],
            "devices": [],
        }
        if model is False or model is None:
            return unavailable

        floor = min([self.confidence_threshold, *_CLASS_CONFIDENCE.values()])
        try:
            persons, devices = self._detect_region(model, frame, floor)
        except Exception as exc:  # noqa: BLE001
            return {**unavailable, "error": str(exc)}

        # Crop inference: hunt for partial phones in overlapping tiles. Persons
        # come only from the full frame to avoid double-counting.
        if _CROP_INFERENCE and _CROP_TILES > 1:
            devices.extend(self._detect_devices_in_crops(model, frame, floor))

        devices = _merge_detections(devices)
        for det in devices:
            det["level"] = "confirmed" if det["confidence"] >= _CONFIRMED_CONFIDENCE else "possible"

        confirmed = [d for d in devices if d["level"] == "confirmed"]
        possible = [d for d in devices if d["level"] == "possible"]

        if devices:
            self._save_evidence(frame, devices)

        return {
            "available": True,
            "personCount": len(persons),
            "persons": persons,
            "deviceDetected": bool(confirmed),
            "confirmedDevices": confirmed,
            "possibleDevices": possible,
            "devices": devices,
        }

    def _detect_region(self, model, frame: np.ndarray, floor: float):
        """Run one pass and return (persons, device detections) in frame coords."""
        results = model(frame, conf=floor, iou=0.5, imgsz=_IMGSZ, verbose=False)
        persons: list[dict] = []
        devices: list[dict] = []
        for result in results:
            names = result.names or {}
            for box in result.boxes:
                cls_id = int(box.cls[0])
                conf = round(float(box.conf[0]), 3)
                x1, y1, x2, y2 = [round(v, 1) for v in box.xyxy[0].tolist()]
                if cls_id == PERSON_CLASS_ID:
                    persons.append({
                        "confidence": conf,
                        "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                    })
                    continue

                label = PROHIBITED_CLASSES.get(cls_id)
                if label and conf >= _CLASS_CONFIDENCE.get(cls_id, self.confidence_threshold):
                    devices.append({
                        "class": names.get(cls_id, str(cls_id)),
                        "label": label,
                        "confidence": conf,
                        "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                        "source": "full",
                    })
        return persons, devices

    def _detect_devices_in_crops(self, model, frame: np.ndarray, floor: float) -> list[dict]:
        """Run the detector on overlapping tiles, returning device detections in
        full-frame coordinates."""
        h, w = frame.shape[:2]
        tile_w = max(1, int(w / _CROP_TILES))
        tile_h = max(1, int(h / _CROP_TILES))
        pad_x = int(tile_w * _CROP_OVERLAP)
        pad_y = int(tile_h * _CROP_OVERLAP)

        found: list[dict] = []
        for ty in range(_CROP_TILES):
            for tx in range(_CROP_TILES):
                x1 = max(0, tx * tile_w - pad_x)
                y1 = max(0, ty * tile_h - pad_y)
                x2 = min(w, (tx + 1) * tile_w + pad_x)
                y2 = min(h, (ty + 1) * tile_h + pad_y)
                crop = frame[y1:y2, x1:x2]
                if crop.size == 0 or crop.shape[0] < 32 or crop.shape[1] < 32:
                    continue
                try:
                    _, devices = self._detect_region(model, crop, floor)
                except Exception:  # noqa: BLE001 - a bad tile must not kill the cycle
                    continue
                for det in devices:
                    b = det["box"]
                    det["box"] = {
                        "x1": round(b["x1"] + x1, 1),
                        "y1": round(b["y1"] + y1, 1),
                        "x2": round(b["x2"] + x1, 1),
                        "y2": round(b["y2"] + y1, 1),
                    }
                    det["source"] = "crop"
                    found.append(det)
        return found

    def _save_evidence(self, frame: np.ndarray, devices: list[dict]) -> None:
        """Persist the device crops and scores when evidence capture is enabled."""
        if not _EVIDENCE_DIR:
            return
        try:
            import cv2

            out_dir = Path(_EVIDENCE_DIR)
            out_dir.mkdir(parents=True, exist_ok=True)
            h, w = frame.shape[:2]
            stamp = time.strftime("%Y%m%d-%H%M%S")
            for i, det in enumerate(devices):
                b = det["box"]
                x1 = max(0, int(b["x1"]))
                y1 = max(0, int(b["y1"]))
                x2 = min(w, int(b["x2"]))
                y2 = min(h, int(b["y2"]))
                if x2 <= x1 or y2 <= y1:
                    continue
                crop = frame[y1:y2, x1:x2]
                name = f"{stamp}_{det['level']}_{det['class'].replace(' ', '-')}_{i}"
                cv2.imwrite(str(out_dir / f"{name}.jpg"), crop)
                with open(out_dir / f"{name}.json", "w", encoding="utf-8") as fh:
                    json.dump(det, fh, indent=2)
        except Exception:  # noqa: BLE001 - evidence capture is best effort
            pass
