"""Lightweight liveness (anti-spoofing) heuristic.

Face-embedding matching answers "is this the enrolled person?" but not "is a
live person present?". A printed photo or an image on a screen matches just as
well. Over a rolling time window a live candidate blinks and micro-moves; a
static spoof held to the camera does neither.

This is deliberately a *review signal*, not a verdict. It never counts a
violation on its own - it only raises ``spoof_suspected`` so an operator or a
stronger model can look. A real anti-spoofing model should eventually replace
this, but this catches the most naive replay attacks in the meantime.
"""

import os
import time

_LIVENESS_ENABLED = os.environ.get("LIVENESS_ENABLED", "true").lower() == "true"
_WINDOW_SECONDS = float(os.environ.get("LIVENESS_WINDOW_SECONDS", "20"))
_MIN_BLINKS = int(os.environ.get("LIVENESS_MIN_BLINKS", "1"))
_MIN_MOTION = float(os.environ.get("LIVENESS_MIN_MOTION", "0.012"))


class LivenessChecker:
    """Accumulates blink and micro-motion evidence over a rolling window."""

    def __init__(
        self,
        window_seconds: float = _WINDOW_SECONDS,
        min_blinks: int = _MIN_BLINKS,
        min_motion: float = _MIN_MOTION,
        enabled: bool = _LIVENESS_ENABLED,
    ):
        self.enabled = enabled
        self.window_seconds = max(1.0, float(window_seconds))
        self.min_blinks = max(0, int(min_blinks))
        self.min_motion = max(0.0, float(min_motion))
        self._window_start = time.time()
        self._blinks_at_start: int | None = None
        self._prev_center: tuple[float, float] | None = None
        self._motion = 0.0
        self._samples = 0
        self._alive: bool | None = None
        self._spoof_suspected = False
        self._last_reason = "warming_up"
        # Values measured over the most recently completed window, reported even
        # though the live accumulators are reset when a window closes.
        self._last_blinks = 0
        self._last_motion = 0.0

    def update(self, face_present: bool, blink_count: int | None = None, points=None) -> dict:
        """Feed one monitoring cycle and return the current liveness state."""
        if not self.enabled:
            return {"enabled": False, "alive": None, "spoof_suspected": False, "reason": "disabled"}

        now = time.time()

        if face_present:
            if self._blinks_at_start is None and blink_count is not None:
                self._blinks_at_start = int(blink_count)
            self._accumulate_motion(points)
        else:
            # No face: nothing to judge, and a re-appearing face starts fresh.
            self._prev_center = None

        elapsed = now - self._window_start
        if elapsed >= self.window_seconds:
            self._evaluate(blink_count, face_present, now)

        live_blinks = self._blink_delta(blink_count)
        return {
            "enabled": True,
            "alive": self._alive,
            "spoof_suspected": self._spoof_suspected,
            # Report the completed window's numbers when there is one, otherwise
            # the in-progress accumulation.
            "blinks": self._last_blinks if self._alive is not None else live_blinks,
            "motion": round(self._last_motion if self._alive is not None else self._motion, 4),
            "window_seconds": self.window_seconds,
            "reason": self._last_reason,
        }

    def _accumulate_motion(self, points) -> None:
        if not points:
            return
        try:
            xs = [float(p[0]) for p in points]
            ys = [float(p[1]) for p in points]
        except (TypeError, IndexError, ValueError):
            return
        center = (sum(xs) / len(xs), sum(ys) / len(ys))
        if self._prev_center is not None:
            dx = center[0] - self._prev_center[0]
            dy = center[1] - self._prev_center[1]
            # Normalise by the landmark spread so the measure is resolution and
            # distance independent.
            scale = max(1.0, (max(xs) - min(xs)) + (max(ys) - min(ys)))
            self._motion += ((dx * dx + dy * dy) ** 0.5) / scale
            self._samples += 1
        self._prev_center = center

    def _blink_delta(self, blink_count: int | None) -> int | None:
        if blink_count is None or self._blinks_at_start is None:
            return None
        return max(0, int(blink_count) - self._blinks_at_start)

    def _evaluate(self, blink_count: int | None, face_present: bool, now: float) -> None:
        blinks = self._blink_delta(blink_count) or 0
        self._last_blinks = blinks
        self._last_motion = self._motion
        blinks_ok = blinks >= self.min_blinks
        motion_ok = self._motion >= self.min_motion
        if not face_present:
            self._alive = None
            self._spoof_suspected = False
            self._last_reason = "no_face"
        elif blinks_ok or motion_ok:
            self._alive = True
            self._spoof_suspected = False
            self._last_reason = "blink" if blinks_ok else "motion"
        else:
            self._alive = False
            self._spoof_suspected = True
            self._last_reason = "no_blink_or_motion"
        # Start a new window.
        self._window_start = now
        self._blinks_at_start = int(blink_count) if blink_count is not None else None
        self._motion = 0.0
        self._samples = 0
        self._prev_center = None

    def reset(self) -> None:
        self._window_start = time.time()
        self._blinks_at_start = None
        self._prev_center = None
        self._motion = 0.0
        self._samples = 0
        self._alive = None
        self._spoof_suspected = False
        self._last_reason = "warming_up"
        self._last_blinks = 0
        self._last_motion = 0.0
