"""Face monitor — orchestrates detection, embedding, and violation tracking.

This module is the main entry point for the AI proctoring face system.
It coordinates:
  - Face detection (every monitoring cycle)
  - Reference face enrollment (capture N frames, aggregate embeddings)
  - Continuous identity verification
  - Violation tracking with debouncing
"""

import base64
import os
import time
import sys
import logging
from pathlib import Path

import cv2
import numpy as np

_aiml_root = str(Path(__file__).resolve().parent.parent.parent)
if _aiml_root not in sys.path:
    sys.path.insert(0, _aiml_root)

from proctoring.object_detector import SceneObjectDetector

from face_detection.inference.attention_analyzer import AttentionAnalyzer
from face_detection.inference.blink_detector import BlinkDetector
from face_detection.inference.face_detector import FaceDetector
from face_detection.inference.face_embedding import FaceEmbedding
from face_detection.inference.gaze_estimator import GazeEstimator
from face_detection.inference.head_pose import HeadPoseEstimator
from face_detection.inference.landmark_detector import FacialLandmarkDetector
from face_detection.utils.config import (
    REFERENCE_CAPTURE_FRAMES,
    REFERENCE_MIN_VALID_FRAMES,
    FACE_MATCH_THRESHOLD,
    SCENE_DETECTION_EVERY_N_CYCLES,
)
from face_detection.utils.image_utils import (
    decode_base64_image,
    crop_face,
    assess_face_quality,
)
from .violation_manager import ViolationManager

logger = logging.getLogger(__name__)

# YOLO scene detection (persons + prohibited electronics) is optional; disable
# it on very low-powered machines with PROCTORING_OBJECT_DETECTION_ENABLED=false.
_OBJECT_DETECTION_ENABLED = os.environ.get("PROCTORING_OBJECT_DETECTION_ENABLED", "true").lower() != "false"

# Upper bound on faces embedded per frame. Enough to catch a handful of people
# in shot while keeping the per-cycle cost predictable.
MAX_FACES_FOR_IDENTITY = int(os.environ.get("MAX_FACES_FOR_IDENTITY", "4"))


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
        self.landmarks = self.detector.landmark_detector or FacialLandmarkDetector()
        self.head_pose = HeadPoseEstimator()
        self.gaze = GazeEstimator()
        self.blink = BlinkDetector()
        self.analyzer = AttentionAnalyzer()
        self.violation_manager = ViolationManager(
            max_violations=max_violations,
            auto_submit=auto_submit,
        )
        self.scene_detector = SceneObjectDetector() if _OBJECT_DETECTION_ENABLED else None

        self._reference_embedding: np.ndarray | None = None
        self._reference_captured = False
        self._enrollment_frames: list[np.ndarray] = []
        self._enrollment_embeddings: list[np.ndarray] = []
        self._scene_cycle = 0
        self._last_scene: dict = {}
        # Box of the face that matched the enrolled candidate in the current
        # cycle. Used to align attention analysis to the right person.
        self._reference_face_bbox: list[int] | None = None
        # Identity evidence from the most recent cycle, mirrored into get_state()
        # so a client polling only the state endpoint sees the same picture.
        self._last_identity_detail: dict = {
            "faces_detected": 0,
            "faces_evaluated": 0,
            "faces_matched": 0,
            "faces_unmatched": 0,
            "faces_skipped": 0,
            "multiple_faces": False,
            "threshold": FACE_MATCH_THRESHOLD,
        }

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

        emb = self.embedding.generate_embedding_from_crop(
            face_crop, kps=best.get("landmarks"), frame=frame
        )
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
            "identity_detail": {...},
            "metrics": {...},
            "info_logs": [...],
        }
        """
        if frame is None or frame.size == 0:
            vm_result = self.violation_manager.report_camera_error("CAMERA_ERROR")
            metrics = self._empty_metrics()
            return {
                "face_count": 0, "face_present": False,
                "match": None, "similarity": None,
                "violations": vm_result["violations"],
                "violation_count": vm_result["violation_count"],
                "should_auto_submit": vm_result.get("should_auto_submit", False),
                "quality": "unusable",
                "face_registered": self.is_enrolled,
                "identity_detail": {
                    "faces_detected": 0,
                    "faces_evaluated": 0,
                    "faces_matched": 0,
                    "faces_unmatched": 0,
                    "faces_skipped": 0,
                    "multiple_faces": False,
                    "threshold": FACE_MATCH_THRESHOLD,
                },
                "metrics": metrics,
                "identity_blocked": False,
                "identity_status": "checking",
                "identity_block_reason": None,
                "identity_block_seconds": 0.0,
                "info_logs": vm_result.get("info_logs", []),
            }

        det = self.detector.detect(frame)
        face_count = det["face_count"]
        face_present = det["face_present"]

        # One YOLO pass yields both extra persons and prohibited electronics. It
        # is the most expensive signal in the cycle and phones do not move fast,
        # so it runs on a slower cadence and the previous result is reused in
        # between.
        self._scene_cycle += 1
        run_scene = (
            self.scene_detector is not None
            and (self._scene_cycle % max(1, SCENE_DETECTION_EVERY_N_CYCLES) == 1)
        )
        if run_scene:
            self._last_scene = self.scene_detector.detect(frame) or {}
        scene = self._last_scene
        person_count = int(scene.get("personCount", 0) or 0)
        devices = scene.get("devices", []) or []
        device_detected = bool(scene.get("deviceDetected")) or bool(devices)

        quality = "good"
        match_result = None
        similarity = None
        landmarks_result = {"faces": [], "face_count": 0, "backend": self.landmarks.backend_name}

        if face_present and face_count >= 1:
            match_result = self._verify_identity(frame, det)

            best = max(det["faces"], key=lambda f: (f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1]))
            face_crop = crop_face(frame, {
                "x1": best["bbox"][0], "y1": best["bbox"][1],
                "x2": best["bbox"][2], "y2": best["bbox"][3],
            })
            if face_crop is not None:
                q = assess_face_quality(face_crop)
                quality = q["quality"]

            landmarks_result = self.landmarks.detect_with_fallback(frame)

        similarity = match_result["similarity"] if match_result else None

        head_pose = None
        gaze_est = None
        blink_metrics = None

        if face_count >= 1 and landmarks_result.get("faces"):
            primary = self._primary_face(landmarks_result, frame.shape, det)
            if primary is not None:
                points, bbox = primary
                # _primary_face already returns pixel coordinates.
                head_pose = self.head_pose.estimate(points, frame.shape, normalized=False)
                gaze_est = self.gaze.estimate(points, head_pose)
                blink_metrics = self.blink.update(points, time.time())

        metrics = self.analyzer.analyze(
            landmarks_result=landmarks_result,
            head_pose=head_pose,
            gaze_est=gaze_est,
            blink_metrics=blink_metrics,
            face_count=face_count,
            quality=quality,
        )

        detection_input = {
            "face_count": face_count,
            "face_present": face_present,
            "match": match_result["match"] if match_result else None,
            "similarity": match_result["similarity"] if match_result else None,
            "camera_active": camera_active,
            "quality": quality,
            "looking_away": metrics.looking_away,
            "head_turned": metrics.head_turned,
            "eyes_closed": metrics.prolonged_closure or metrics.eyes_closed,
            "prolonged_closure": metrics.prolonged_closure,
            "blink_count": metrics.blink_count,
            "head_direction": metrics.head_direction,
            "gaze_direction": metrics.gaze_direction,
            "person_count": person_count,
            "devices": devices,
            "device_detected": device_detected,
            "unmatched_faces": (match_result or {}).get("unmatched_faces", 0),
            "enrolled": self.is_enrolled,
        }

        vm_result = self.violation_manager.update(detection_input)

        metrics_dict = self._metrics_to_dict(metrics, head_pose, gaze_est, blink_metrics, det)
        metrics_dict["person_count"] = person_count
        metrics_dict["devices"] = devices

        # How the identity decision was reached, so the client never has to
        # re-derive it from a face count and a similarity.
        identity_detail = {
            "faces_detected": face_count,
            "faces_evaluated": int((match_result or {}).get("evaluated_faces", 0) or 0),
            "faces_matched": int((match_result or {}).get("matched_faces", 0) or 0),
            "faces_unmatched": int((match_result or {}).get("unmatched_faces", 0) or 0),
            "faces_skipped": int((match_result or {}).get("skipped_faces", 0) or 0),
            "multiple_faces": face_count > 1,
            "threshold": FACE_MATCH_THRESHOLD,
        }
        self._last_identity_detail = identity_detail

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
            "identity_detail": identity_detail,
            "metrics": metrics_dict,
            "person_count": person_count,
            "devices": devices,
            "device_detected": device_detected,
            "identity_blocked": vm_result.get("identity_blocked", False),
            "identity_status": vm_result.get("identity_status", "checking"),
            "identity_block_reason": vm_result.get("identity_block_reason"),
            "identity_block_seconds": vm_result.get("identity_block_seconds", 0.0),
            "info_logs": vm_result.get("info_logs", []),
        }

    def _verify_identity(self, frame: np.ndarray, det: dict) -> dict:
        """Compare every visible face against the enrolled candidate.

        Checking only the largest face (or only when exactly one face is
        visible) let a second person sit in frame unchallenged, which is the
        whole point of identity proctoring. Each face is embedded and compared;
        the candidate counts as present when any face matches, and the frame is
        reported as a mismatch when faces were readable but none of them is the
        candidate.

        Returns match=None when nothing could be evaluated (no reference, or
        every face too dark/small/blurred), so an unreadable frame is never
        silently treated as a match.
        """
        if not self.is_enrolled:
            return {"match": None, "similarity": None, "quality": "unusable"}

        faces = sorted(
            det["faces"],
            key=lambda f: (f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1]),
            reverse=True,
        )[:MAX_FACES_FOR_IDENTITY]

        matched = 0
        evaluated = 0
        best_similarity = None
        matched_similarity = None
        skipped = 0
        matched_bbox = None

        for face in faces:
            x1, y1, x2, y2 = face["bbox"]
            crop = crop_face(frame, {"x1": x1, "y1": y1, "x2": x2, "y2": y2})
            if crop is None:
                continue
            q = assess_face_quality(crop)
            if q["quality"] in ("poor", "unusable"):
                skipped += 1
                continue

            # The detector's 5 keypoints are the set ArcFace aligns on, so the
            # face is embedded without running detection a second time.
            crop_kps = face.get("landmarks")

            emb = self.embedding.generate_embedding_from_crop(crop, kps=crop_kps, frame=frame)
            if emb is None:
                continue

            evaluated += 1
            result = self.embedding.compare(self._reference_embedding, emb)
            similarity = result.get("similarity")
            if similarity is not None:
                best_similarity = (
                    similarity if best_similarity is None
                    else max(best_similarity, similarity)
                )
            if result.get("match"):
                matched += 1
                if matched_similarity is None or similarity > matched_similarity:
                    matched_similarity = similarity
                    matched_bbox = list(face["bbox"])

        self._reference_face_bbox = matched_bbox

        if evaluated == 0:
            return {
                "match": None,
                "similarity": None,
                "quality": "poor",
                "evaluated_faces": 0,
                "skipped_faces": skipped,
            }

        return {
            # Any match means the candidate is in frame; a second face is then a
            # MULTIPLE_FACES violation, which is reported separately.
            "match": matched > 0,
            "similarity": best_similarity,
            "evaluated_faces": evaluated,
            "skipped_faces": skipped,
            "matched_faces": matched,
            "unmatched_faces": evaluated - matched,
        }

    def _primary_face(self, landmarks_result: dict, frame_shape, det: dict | None = None):
        """Return landmarks of the largest detected face, in absolute pixel coordinates."""
        faces = landmarks_result.get("faces") or []
        if not faces:
            return None
        # Prefer the landmark set that overlaps the verified reference face so
        # head pose and gaze describe the candidate, not whoever is largest.
        best = self._landmark_face_for_identity(landmarks_result, det, faces)
        h, w = frame_shape[0], frame_shape[1]
        if landmarks_result.get("normalized", False):
            points = [[p[0] * w, p[1] * h, p[2]] for p in best["landmarks"]]
        else:
            points = [list(p) for p in best["landmarks"]]
        return points, best["bbox"]

    def _landmark_face_for_identity(self, landmarks_result: dict, det: dict, faces: list[dict]) -> dict:
        """Pick the landmark face matching the candidate's box.

        The landmark detector and the identity detector can order faces
        differently, so picking "the largest" would attach head pose and gaze to
        the wrong person whenever an intruder is closer to the camera.
        """
        target = None
        if isinstance(det, dict) and det.get("faces"):
            det_faces = det["faces"]
            if self._reference_face_bbox is not None:
                target = self._reference_face_bbox
            else:
                target = max(
                    det_faces,
                    key=lambda f: (f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1]),
                )["bbox"]

        if target is None:
            return max(faces, key=lambda f: (f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1]))

        def area(bbox):
            return max(1, (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]))

        def intersection(bbox):
            x1 = max(bbox[0], target[0])
            y1 = max(bbox[1], target[1])
            x2 = min(bbox[2], target[2])
            y2 = min(bbox[3], target[3])
            return max(0, x2 - x1) * max(0, y2 - y1)

        best = max(faces, key=lambda f: intersection(f["bbox"]) / area(f["bbox"]))
        if intersection(best["bbox"]) <= 0:
            return max(faces, key=lambda f: (f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1]))
        return best

    def _metrics_to_dict(self, metrics, head_pose, gaze_est, blink_metrics, det) -> dict:
        data = {
            "attention_state": metrics.attention_state,
            "looking_towards_screen": metrics.looking_towards_screen,
            "looking_away": metrics.looking_away,
            "head_direction": metrics.head_direction,
            "head_turned": metrics.head_turned,
            "gaze_direction": metrics.gaze_direction,
            "gaze_horizontal": metrics.gaze_horizontal,
            "gaze_vertical": metrics.gaze_vertical,
            "face_stability": metrics.face_stability,
            "eyes_closed": metrics.eyes_closed,
            "eyes_closed_duration": metrics.eyes_closed_duration,
            "prolonged_closure": metrics.prolonged_closure,
            "blink_count": metrics.blink_count,
            "blink_rate_per_minute": metrics.blink_rate_per_minute,
            "landmarks_available": metrics.landmarks_available,
            "landmark_count": metrics.landmark_count,
            "landmark_backend": self.landmarks.backend_name,
            "detector_backend": det.get("backend", self.detector.backend_name),
            "conditions": det.get("conditions", "unknown"),
            "confidence": metrics.confidence,
        }
        if head_pose is not None:
            data["yaw"] = head_pose.yaw
            data["pitch"] = head_pose.pitch
            data["roll"] = head_pose.roll
        if gaze_est is not None:
            data["gaze_confidence"] = gaze_est.confidence
        if blink_metrics is not None and blink_metrics.events:
            data["last_blink"] = {
                "timestamp": blink_metrics.events[-1].timestamp,
                "type": blink_metrics.events[-1].type,
                "duration": blink_metrics.events[-1].duration,
            }
        if metrics.overlay_landmarks:
            data["landmarks"] = [[round(p[0], 5), round(p[1], 5)] for p in metrics.overlay_landmarks]
        return data

    def _empty_metrics(self) -> dict:
        return {
            "attention_state": "absent",
            "looking_towards_screen": False,
            "looking_away": False,
            "head_direction": "center",
            "head_turned": False,
            "gaze_direction": "center",
            "gaze_horizontal": 0.0,
            "gaze_vertical": 0.0,
            "face_stability": False,
            "eyes_closed": False,
            "eyes_closed_duration": 0.0,
            "prolonged_closure": False,
            "blink_count": 0,
            "blink_rate_per_minute": 0.0,
            "landmarks_available": False,
            "landmark_count": 0,
            "landmark_backend": self.landmarks.backend_name,
            "detector_backend": self.detector.backend_name,
            "conditions": "unknown",
            "confidence": 0.0,
        }

    def monitor_from_base64(self, image_b64: str, camera_active: bool = True) -> dict:
        frame = decode_base64_image(image_b64)
        return self.monitor_frame(frame, camera_active)

    def get_state(self) -> dict:
        vm_state = self.violation_manager.get_state()
        return {
            "face_registered": self.is_enrolled,
            "identity_status": vm_state["identity_status"],
            "identity_blocked": vm_state["identity_blocked"],
            "identity_block_reason": vm_state["identity_block_reason"],
            "identity_detail": dict(self._last_identity_detail),
            "violations": vm_state,
            "detector_backend": self.detector.backend_name,
            "embedding_backend": self.embedding.backend_name,
            "landmark_backend": self.landmarks.backend_name,
        }

    def reset(self):
        self._reference_embedding = None
        self._reference_captured = False
        self._reference_face_bbox = None
        self._enrollment_frames.clear()
        self._enrollment_embeddings.clear()
        self.blink.reset()
        self.analyzer.reset()
        self.violation_manager.reset()
