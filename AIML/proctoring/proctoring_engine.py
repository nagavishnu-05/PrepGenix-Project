"""Proctoring engine with temporal confirmation.

Uses face, person, and device detectors.
Requires N consecutive frames of violation before confirming.
"""

import os
import time
from collections import deque

from .face_detector import FaceDetector
from .person_detector import PersonDetector
from .device_detector import DeviceDetector

DEVICE_CONFIRM_FRAMES = int(os.environ.get("DEVICE_CONFIRMATION_FRAMES", "5"))
PERSON_CONFIRM_FRAMES = int(os.environ.get("PERSON_CONFIRMATION_FRAMES", "5"))
NO_FACE_CONFIRM_FRAMES = int(os.environ.get("NO_FACE_CONFIRMATION_FRAMES", "15"))
DEVICE_CONFIDENCE = float(os.environ.get("DEVICE_CONFIDENCE_THRESHOLD", "0.60"))
PERSON_CONFIDENCE = float(os.environ.get("PERSON_CONFIDENCE_THRESHOLD", "0.60"))


class ProctoringEngine:
    def __init__(self):
        self.face_detector = FaceDetector()
        self.person_detector = PersonDetector(confidence_threshold=PERSON_CONFIDENCE)
        self.device_detector = DeviceDetector(confidence_threshold=DEVICE_CONFIDENCE)

        self._device_frames = deque(maxlen=DEVICE_CONFIRM_FRAMES)
        self._person_frames = deque(maxlen=PERSON_CONFIRM_FRAMES)
        self._no_face_frames = deque(maxlen=NO_FACE_CONFIRM_FRAMES)
        self._confirmed = set()

    def analyze(self, frame) -> dict:
        import numpy as np
        if frame is None:
            return self._result()

        if not isinstance(frame, np.ndarray):
            return self._result()

        face_result = self.face_detector.detect(frame)
        person_result = self.person_detector.detect(frame)
        device_result = self.device_detector.detect(frame)

        violations = []

        device_detected = device_result.get("deviceDetected", False)
        self._device_frames.append(device_detected)
        if (
            len(self._device_frames) >= DEVICE_CONFIRM_FRAMES
            and all(self._device_frames)
            and "ELECTRONIC_DEVICE" not in self._confirmed
        ):
            self._confirmed.add("ELECTRONIC_DEVICE")
            violations.append({
                "type": "ELECTRONIC_DEVICE",
                "confidence": max((d["confidence"] for d in device_result.get("devices", [])), default=0.0),
                "devices": device_result.get("devices", []),
                "confirmed": True,
            })

        person_count = person_result.get("personCount", 0)
        multiple = person_count >= 2
        self._person_frames.append(multiple)
        if (
            len(self._person_frames) >= PERSON_CONFIRM_FRAMES
            and all(self._person_frames)
            and "MULTIPLE_PERSONS" not in self._confirmed
        ):
            self._confirmed.add("MULTIPLE_PERSONS")
            violations.append({
                "type": "MULTIPLE_PERSONS",
                "confidence": max((p["confidence"] for p in person_result.get("persons", [])), default=0.0),
                "personCount": person_count,
                "confirmed": True,
            })

        no_face = not face_result.get("facePresent", True)
        self._no_face_frames.append(no_face)
        if (
            len(self._no_face_frames) >= NO_FACE_CONFIRM_FRAMES
            and all(self._no_face_frames)
            and "CANDIDATE_NOT_VISIBLE" not in self._confirmed
        ):
            self._confirmed.add("CANDIDATE_NOT_VISIBLE")
            violations.append({
                "type": "CANDIDATE_NOT_VISIBLE",
                "confidence": 0.85,
                "confirmed": True,
            })

        auto_submit = len(self._confirmed) > 0
        cheat_reason = None
        if auto_submit:
            cheat_reason = next(iter(self._confirmed))

        return {
            "face": face_result,
            "person": person_result,
            "device": device_result,
            "violations": violations,
            "autoSubmit": auto_submit,
            "cheatingReason": cheat_reason,
            "confirmationProgress": {
                "device": len(self._device_frames),
                "deviceThreshold": DEVICE_CONFIRM_FRAMES,
                "multiplePerson": len(self._person_frames),
                "multiplePersonThreshold": PERSON_CONFIRM_FRAMES,
                "noFace": len(self._no_face_frames),
                "noFaceThreshold": NO_FACE_CONFIRM_FRAMES,
            },
            "confirmedViolations": list(self._confirmed),
        }

    def _result(self):
        return {
            "face": {"faces": 0, "facePresent": False, "multipleFaces": False},
            "person": {"personCount": 0, "persons": []},
            "device": {"deviceDetected": False, "devices": [], "count": 0},
            "violations": [],
            "autoSubmit": False,
            "cheatingReason": None,
            "confirmationProgress": {},
            "confirmedViolations": list(self._confirmed),
        }

    def reset(self):
        self._device_frames.clear()
        self._person_frames.clear()
        self._no_face_frames.clear()
        self._confirmed.clear()
