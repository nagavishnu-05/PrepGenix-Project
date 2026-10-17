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
from face_detection.utils.device_tracker import DeviceTracker

PERSON_CONFIRM_FRAMES = int(os.environ.get("PERSON_CONFIRMATION_FRAMES", "5"))
NO_FACE_CONFIRM_FRAMES = int(os.environ.get("NO_FACE_CONFIRMATION_FRAMES", "15"))
IMPOSTER_CONFIRM_FRAMES = int(os.environ.get("IMPOSTER_CONFIRMATION_FRAMES", "5"))
DEVICE_CONFIDENCE = float(os.environ.get("DEVICE_CONFIDENCE_THRESHOLD", "0.60"))
PERSON_CONFIDENCE = float(os.environ.get("PERSON_CONFIDENCE_THRESHOLD", "0.60"))


class ProctoringEngine:
    def __init__(self):
        self.face_detector = FaceDetector()
        self._modern_detector = ModernFaceDetector()
        self._embedding = FaceEmbedding()
        # Share the one embedding backend with the verifier.
        self.face_verifier = FaceVerifier(embedding=self._embedding)
        self.person_detector = PersonDetector(confidence_threshold=PERSON_CONFIDENCE)
        self.device_detector = DeviceDetector(confidence_threshold=DEVICE_CONFIDENCE)

        self._device_tracker = DeviceTracker()
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
        """Register the reference face from the initial frame.

        Delegates to the verifier, which refuses to register when no real
        embedding backend is loaded. A histogram vector is never accepted as a
        reference: it cannot verify identity.
        """
        result = self.face_verifier.register(frame)
        if result.get("success"):
            self._reference_embedding = self.face_verifier._reference_embedding
            self._face_registered = True
            result.setdefault("message", "Reference face registered successfully")
        return result

    def register_face_from_embeddings(self, embeddings: list) -> dict:
        """Register face from pre-computed embeddings (multi-frame enrollment)."""
        import numpy as np
        valid = [e for e in embeddings if e is not None and getattr(e, "size", 0) > 0]
        if not valid:
            return {"success": False, "error": "no_embeddings", "message": "No valid embeddings provided"}

        stacked = np.stack(valid, axis=0)
        mean_emb = np.mean(stacked, axis=0)
        norm = np.linalg.norm(mean_emb)
        if norm > 1e-8:
            mean_emb = mean_emb / norm
        self._reference_embedding = mean_emb.astype(np.float32)
        self._face_registered = True
        # Keep the verifier's reference in sync so /verify-face agrees with the
        # engine's own embedded reference.
        self.face_verifier._reference_embedding = self._reference_embedding
        self.face_verifier._reference_set = True
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

        # Rolling-window confirmation: a weak, partial phone only raises a
        # "possible" review state; a violation needs consistent hits plus a
        # strong detection.
        device_state = self._device_tracker.update(device_result.get("devices", []))
        if device_state["level"] == "confirmed" and "ELECTRONIC_DEVICE" not in self._confirmed:
            self._confirmed.add("ELECTRONIC_DEVICE")
            violations.append({
                "type": "ELECTRONIC_DEVICE",
                "confidence": device_state.get("best_confidence", 0.0),
                "devices": device_state.get("devices") or device_result.get("devices", []),
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
        identity_unverified = False
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
                    # Pass the detector keypoints so the face is aligned exactly
                    # as the recognition model expects, and so a face that is
                    # merely unreadable yields "unverified" (match=None) rather
                    # than being mistaken for a different person.
                    cur_emb = self._embedding.generate_embedding_from_crop(
                        crop, kps=best_face.get("landmarks"), frame=frame
                    )
                    if cur_emb is not None:
                        cmp = self._embedding.compare(self._reference_embedding, cur_emb)
                        face_verification = cmp
                        identity_mismatch = cmp.get("match") is False
                        identity_unverified = cmp.get("match") is None
                    else:
                        q = assess_face_quality(crop)
                        face_verification = {"match": None, "similarity": None, "quality": q["quality"]}
                        identity_unverified = True
            else:
                identity_unverified = True

        elif self._face_registered and mod_det.get("face_present"):
            fv_result = self.face_verifier.verify(frame)
            face_verification = fv_result
            identity_mismatch = fv_result.get("match") is False
            identity_unverified = fv_result.get("match") is None

        # Only a readable-but-different face counts as mismatch evidence. A
        # low-quality/unreadable frame pushes False and never proves identity.
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
            "identityUnverified": identity_unverified,
            "identityBackend": self._embedding.backend_name,
            "faceRegistered": self._face_registered,
            "violations": violations,
            "autoSubmit": auto_submit,
            "cheatingReason": cheat_reason,
            "confirmationProgress": {
                "device": device_state["hits"],
                "deviceThreshold": device_state["min_hits"],
                "deviceLevel": device_state["level"],
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
            "identityUnverified": False,
            "identityBackend": self._embedding.backend_name,
            "faceRegistered": self._face_registered,
            "violations": [],
            "autoSubmit": False,
            "cheatingReason": None,
            "confirmationProgress": {},
            "confirmedViolations": list(self._confirmed),
        }

    def reset(self):
        self._device_tracker.reset()
        self._person_frames.clear()
        self._no_face_frames.clear()
        self._imposter_frames.clear()
        self._confirmed.clear()
        self._face_registered = False
        self._reference_embedding = None
        self._enrollment_embeddings.clear()
        self._start_time = time.time()
        self.face_verifier.reset()
