"""Violation manager with temporal debouncing and configurable thresholds.

Supports identity violations (no face, multiple faces, impersonation) and
attention violations (looking away, prolonged head turn, prolonged eye closure),
plus non-punitive face-absence logging beyond a grace period.

Presence and identity are confirmed by elapsed time rather than by a frame count.
A frame count silently ties the warning delay to the client's polling cadence, so
"3 frames" is a 6 second warning at a 2s poll and an instant warning at 500ms.
"""

import os
import time
from collections import deque
from face_detection.utils.config import (
    IDENTITY_MISMATCH_CONFIRM_SECONDS,
    IDENTITY_MISMATCH_MIN_SAMPLES,
    MULTIPLE_FACE_CONFIRM_SECONDS,
    MULTIPLE_FACE_MIN_SAMPLES,
    GAZE_HOLD_SECONDS,
    NO_FACE_CONFIRM_SECONDS,
    NO_FACE_MIN_SAMPLES,
)

VIOLATION_TYPES = [
    "NO_FACE",
    "IDENTITY_MISMATCH",
    "MULTIPLE_FACES",
    "MULTIPLE_PERSONS",
    "PHONE_DETECTED",
    "ELECTRONIC_DEVICE",
    "CAMERA_DISABLED",
    "CAMERA_ERROR",
    "LOW_FACE_CONFIDENCE",
    "LOOKING_AWAY",
    "HEAD_TURNED_AWAY",
    "EYES_CLOSED",
]

INFO_LOG_TYPES = [
    "FACE_ABSENCE",
    "FACE_RESTORED",
    "BLINK",
    "CANDIDATE_LOST_TRACK",
]

MULTIPLE_PERSON_CONFIRM = int(os.environ.get("MULTIPLE_PERSON_CONFIRMATION_FRAMES", "3"))
DEVICE_CONFIRM = int(os.environ.get("DEVICE_CONFIRMATION_FRAMES", "2"))
CAMERA_CONFIRM = int(os.environ.get("CAMERA_DISABLED_CONFIRMATION_FRAMES", "2"))
LOOKING_AWAY_CONFIRM = int(os.environ.get("GAZE_CONFIRMATION_FRAMES", "5"))
EYES_CLOSED_CONFIRM = int(os.environ.get("EYES_CLOSED_CONFIRMATION_FRAMES", "3"))

NO_FACE_ABSENCE_GRACE_SECONDS = float(os.environ.get("NO_FACE_ABSENCE_GRACE_SECONDS", "3"))

LOOKING_AWAY_WINDOW_SECONDS = float(os.environ.get("LOOKING_AWAY_WINDOW_SECONDS", "6"))
EYES_CLOSED_WINDOW_SECONDS = float(os.environ.get("EYES_CLOSED_WINDOW_SECONDS", "8"))
HEAD_TURNED_WINDOW_SECONDS = float(os.environ.get("HEAD_TURNED_WINDOW_SECONDS", "6"))

_ATTENTION_VIOLATION_SEVERITY = {
    "LOOKING_AWAY": "low",
    "HEAD_TURNED_AWAY": "low",
    "EYES_CLOSED": "medium",
}


class Sustained:
    """Confirms a boolean condition that must persist for a span of time.

    The condition fires once it has been true for `seconds` *and* at least
    `min_samples` consecutive observations agree, so one bad inference is never
    enough but a slow polling client does not stretch the delay.
    """

    def __init__(self, seconds: float, min_samples: int = 1, name: str = ""):
        self.seconds = max(0.0, float(seconds))
        self.min_samples = max(1, int(min_samples))
        self.name = name
        self._since: float | None = None
        self._samples = 0
        self.confirmed = False

    def update(self, active: bool) -> bool:
        now = time.time()
        if active:
            if self._since is None:
                self._since = now
                self._samples = 0
            self._samples += 1
            self.confirmed = (
                self._samples >= self.min_samples and (now - self._since) >= self.seconds
            )
        else:
            self._since = None
            self._samples = 0
            self.confirmed = False
        return self.confirmed

    def reset(self) -> None:
        self._since = None
        self._samples = 0
        self.confirmed = False

    def snapshot(self) -> dict:
        return {
            "name": self.name,
            "active": self._since is not None,
            "samples": self._samples,
            "required_seconds": self.seconds,
            "confirmed": self.confirmed,
        }


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
        self._info_logs: list[dict] = []

        self._multiple_person_frames: deque[bool] = deque(maxlen=MULTIPLE_PERSON_CONFIRM)
        self._device_frames: deque[bool] = deque(maxlen=DEVICE_CONFIRM)
        self._camera_frames: deque[bool] = deque(maxlen=CAMERA_CONFIRM)
        self._looking_away_signal = Sustained(
            GAZE_HOLD_SECONDS, LOOKING_AWAY_CONFIRM, name="looking_away"
        )
        self._head_turned_active = False
        self._eyes_closed_frames: deque[bool] = deque(maxlen=EYES_CLOSED_CONFIRM)

        # Time-based confirmation for the conditions the candidate is warned
        # about mid-assessment.
        self._no_face_signal = Sustained(
            NO_FACE_CONFIRM_SECONDS, NO_FACE_MIN_SAMPLES, name="no_face"
        )
        self._multiple_face_signal = Sustained(
            MULTIPLE_FACE_CONFIRM_SECONDS, MULTIPLE_FACE_MIN_SAMPLES, name="multiple_faces"
        )
        self._identity_signal = Sustained(
            IDENTITY_MISMATCH_CONFIRM_SECONDS, IDENTITY_MISMATCH_MIN_SAMPLES, name="identity_mismatch"
        )

        self._active_events: dict[str, dict] = {}
        self._cycle_count = 0
        self._start_time: float = time.time()
        self._grace_seconds: float = float(os.environ.get("VIOLATION_GRACE_SECONDS", "8"))

        self._face_absent_since: float | None = None
        self._absence_logged = False

        # Identity gate: a live "is the enrolled candidate on camera?" state used
        # to temporarily block the assessment. It reuses the debounce buffers
        # above so it clears the instant the registered face returns.
        self._gate_blocked_since: float | None = None
        self._gate_reason: str | None = None
        self._gate_status: str = "checking"

    def update(self, detection_result: dict) -> dict:
        """Process one monitoring cycle.

        Args:
            detection_result: {
                "face_count": int,
                "face_present": bool,
                "match": bool | None (None if no face or no reference),
                "similarity": float | None,
                "camera_active": bool,
                "quality": str (good/acceptable/poor/unusable),
                "looking_away": bool,
                "head_turned": bool,
                "eyes_closed": bool,
                "prolonged_closure": bool,
                "blink_count": int,
                "head_direction": str,
                "gaze_direction": str,
            }

        Returns: {
            "violations": [...],           # new confirmed violations this cycle
            "violation_count": int,        # total violations
            "should_auto_submit": bool,
            "active_events": {...},        # current tracking state
            "info_logs": [...],            # non-punitive observations
        }
        """
        self._cycle_count += 1
        new_violations = []
        new_info_logs = []

        self._info_logs = self._info_logs[-100:]

        elapsed = time.time() - self._start_time
        if elapsed < self._grace_seconds:
            self._track_face_absence(detection_result, new_violations, new_info_logs, grace=True)
            return {
                "violations": [],
                "violation_count": self._violation_count,
                "should_auto_submit": False,
                "active_events": dict(self._active_events),
                "cycle": self._cycle_count,
                "info_logs": new_info_logs,
                **self._identity_gate(detection_result, grace=True),
            }

        self._track_face_absence(detection_result, new_violations, new_info_logs, grace=False)

        no_face = not detection_result.get("face_present", True)
        if self._no_face_signal.update(no_face):
            v = self._confirm_violation("NO_FACE", {
                "description": "No face detected in camera feed.",
                "confidence": detection_result.get("similarity"),
                "severity": "medium",
                "absence_duration_seconds": round(self._absence_duration(), 2),
            })
            if v:
                new_violations.append(v)

        face_count = detection_result.get("face_count", 0)
        multiple = face_count > 1
        if self._multiple_face_signal.update(multiple):
            v = self._confirm_violation("MULTIPLE_FACES", {
                "description": f"Multiple faces detected ({face_count} people).",
                "face_count": face_count,
                "severity": "high",
            })
            if v:
                new_violations.append(v)

        # Person detection catches extra bodies the face detector may miss when
        # a second person is turned away or partially out of frame.
        person_count = int(detection_result.get("person_count", 0) or 0)
        multiple_persons = person_count > 1
        self._multiple_person_frames.append(multiple_persons)
        if len(self._multiple_person_frames) >= MULTIPLE_PERSON_CONFIRM and all(self._multiple_person_frames):
            v = self._confirm_violation("MULTIPLE_PERSONS", {
                "description": f"Multiple people detected in the camera frame ({person_count}).",
                "person_count": person_count,
                "severity": "high",
            })
            if v:
                new_violations.append(v)

        # Prohibited electronics (phone, laptop, etc.) from YOLO scene detection.
        devices = detection_result.get("devices") or []
        device_detected = bool(detection_result.get("device_detected")) or bool(devices)
        self._device_frames.append(device_detected)
        if len(self._device_frames) >= DEVICE_CONFIRM and all(self._device_frames):
            labels = ", ".join(sorted({d.get("label", "device") for d in devices})) or "electronic device"
            is_phone = any((d.get("label") or "").lower() == "cell phone" for d in devices)
            v = self._confirm_violation(
                "PHONE_DETECTED" if is_phone else "ELECTRONIC_DEVICE",
                {
                    "description": f"Prohibited device detected in camera view: {labels}.",
                    "devices": devices,
                    "severity": "high",
                },
            )
            if v:
                new_violations.append(v)

        match = detection_result.get("match")
        if match is False:
            self._identity_signal.update(True)
            # A visible face can never also be "no face".
            self._no_face_signal.reset()
            if self._identity_signal.confirmed:
                v = self._confirm_violation("IDENTITY_MISMATCH", {
                    "description": "Identity mismatch detected. A different person may be present.",
                    "similarity": detection_result.get("similarity"),
                    "unmatched_faces": detection_result.get("unmatched_faces"),
                    "severity": "high",
                })
                if v:
                    new_violations.append(v)
        else:
            self._identity_signal.update(False)

        camera_active = detection_result.get("camera_active", True)
        if not camera_active:
            self._camera_frames.append(True)
            if len(self._camera_frames) >= CAMERA_CONFIRM and all(self._camera_frames):
                v = self._confirm_violation("CAMERA_DISABLED", {
                    "description": "Camera is disconnected or disabled.",
                    "severity": "high",
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

        new_violations.extend(self._track_attention(detection_result, new_info_logs))

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
            "info_logs": new_info_logs,
            **self._identity_gate(detection_result),
        }

    @staticmethod
    def _deque_full_true(frames) -> bool:
        """True once the buffer is full and every recent sample agreed."""
        return len(frames) == frames.maxlen and frames.maxlen > 0 and all(frames)

    def _reset_identity_signals(self):
        self._no_face_signal.reset()
        self._multiple_face_signal.reset()
        self._identity_signal.reset()

    def _clear_identity_gate(self):
        self._gate_blocked_since = None
        self._gate_reason = None

    def _identity_gate(self, detection_result: dict, grace: bool = False) -> dict:
        """Live gate state deciding whether the candidate may continue.

        Blocking is separate from violation counting/edit: it lasts only while
        the condition persists and lifts automatically as soon as the enrolled
        face returns. Returns flat fields merged into the update() result.
        """
        idle = {
            "identity_blocked": False,
            "identity_status": "checking",
            "identity_block_reason": None,
            "identity_block_seconds": 0.0,
        }
        if grace:
            # Do not accuse a candidate during the warm-up window.
            self._clear_identity_gate()
            self._no_face_signal.reset()
            self._multiple_face_signal.reset()
            self._identity_signal.reset()
            self._gate_status = idle["identity_status"]
            return idle
        if not detection_result.get("enrolled", False):
            # No reference embedding (e.g. proctoring service restarted). There
            # is nothing to verify against, so never lock the candidate out.
            self._clear_identity_gate()
            idle["identity_status"] = "unregistered"
            self._gate_status = "unregistered"
            return idle

        face_count = int(detection_result.get("face_count", 0) or 0)
        face_present = detection_result.get("face_present", True)
        match = detection_result.get("match")

        status = "checking"
        reason = None
        if self._multiple_face_signal.confirmed and face_count > 1:
            status = "multiple_faces"
            reason = (
                f"{face_count} faces are visible on camera. Only the registered "
                "candidate may be in frame."
            )
        elif match is False and self._identity_signal.confirmed:
            status = "mismatch"
            reason = (
                "The face on camera does not match the registered candidate. "
                "The registered candidate must return to continue."
            )
        elif not face_present and self._no_face_signal.confirmed:
            status = "no_face"
            reason = (
                "No face is visible. The registered candidate must be in front "
                "of the camera to continue."
            )
        elif match is True:
            status = "verified"
        elif face_present and match is None:
            # A face is on camera but the embedding could not be produced (too
            # dark, too small, too blurred). This is a coverage gap, not an
            # accusation, so the candidate keeps working and the state says so
            # instead of claiming to be "checking" forever.
            status = "unverified"
            reason = None

        if reason is not None:
            if self._gate_blocked_since is None or self._gate_reason != status:
                self._gate_blocked_since = time.time()
                self._gate_reason = status
            seconds = round(time.time() - self._gate_blocked_since, 1)
        else:
            self._clear_identity_gate()
            seconds = 0.0

        self._gate_status = status

        return {
            "identity_blocked": reason is not None,
            "identity_status": status,
            "identity_block_reason": reason,
            "identity_block_seconds": seconds,
            "identity_signals": {
                "no_face": self._no_face_signal.snapshot(),
                "multiple_faces": self._multiple_face_signal.snapshot(),
                "identity_mismatch": self._identity_signal.snapshot(),
            },
        }

    def _track_attention(self, detection_result: dict, info_logs: list[dict]) -> list[dict]:
        new_violations = []

        looking_away = bool(detection_result.get("looking_away", False))
        looking_away_confirmed = self._looking_away_signal.update(looking_away)
        if looking_away:
            self._active_events["LOOKING_AWAY"] = {
                "type": "LOOKING_AWAY",
                "timestamp": time.time(),
                "gaze_direction": detection_result.get("gaze_direction", "unknown"),
            }
        else:
            self._active_events.pop("LOOKING_AWAY", None)
        if looking_away_confirmed:
            v = self._confirm_violation("LOOKING_AWAY", {
                "description": "Candidate gaze directed away from the screen.",
                "gaze_direction": detection_result.get("gaze_direction", "unknown"),
                "head_direction": detection_result.get("head_direction", "center"),
                "severity": _ATTENTION_VIOLATION_SEVERITY["LOOKING_AWAY"],
            }, window=LOOKING_AWAY_WINDOW_SECONDS)
            if v:
                new_violations.append(v)

        head_turned = bool(detection_result.get("head_turned", False))
        # AttentionAnalyzer already applies the configured duration and frame threshold.
        head_turned_confirmed = head_turned and not self._head_turned_active
        self._head_turned_active = head_turned
        if head_turned:
            self._active_events["HEAD_TURNED_AWAY"] = {
                "type": "HEAD_TURNED_AWAY",
                "timestamp": time.time(),
                "head_direction": detection_result.get("head_direction", "unknown"),
            }
        else:
            self._active_events.pop("HEAD_TURNED_AWAY", None)
        if head_turned_confirmed:
            v = self._confirm_violation("HEAD_TURNED_AWAY", {
                "description": f"Head turned {detection_result.get('head_direction', 'away')} for an extended period.",
                "head_direction": detection_result.get("head_direction", "unknown"),
                "severity": _ATTENTION_VIOLATION_SEVERITY["HEAD_TURNED_AWAY"],
            }, window=HEAD_TURNED_WINDOW_SECONDS)
            if v:
                new_violations.append(v)

        eyes_closed = bool(detection_result.get("eyes_closed", False))
        self._eyes_closed_frames.append(eyes_closed)
        if eyes_closed:
            self._active_events["EYES_CLOSED"] = {
                "type": "EYES_CLOSED",
                "timestamp": time.time(),
                "eyes_closed_duration": detection_result.get("eyes_closed_duration", 0.0),
            }
        else:
            self._active_events.pop("EYES_CLOSED", None)
        if len(self._eyes_closed_frames) >= EYES_CLOSED_CONFIRM and all(self._eyes_closed_frames):
            v = self._confirm_violation("EYES_CLOSED", {
                "description": "Eyes remained closed during the assessment.",
                "eyes_closed_duration": detection_result.get("eyes_closed_duration", 0.0),
                "severity": _ATTENTION_VIOLATION_SEVERITY["EYES_CLOSED"],
            }, window=EYES_CLOSED_WINDOW_SECONDS)
            if v:
                new_violations.append(v)

        blink_count = detection_result.get("blink_count")
        if blink_count is not None:
            self._last_blink_count = blink_count

        return new_violations

    def _track_face_absence(self, detection_result: dict, new_violations: list, info_logs: list, grace: bool):
        """Log face absence beyond a grace period without counting a violation immediately."""
        now = time.time()
        face_present = detection_result.get("face_present", True)

        if face_present:
            if self._face_absent_since is not None:
                absence_duration = now - self._face_absent_since
                info_logs.append({
                    "type": "FACE_RESTORED",
                    "timestamp": now,
                    "message": f"Candidate face returned after {absence_duration:.1f}s.",
                    "absence_duration_seconds": round(absence_duration, 2),
                })
                self._info_logs.append(info_logs[-1])
            self._face_absent_since = None
            self._absence_logged = False
            return

        if self._face_absent_since is None:
            self._face_absent_since = now
            return

        absence_duration = now - self._face_absent_since
        if self._absence_logged or absence_duration < NO_FACE_ABSENCE_GRACE_SECONDS:
            return

        self._absence_logged = True
        entry = {
            "type": "FACE_ABSENCE",
            "timestamp": now,
            "message": f"No face detected for {absence_duration:.1f}s (grace period {NO_FACE_ABSENCE_GRACE_SECONDS:.0f}s exceeded).",
            "absence_duration_seconds": round(absence_duration, 2),
            "grace_exceeded": True,
        }
        info_logs.append(entry)
        self._info_logs.append(entry)

    def _absence_duration(self) -> float:
        if self._face_absent_since is None:
            return 0.0
        return time.time() - self._face_absent_since

    def report_camera_error(self, error_type: str = "CAMERA_ERROR") -> dict:
        v = self._confirm_violation(error_type, {
            "description": "Camera error occurred during assessment.",
            "severity": "high",
        })
        return {
            "violations": [v] if v else [],
            "violation_count": self._violation_count,
            "should_auto_submit": self.auto_submit and self._violation_count >= self.max_violations,
            "info_logs": [],
        }

    def reset_count(self):
        self._violation_count = max(0, self._violation_count - 1)
        self._multiple_person_frames.clear()
        self._device_frames.clear()
        self._camera_frames.clear()
        self._looking_away_signal.reset()
        self._head_turned_active = False
        self._eyes_closed_frames.clear()
        self._active_events.clear()
        self._reset_identity_signals()
        self._clear_identity_gate()

    def _confirm_violation(self, vtype: str, details: dict, window: float = 10.0) -> dict | None:
        now = time.time()
        for existing in self._confirmed_violations:
            if existing["type"] == vtype and (now - existing["timestamp"]) < window:
                return None

        self._violation_count += 1
        violation = {
            "type": vtype,
            "timestamp": now,
            "violation_count": self._violation_count,
            "severity": details.get("severity", "medium"),
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
            "info_logs": list(self._info_logs),
            "active_events": dict(self._active_events),
            "absence_duration_seconds": round(self._absence_duration(), 2),
            "cycles": self._cycle_count,
            "identity_status": self._gate_status,
            "identity_blocked": self._gate_blocked_since is not None,
            "identity_block_reason": self._gate_reason,
            "identity_signals": {
                "no_face": self._no_face_signal.snapshot(),
                "multiple_faces": self._multiple_face_signal.snapshot(),
                "identity_mismatch": self._identity_signal.snapshot(),
            },
        }

    def reset(self):
        self._violation_count = 0
        self._confirmed_violations.clear()
        self._info_logs.clear()
        self._multiple_person_frames.clear()
        self._device_frames.clear()
        self._camera_frames.clear()
        self._looking_away_signal.reset()
        self._head_turned_active = False
        self._eyes_closed_frames.clear()
        self._reset_identity_signals()
        self._active_events.clear()
        self._cycle_count = 0
        self._start_time = time.time()
        self._face_absent_since = None
        self._absence_logged = False
        self._clear_identity_gate()