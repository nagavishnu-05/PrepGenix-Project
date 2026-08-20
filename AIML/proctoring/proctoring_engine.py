"""Proctoring engine with temporal confirmation.

Upgraded to use modern face detection/embedding system.
Preserves backward compatibility with person and device detectors.
"""

import os
import time
from collections import deque

from .face_detector import FaceDetector
from .face_verifier import FaceVerifier
from .person_detector import PersonDetector
from .device_detector import DeviceDetector

import sys
from pathlib import Path
_aiml_root = str(Path(__file__).resolve().parent.parent)
if _aiml_root not in sys.path:
    sys.path.insert(0, _aiml_root)

from face_detection.inference.face_detector import FaceDetector as ModernFaceDetector
from face_detection.inference.face_embedding import FaceEmbedding
from face_detection.utils.image_utils import crop_face, assess_face_quality
from face_detection.utils.config import FACE_MATCH_THRESHOLD

DEVICE_CONFIRM_FRAMES = int(os.environ.get("DEVICE_CONFIRMATION_FRAMES", "5"))
PERSON_CONFIRM_FRAMES = int(os.environ.get("PERSON_CONFIRMATION_FRAMES", "5"))
NO_FACE_CONFIRM_FRAMES = int(os.environ.get("NO_FACE_CONFIRMATION_FRAMES", "15"))
IMPOSTER_CONFIRM_FRAMES = int(os.environ.get("IMPOSTER_CONFIRMATION_FRAMES", "5"))
DEVICE_CONFIDENCE = float(os.environ.get("DEVICE_CONFIDENCE_THRESHOLD", "0.60"))
PERSON_CONFIDENCE = float(os.environ.get("PERSON_CONFIDENCE_THRESHOLD", "0.60"))


class ProctoringEngine:
    def __init__(self):
        self.face_detector = FaceDetector()
        self.face_verifier = FaceVerifier()
        self.person_detector = PersonDetector(confidence_threshold=PERSON_CONFIDENCE)
        self.device_detector = DeviceDetector(confidence_threshold=DEVICE_CONFIDENCE)

        self._modern_detector = ModernFaceDetector()
        self._embedding = FaceEmbedding()

        self._device_frames = deque(maxlen=DEVICE_CONFIRM_FRAMES)
        self._person_frames = deque(maxlen=PERSON_CONFIRM_FRAMES)
        self._no_face_frames = deque(maxlen=NO_FACE_CONFIRM_FRAMES)
        self._imposter_frames = deque(maxlen=IMPOSTER_CONFIRM_FRAMES)
        self._confirmed = set()
        self._face_registered = False
        self._reference_embedding = None
        self._enrollment_embeddings = []
        self._start_time = time.time()
        self._grace_seconds = float(os.environ.get("VIOLATION_GRACE_SECONDS", "8"))

    def register_face(self, frame) -> dict:
        """Register the reference face from the initial frame."""
        emb = self._embedding.generate_embedding(frame)
        if emb is not None:
            self._reference_embedding = emb
            self._face_registered = True
            result = self.face_verifier.register(frame)
            return {
                "success": True,
                "faceCount": result.get("faceCount", 1),
                "quality": result.get("quality", "good"),
                "box": result.get("box"),
                "message": "Reference face registered successfully",
            }

        result = self.face_verifier.register(frame)
        if result.get("success"):
            self._face_registered = True
        return result

    def register_face_from_embeddings(self, embeddings: list) -> dict:
        """Register face from pre-computed embeddings (multi-frame enrollment)."""
        import numpy as np
        valid = [e for e in embeddings if e is not None]
        if not valid:
            return {"success": False, "error": "no_embeddings", "message": "No valid embeddings provided"}

        stacked = np.stack(valid, axis=0)
        mean_emb = np.mean(stacked, axis=0)
        norm = np.linalg.norm(mean_emb)
        if norm > 1e-8:
            mean_emb = mean_emb / norm
        self._reference_embedding = mean_emb.astype(np.float32)
        self._face_registered = True
        return {"success": True, "faceCount": len(valid), "message": "Reference face registered from multiple frames"}

    def analyze(self, frame) -> dict:
        import numpy as np
        if frame is None or not isinstance(frame, np.ndarray):
            return self._result()

        # Skip violation tracking during grace period after engine creation.
        elapsed = time.time() - self._start_time
        if elapsed < self._grace_seconds:
            result = self._result()
            result["face"] = {"faces": 0, "facePresent": False, "multipleFaces": False}
            return result

        mod_det = self._modern_detector.detect(frame)
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

        no_face = not face_result.get("facePresent", True) and not mod_det.get("face_present", False)
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

        face_verification = None
        identity_mismatch = False
        if self._face_registered and self._reference_embedding is not None and mod_det.get("face_present"):
            best_face = None
            if mod_det["faces"]:
                best_face = max(mod_det["faces"], key=lambda f: f["confidence"])
            if best_face:
                crop = crop_face(frame, {
                    "x1": best_face["bbox"][0], "y1": best_face["bbox"][1],
                    "x2": best_face["bbox"][2], "y2": best_face["bbox"][3],
                })
                if crop is not None:
                    cur_emb = self._embedding.generate_embedding_from_crop(crop)
                    if cur_emb is not None:
                        cmp = self._embedding.compare(self._reference_embedding, cur_emb)
                        face_verification = cmp
                        identity_mismatch = not cmp.get("match", True)
                    else:
                        q = assess_face_quality(crop)
                        face_verification = {"match": True, "similarity": None, "quality": q["quality"]}

        elif self._face_registered and mod_det.get("face_present"):
            fv_result = self.face_verifier.verify(frame)
            face_verification = fv_result
            identity_mismatch = fv_result.get("imposter", False)

        self._imposter_frames.append(identity_mismatch)
        if (
            len(self._imposter_frames) >= IMPOSTER_CONFIRM_FRAMES
            and all(self._imposter_frames)
            and "IMPOSTER_DETECTED" not in self._confirmed
        ):
            self._confirmed.add("IMPOSTER_DETECTED")
            violations.append({
                "type": "IMPOSTER_DETECTED",
                "confidence": face_verification.get("similarity", 0) if face_verification else 0,
                "similarity": face_verification.get("similarity") if face_verification else None,
                "threshold": face_verification.get("threshold") if face_verification else None,
                "confirmed": True,
            })
        elif self._face_registered:
            self._imposter_frames.append(False)

        auto_submit = len(self._confirmed) > 0
        cheat_reason = None
        if auto_submit:
            cheat_reason = next(iter(self._confirmed))

        return {
            "face": {
                "faces": mod_det.get("face_count", face_result.get("faces", 0)),
                "facePresent": mod_det.get("face_present", face_result.get("facePresent", False)),
                "multipleFaces": mod_det.get("multiple_faces", face_result.get("multipleFaces", False)),
                "boxes": [{"x": f["bbox"][0], "y": f["bbox"][1], "w": f["bbox"][2]-f["bbox"][0], "h": f["bbox"][3]-f["bbox"][1]} for f in mod_det.get("faces", [])],
            },
            "person": person_result,
            "device": device_result,
            "faceVerification": face_verification,
            "faceRegistered": self._face_registered,
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
                "imposter": len(self._imposter_frames),
                "imposterThreshold": IMPOSTER_CONFIRM_FRAMES,
            },
            "confirmedViolations": list(self._confirmed),
        }

    def _result(self):
        return {
            "face": {"faces": 0, "facePresent": False, "multipleFaces": False},
            "person": {"personCount": 0, "persons": []},
            "device": {"deviceDetected": False, "devices": [], "count": 0},
            "faceVerification": None,
            "faceRegistered": self._face_registered,
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
        self._imposter_frames.clear()
        self._confirmed.clear()
        self._face_registered = False
        self._reference_embedding = None
        self._enrollment_embeddings.clear()
        self._start_time = time.time()
        self.face_verifier.reset()
