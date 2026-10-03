"""Person detection using YOLOv8-nano pretrained on COCO (class 0 = person).

Thin wrapper over the shared `SceneObjectDetector` so the model is loaded and
run only once per monitoring cycle.
"""

import numpy as np

from .object_detector import SceneObjectDetector


class PersonDetector:
    PERSON_CLASS_ID = 0

    def __init__(self, confidence_threshold: float = 0.50):
        self._detector = SceneObjectDetector(confidence_threshold=confidence_threshold)

    def detect(self, frame: np.ndarray) -> dict:
        result = self._detector.detect(frame)
        if not result.get("available", False) and "error" in result:
            return {"error": result["error"], "personCount": 0, "persons": []}
        return {
            "personCount": result["personCount"],
            "persons": result["persons"],
        }
