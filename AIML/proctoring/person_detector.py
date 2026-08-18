"""Person detection using YOLOv8-nano pretrained on COCO.

COCO class 0 = person.
"""

import os
import numpy as np

_model = None


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
        print(f"[person_detector] YOLOv8 not available: {e}")
        _model = False
    return _model


class PersonDetector:
    PERSON_CLASS_ID = 0

    def __init__(self, confidence_threshold: float = 0.50):
        self.confidence_threshold = confidence_threshold

    def detect(self, frame: np.ndarray) -> dict:
        model = _load_model()
        if not model or model is False:
            return {"error": "YOLOv8 not available", "personCount": 0, "persons": []}

        try:
            results = model(frame, conf=self.confidence_threshold, verbose=False)
        except Exception as e:
            return {"error": str(e), "personCount": 0, "persons": []}

        persons = []
        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                if cls_id == self.PERSON_CLASS_ID:
                    conf = float(box.conf[0])
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    persons.append({
                        "confidence": round(conf, 3),
                        "box": {"x1": round(x1, 1), "y1": round(y1, 1), "x2": round(x2, 1), "y2": round(y2, 1)},
                    })

        return {
            "personCount": len(persons),
            "persons": persons,
        }
