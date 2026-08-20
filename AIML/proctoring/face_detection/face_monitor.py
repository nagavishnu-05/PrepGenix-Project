"""Face monitor — orchestrates detection, embedding, and violation tracking.

This module is the main entry point for the AI proctoring face system.
It coordinates:
  - Face detection (every monitoring cycle)
  - Reference face enrollment (capture N frames, aggregate embeddings)
  - Continuous identity verification
  - Violation tracking with debouncing
"""

import base64
import time
import sys
import logging
from pathlib import Path

import cv2
import numpy as np

_aiml_root = str(Path(__file__).resolve().parent.parent.parent)
if _aiml_root not in sys.path:
    sys.path.insert(0, _aiml_root)

from face_detection.inference.face_detector import FaceDetector
from face_detection.inference.face_embedding import FaceEmbedding
from face_detection.utils.config import (
    REFERENCE_CAPTURE_FRAMES,
    REFERENCE_MIN_VALID_FRAMES,
    FACE_MATCH_THRESHOLD,
)
from face_detection.utils.image_utils import (
    decode_base64_image,
    crop_face,
    assess_face_quality,
)
from .violation_manager import ViolationManager

logger = logging.getLogger(__name__)


class FaceMonitor:
    """Manages the complete face monitoring lifecycle."""

    def __init__(
        self,
        max_violations: int = 5,
        auto_submit: bool = True,
        match_threshold: float | None = None,
    ):
        self.detector = FaceDetector()
        self.embedding = FaceEmbedding(threshold=match_threshold)
        self.violation_manager = ViolationManager(
            max_violations=max_violations,
            auto_submit=auto_submit,
        )

        self._reference_embedding: np.ndarray | None = None
        self._reference_captured = False
        self._enrollment_frames: list[np.ndarray] = []
        self._enrollment_embeddings: list[np.ndarray] = []

    @property
    def is_enrolled(self) -> bool:
        return self._reference_captured and self._reference_embedding is not None

    def enroll_start(self) -> dict:
        """Reset enrollment state for a new capture session."""
        self._enrollment_frames.clear()
        self._enrollment_embeddings.clear()
        return {
            "status": "capturing",
            "required_frames": REFERENCE_CAPTURE_FRAMES,
            "min_valid_frames": REFERENCE_MIN_VALID_FRAMES,
            "captured": 0,
        }

    def enroll_capture_frame(self, frame: np.ndarray) -> dict:
        """Process one frame during enrollment.

        Returns enrollment progress:
        {
            "status": "capturing" | "ready" | "error",
            "captured": int,
            "required_frames": int,
            "face_detected": bool,
            "face_count": int,
            "quality": str,
            "message": str,
        }
        """
        if frame is None or frame.size == 0:
            return {"status": "error", "message": "Invalid frame", "captured": len(self._enrollment_frames)}

        det = self.detector.detect(frame)
        face_count = det["face_count"]

        if face_count == 0:
            return {
                "status": "capturing",
                "captured": len(self._enrollment_frames),
                "required_frames": REFERENCE_CAPTURE_FRAMES,
                "face_detected": False,
                "face_count": 0,
                "quality": "none",
                "message": "No face detected. Please position your face in front of the camera.",
            }

        if face_count > 1:
            return {
                "status": "capturing",
                "captured": len(self._enrollment_frames),
                "required_frames": REFERENCE_CAPTURE_FRAMES,
                "face_detected": True,
                "face_count": face_count,
                "quality": "multiple",
                "message": f"Multiple faces detected ({face_count}). Only one person should be visible.",
            }

        best = det["faces"][0]
        face_crop = crop_face(frame, {
            "x1": best["bbox"][0], "y1": best["bbox"][1],
            "x2": best["bbox"][2], "y2": best["bbox"][3],
        })
        if face_crop is None:
            return {
                "status": "capturing",
                "captured": len(self._enrollment_frames),
                "required_frames": REFERENCE_CAPTURE_FRAMES,
                "face_detected": True,
                "face_count": 1,
                "quality": "poor",
                "message": "Could not extract face region.",
            }

        quality_info = assess_face_quality(face_crop)
        if quality_info["quality"] == "unusable":
            return {
                "status": "capturing",
                "captured": len(self._enrollment_frames),
                "required_frames": REFERENCE_CAPTURE_FRAMES,
                "face_detected": True,
                "face_count": 1,
                "quality": "poor",
                "message": "Face quality is too low. Please improve lighting.",
            }

        emb = self.embedding.generate_embedding_from_crop(face_crop)
        if emb is None:
            return {
                "status": "capturing",
                "captured": len(self._enrollment_frames),
                "required_frames": REFERENCE_CAPTURE_FRAMES,
                "face_detected": True,
                "face_count": 1,
                "quality": quality_info["quality"],
                "message": "Could not generate face embedding.",
            }

        self._enrollment_frames.append(frame)
        self._enrollment_embeddings.append(emb)

        captured = len(self._enrollment_embeddings)
        if captured >= REFERENCE_CAPTURE_FRAMES:
            ref = self.embedding.aggregate_embeddings(self._enrollment_embeddings)
            if ref is not None:
                self._reference_embedding = ref
                self._reference_captured = True
                return {
                    "status": "ready",
                    "captured": captured,
                    "required_frames": REFERENCE_CAPTURE_FRAMES,
                    "face_detected": True,
                    "face_count": 1,
                    "quality": quality_info["quality"],
                    "message": "Face captured successfully. Your identity has been registered for this assessment.",
                }
            else:
                return {
                    "status": "error",
                    "captured": captured,
                    "message": "Failed to create reference embedding.",
                }

        return {
            "status": "capturing",
            "captured": captured,
            "required_frames": REFERENCE_CAPTURE_FRAMES,
            "face_detected": True,
            "face_count": 1,
            "quality": quality_info["quality"],
            "message": f"Capturing face... ({captured}/{REFERENCE_CAPTURE_FRAMES}). Keep your face visible.",
        }

    def enroll_from_base64(self, image_b64: str) -> dict:
        frame = decode_base64_image(image_b64)
        if frame is None:
            return {"status": "error", "message": "Could not decode image"}
        return self.enroll_capture_frame(frame)

    def enroll_multi_frame(self, frames_b64: list[str]) -> dict:
        """Enroll using multiple pre-captured frames at once."""
        self.enroll_start()
        for b64 in frames_b64:
            result = self.enroll_from_base64(b64)
            if result.get("status") == "ready":
                return result
        if len(self._enrollment_embeddings) >= REFERENCE_MIN_VALID_FRAMES:
            ref = self.embedding.aggregate_embeddings(self._enrollment_embeddings)
            if ref is not None:
                self._reference_embedding = ref
                self._reference_captured = True
                return {
                    "status": "ready",
                    "captured": len(self._enrollment_embeddings),
                    "message": "Face captured successfully.",
                }
        return {
            "status": "error",
            "captured": len(self._enrollment_embeddings),
            "message": f"Not enough valid frames ({len(self._enrollment_embeddings)}/{REFERENCE_MIN_VALID_FRAMES}).",
        }

    def monitor_frame(self, frame: np.ndarray, camera_active: bool = True) -> dict:
        """Process one monitoring cycle during the assessment.

        Returns: {
            "face_count": int,
            "face_present": bool,
            "match": bool | None,
            "similarity": float | None,
            "violations": [...],
            "violation_count": int,
            "should_auto_submit": bool,
            "quality": str,
            "face_registered": bool,
        }
        """
        if frame is None or frame.size == 0:
            vm_result = self.violation_manager.report_camera_error("CAMERA_ERROR")
            return {
                "face_count": 0, "face_present": False,
                "match": None, "similarity": None,
                "violations": vm_result["violations"],
                "violation_count": vm_result["violation_count"],
                "should_auto_submit": vm_result.get("should_auto_submit", False),
                "quality": "unusable",
                "face_registered": self.is_enrolled,
            }

        det = self.detector.detect(frame)
        face_count = det["face_count"]
        face_present = det["face_present"]

        quality = "good"
        match_result = None
        similarity = None

        if face_present and face_count == 1:
            best = det["faces"][0]
            face_crop = crop_face(frame, {
                "x1": best["bbox"][0], "y1": best["bbox"][1],
                "x2": best["bbox"][2], "y2": best["bbox"][3],
            })
            if face_crop is not None:
                q = assess_face_quality(face_crop)
                quality = q["quality"]

                if self.is_enrolled:
                    # Skip identity verification when face quality is too poor
                    # to avoid false positives from bad lighting/angles.
                    if quality in ("poor", "unusable"):
                        match_result = {"match": True, "similarity": None, "quality": quality}
                    else:
                        current_emb = self.embedding.generate_embedding_from_crop(face_crop)
                        if current_emb is not None:
                            match_result = self.embedding.compare(self._reference_embedding, current_emb)
                        else:
                            match_result = {"match": True, "similarity": None}

        detection_input = {
            "face_count": face_count,
            "face_present": face_present,
            "match": match_result["match"] if match_result else None,
            "similarity": match_result["similarity"] if match_result else None,
            "camera_active": camera_active,
            "quality": quality,
        }

        vm_result = self.violation_manager.update(detection_input)

        return {
            "face_count": face_count,
            "face_present": face_present,
            "match": match_result["match"] if match_result else None,
            "similarity": match_result["similarity"] if match_result else None,
            "violations": vm_result["violations"],
            "violation_count": vm_result["violation_count"],
            "should_auto_submit": vm_result.get("should_auto_submit", False),
            "quality": quality,
            "face_registered": self.is_enrolled,
        }

    def monitor_from_base64(self, image_b64: str, camera_active: bool = True) -> dict:
        frame = decode_base64_image(image_b64)
        return self.monitor_frame(frame, camera_active)

    def get_state(self) -> dict:
        return {
            "face_registered": self.is_enrolled,
            "violations": self.violation_manager.get_state(),
            "detector_backend": self.detector.backend_name,
            "embedding_backend": self.embedding.backend_name,
        }

    def reset(self):
        self._reference_embedding = None
        self._reference_captured = False
        self._enrollment_frames.clear()
        self._enrollment_embeddings.clear()
        self.violation_manager.reset()
