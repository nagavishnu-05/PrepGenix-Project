"""Violation manager with temporal debouncing and configurable thresholds."""

import os
import time
from collections import deque

VIOLATION_TYPES = [
    "NO_FACE",
    "IDENTITY_MISMATCH",
    "MULTIPLE_FACES",
    "CAMERA_DISABLED",
    "CAMERA_ERROR",
    "LOW_FACE_CONFIDENCE",
]

NO_FACE_CONFIRM = int(os.environ.get("NO_FACE_CONFIRMATION_FRAMES", "5"))
MULTIPLE_FACE_CONFIRM = int(os.environ.get("MULTIPLE_FACE_CONFIRMATION_FRAMES", "3"))
IDENTITY_CONFIRM = int(os.environ.get("IDENTITY_MISMATCH_CONFIRMATION_FRAMES", "3"))
CAMERA_CONFIRM = int(os.environ.get("CAMERA_DISABLED_CONFIRMATION_FRAMES", "2"))


class ViolationManager:
    """Tracks violations with temporal debouncing.

    A violation is only confirmed after the condition persists across
    N consecutive monitoring cycles, preventing false positives from
    blinking, camera glitches, or momentary obstructions.
    """

    def __init__(self, max_violations: int = 5, auto_submit: bool = True):
        self.max_violations = max_violations
        self.auto_submit = auto_submit
        self._violation_count = 0
        self._confirmed_violations: list[dict] = []

        self._no_face_frames: deque[bool] = deque(maxlen=NO_FACE_CONFIRM)
        self._multiple_face_frames: deque[bool] = deque(maxlen=MULTIPLE_FACE_CONFIRM)
        self._identity_mismatch_frames: deque[bool] = deque(maxlen=IDENTITY_CONFIRM)
        self._camera_frames: deque[bool] = deque(maxlen=CAMERA_CONFIRM)

        self._active_events: dict[str, dict] = {}
        self._cycle_count = 0
        self._start_time: float = time.time()
        self._grace_seconds: float = float(os.environ.get("VIOLATION_GRACE_SECONDS", "8"))

    def update(self, detection_result: dict) -> dict:
        """Process one monitoring cycle.

        Args:
            detection_result: {
                "face_count": int,
                "face_present": bool,
                "match": bool | None (None if no face or no reference),
                "similarity": float | None,
                "camera_active": bool,
                "quality": str (good/acceptable/poor/unusable)
            }

        Returns: {
            "violations": [...],           # new confirmed violations this cycle
            "violation_count": int,        # total violations
            "should_auto_submit": bool,
            "active_events": {...},        # current tracking state
        }
        """
        self._cycle_count += 1
        new_violations = []

        # Skip violation tracking during grace period after enrollment.
        elapsed = time.time() - self._start_time
        if elapsed < self._grace_seconds:
            return {
                "violations": [],
                "violation_count": self._violation_count,
                "should_auto_submit": False,
                "active_events": dict(self._active_events),
                "cycle": self._cycle_count,
            }

        no_face = not detection_result.get("face_present", True)
        self._no_face_frames.append(no_face)
        if len(self._no_face_frames) >= NO_FACE_CONFIRM and all(self._no_face_frames):
            v = self._confirm_violation("NO_FACE", {
                "description": "No face detected in camera feed.",
                "confidence": detection_result.get("similarity"),
            })
            if v:
                new_violations.append(v)

        face_count = detection_result.get("face_count", 0)
        multiple = face_count > 1
        self._multiple_face_frames.append(multiple)
        if len(self._multiple_face_frames) >= MULTIPLE_FACE_CONFIRM and all(self._multiple_face_frames):
            v = self._confirm_violation("MULTIPLE_FACES", {
                "description": f"Multiple faces detected ({face_count} people).",
                "face_count": face_count,
            })
            if v:
                new_violations.append(v)

        match = detection_result.get("match")
        if match is False:
            self._identity_mismatch_frames.append(True)
            self._no_face_frames.append(False)
            if len(self._identity_mismatch_frames) >= IDENTITY_CONFIRM and all(self._identity_mismatch_frames):
                v = self._confirm_violation("IDENTITY_MISMATCH", {
                    "description": "Identity mismatch detected. A different person may be present.",
                    "similarity": detection_result.get("similarity"),
                })
                if v:
                    new_violations.append(v)
        else:
            self._identity_mismatch_frames.append(False)

        camera_active = detection_result.get("camera_active", True)
        if not camera_active:
            self._camera_frames.append(True)
            if len(self._camera_frames) >= CAMERA_CONFIRM and all(self._camera_frames):
                v = self._confirm_violation("CAMERA_DISABLED", {
                    "description": "Camera is disconnected or disabled.",
                })
                if v:
                    new_violations.append(v)
        else:
            self._camera_frames.append(False)

        quality = detection_result.get("quality", "good")
        if quality == "poor" and face_count == 1:
            self._active_events["LOW_FACE_CONFIDENCE"] = {
                "type": "LOW_FACE_CONFIDENCE",
                "timestamp": time.time(),
                "quality": quality,
            }
        else:
            self._active_events.pop("LOW_FACE_CONFIDENCE", None)

        should_submit = (
            self.auto_submit
            and self._violation_count >= self.max_violations
            and not any(v.get("_already_submitted") for v in new_violations)
        )

        return {
            "violations": new_violations,
            "violation_count": self._violation_count,
            "should_auto_submit": should_submit,
            "active_events": dict(self._active_events),
            "cycle": self._cycle_count,
        }

    def report_camera_error(self, error_type: str = "CAMERA_ERROR") -> dict:
        v = self._confirm_violation(error_type, {
            "description": "Camera error occurred during assessment.",
        })
        return {
            "violations": [v] if v else [],
            "violation_count": self._violation_count,
            "should_auto_submit": self.auto_submit and self._violation_count >= self.max_violations,
        }

    def reset_count(self):
        self._violation_count = max(0, self._violation_count - 1)
        self._no_face_frames.clear()
        self._multiple_face_frames.clear()
        self._identity_mismatch_frames.clear()
        self._camera_frames.clear()
        self._active_events.clear()

    def _confirm_violation(self, vtype: str, details: dict) -> dict | None:
        now = time.time()
        for existing in self._confirmed_violations:
            if existing["type"] == vtype and (now - existing["timestamp"]) < 10:
                return None

        self._violation_count += 1
        violation = {
            "type": vtype,
            "timestamp": now,
            "violation_count": self._violation_count,
            **details,
        }
        self._confirmed_violations.append(violation)
        return violation

    def get_state(self) -> dict:
        return {
            "violation_count": self._violation_count,
            "max_violations": self.max_violations,
            "auto_submit": self.auto_submit,
            "confirmed": [v for v in self._confirmed_violations],
            "cycles": self._cycle_count,
        }

    def reset(self):
        self._violation_count = 0
        self._confirmed_violations.clear()
        self._no_face_frames.clear()
        self._multiple_face_frames.clear()
        self._identity_mismatch_frames.clear()
        self._camera_frames.clear()
        self._active_events.clear()
        self._cycle_count = 0
        self._start_time = time.time()
