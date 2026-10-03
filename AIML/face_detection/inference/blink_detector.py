"""Eye-blink detection using Eye Aspect Ratio (EAR).

EAR is computed from eye landmarks; blinks are detected on closure/opening
transitions. Also detects prolonged eye closure (eyes closed for > threshold).
"""

from collections import deque
from dataclasses import dataclass

import numpy as np

from ..utils.config import (
    BLINK_ENABLED,
    BLINK_EAR_CLOSED_THRESHOLD,
    BLINK_EAR_OPEN_THRESHOLD,
    BLINK_EYES_CLOSED_SECONDS,
    BLINK_MIN_CLOSURE_FRAMES,
    BLINK_NORMAL_MAX_SECONDS,
    BLINK_NORMAL_MIN_SECONDS,
    BLINK_RATE_MAX_PER_MINUTE,
    BLINK_RATE_WINDOW_SECONDS,
)
from .landmark_detector import EYE_SIX_LEFT, EYE_SIX_RIGHT


@dataclass
class BlinkEvent:
    timestamp: float
    duration: float | None
    type: str  # blink | prolonged_closure


@dataclass
class BlinkMetrics:
    blink_count: int
    blink_rate_per_minute: float
    last_blink_time: float | None
    eyes_closed: bool
    eyes_closed_duration: float
    prolonged_closure: bool
    events: list[BlinkEvent]


class BlinkDetector:
    """EAR-based blink detector."""

    def __init__(self, enabled: bool | None = None):
        self.enabled = BLINK_ENABLED if enabled is None else enabled
        self._ear_window: deque[float] = deque(maxlen=8)
        self._blink_count = 0
        self._blink_times: deque[float] = deque(maxlen=int(BLINK_RATE_WINDOW_SECONDS * 30))
        self._last_blink_time: float | None = None
        self._eyes_closed_start: float | None = None
        self._eyes_closed = False
        self._events: list[BlinkEvent] = []

    def _ear(self, landmarks: list[list[float]], eye_indices: list[int]) -> float:
        if len(landmarks) < max(eye_indices) + 1:
            return float("nan")
        try:
            points = [np.asarray(landmarks[idx], dtype=np.float64)[:2] for idx in eye_indices]
        except (IndexError, TypeError, ValueError):
            return float("nan")
        vert1 = np.linalg.norm(points[1] - points[5])
        vert2 = np.linalg.norm(points[2] - points[4])
        horiz = np.linalg.norm(points[0] - points[3])
        if horiz < 1e-6:
            return float("nan")
        return float((vert1 + vert2) / (2.0 * horiz))

    def update(self, landmarks: list[list[float]], timestamp: float) -> BlinkMetrics:
        if not self.enabled or not landmarks:
            return BlinkMetrics(
                blink_count=self._blink_count,
                blink_rate_per_minute=self._rate_per_min(),
                last_blink_time=self._last_blink_time,
                eyes_closed=False,
                eyes_closed_duration=0.0,
                prolonged_closure=False,
                events=list(self._events)[-20:],
            )

        ear_l = self._ear(landmarks, EYE_SIX_LEFT)
        ear_r = self._ear(landmarks, EYE_SIX_RIGHT)
        ears = [e for e in (ear_l, ear_r) if not np.isnan(e)]
        if not ears:
            ear_avg = self._ear_window[-1] if self._ear_window else 0.2
        else:
            ear_avg = float(np.mean(ears))

        self._ear_window.append(ear_avg)

        eyes_closed_now = ear_avg < BLINK_EAR_CLOSED_THRESHOLD
        eyes_closed_duration = 0.0
        prolonged_closure = False

        if eyes_closed_now and not self._eyes_closed:
            self._eyes_closed_start = timestamp
            self._eyes_closed = True
        elif not eyes_closed_now and self._eyes_closed and self._eyes_closed_start is not None:
            duration = timestamp - self._eyes_closed_start
            self._eyes_closed_start = None
            self._eyes_closed = False
            if duration >= BLINK_NORMAL_MIN_SECONDS and duration <= BLINK_NORMAL_MAX_SECONDS:
                self._blink_count += 1
                self._last_blink_time = timestamp
                self._blink_times.append(timestamp)
                self._events.append(BlinkEvent(timestamp=timestamp, duration=duration, type="blink"))
            else:
                self._events.append(BlinkEvent(timestamp=timestamp, duration=duration, type="prolonged_closure"))
        elif eyes_closed_now and self._eyes_closed and self._eyes_closed_start is not None:
            eyes_closed_duration = timestamp - self._eyes_closed_start
            if eyes_closed_duration > BLINK_EYES_CLOSED_SECONDS:
                prolonged_closure = True

        return BlinkMetrics(
            blink_count=self._blink_count,
            blink_rate_per_minute=self._rate_per_min(),
            last_blink_time=self._last_blink_time,
            eyes_closed=self._eyes_closed,
            eyes_closed_duration=round(eyes_closed_duration, 3),
            prolonged_closure=prolonged_closure,
            events=list(self._events)[-20:],
        )

    def _rate_per_min(self) -> float:
        if not self._blink_times:
            return 0.0
        now = self._blink_times[-1]
        window = now - (self._blink_times[0] if self._blink_times else now)
        if window <= 0:
            return float(len(self._blink_times))
        return round(float(len(self._blink_times)) * 60.0 / window, 2)

    def reset(self):
        self._ear_window.clear()
        self._blink_times.clear()
        self._blink_count = 0
        self._last_blink_time = None
        self._eyes_closed_start = None
        self._eyes_closed = False
        self._events.clear()
