"""Attention analyzer combining landmarks, pose, gaze and blink.

Produces a consolidated attention state + metrics to drive proctoring
decisions (looking away, head turned, prolonged eye closure, etc.).
"""

import time
from collections import deque
from dataclasses import dataclass
from typing import Literal

import numpy as np

from ..utils.config import (
    ATTENTION_ANALYZER_ENABLED,
    ATTENTION_LANDMARKS_IN_RESPONSE,
    ATTENTION_METRICS_IN_RESPONSE,
    ATTENTION_OVERLAY_LANDMARK_COUNT,
    EYES_CLOSED_CONFIRMATION_FRAMES,
    GAZE_CONFIRMATION_FRAMES,
    GAZE_HOLD_SECONDS,
    HEAD_TURNED_CONFIRMATION_FRAMES,
    HEAD_TURNED_HOLD_SECONDS,
)

AttentionState = Literal["focused", "distracted", "uncertain", "absent"]


@dataclass
class AttentionMetrics:
    attention_state: AttentionState
    looking_towards_screen: bool
    head_direction: str
    gaze_direction: str
    face_stability: bool
    eyes_closed: bool
    eyes_closed_duration: float
    prolonged_closure: bool
    blink_count: int
    blink_rate_per_minute: float
    face_count: int
    quality: str
    confidence: float
    yaw: float
    pitch: float
    roll: float
    gaze_horizontal: float
    gaze_vertical: float
    looking_away: bool
    head_turned: bool
    landmarks_available: bool
    overlay_landmarks: list[list[float]] | None
    landmark_count: int


class AttentionAnalyzer:
    """Multi-signal attention tracking."""

    def __init__(self, enabled: bool | None = None):
        self.enabled = ATTENTION_ANALYZER_ENABLED if enabled is None else enabled
        self._gaze_away_frames: deque[bool] = deque(maxlen=GAZE_CONFIRMATION_FRAMES)
        self._head_turned_frames: deque[bool] = deque(maxlen=HEAD_TURNED_CONFIRMATION_FRAMES)
        self._eyes_closed_frames: deque[bool] = deque(maxlen=EYES_CLOSED_CONFIRMATION_FRAMES)
        self._last_update = time.time()
        # Wall-clock start of the current continuous run for each condition.
        # Reset the moment the condition clears, so confirmation needs BOTH a
        # full run of consecutive frames AND a minimum sustained duration.
        self._gaze_away_since: float | None = None
        self._head_turned_since: float | None = None

    def analyze(
        self,
        landmarks_result: dict,
        head_pose,
        gaze_est,
        blink_metrics,
        face_count: int = 0,
        quality: str = "good",
    ) -> AttentionMetrics:
        now = time.time()
        self._last_update = now

        faces = landmarks_result.get("faces") if landmarks_result else []
        landmarks = faces[0]["landmarks"] if faces else None
        has_landmarks = bool(landmarks) and len(landmarks) > 0
        landmark_count = len(landmarks) if has_landmarks else 0
        overlay = None
        if ATTENTION_LANDMARKS_IN_RESPONSE and has_landmarks:
            limit = min(ATTENTION_OVERLAY_LANDMARK_COUNT, len(landmarks))
            overlay = [list(p) for p in landmarks[:limit]]

        looking_away_flag = False
        head_turned_flag = False
        eyes_closed_flag = blink_metrics.eyes_closed if blink_metrics else False
        gaze_dir = "center"
        head_dir = "center"

        if gaze_est:
            looking_away_flag = not gaze_est.looking_towards_screen
            gaze_dir = gaze_est.direction

        if head_pose:
            head_dir = head_pose.direction
            head_turned_flag = head_pose.is_turning

        self._gaze_away_frames.append(looking_away_flag)
        self._head_turned_frames.append(head_turned_flag)
        self._eyes_closed_frames.append(eyes_closed_flag)

        if looking_away_flag:
            if self._gaze_away_since is None:
                self._gaze_away_since = now
        else:
            self._gaze_away_since = None

        if head_turned_flag:
            if self._head_turned_since is None:
                self._head_turned_since = now
        else:
            self._head_turned_since = None

        # A single frame (or a glance shorter than the hold window) never
        # confirms: the run must fill the buffer AND have lasted long enough.
        gaze_held = self._gaze_away_since is not None and (now - self._gaze_away_since) >= GAZE_HOLD_SECONDS
        head_held = self._head_turned_since is not None and (now - self._head_turned_since) >= HEAD_TURNED_HOLD_SECONDS
        gaze_confirmed = (
            len(self._gaze_away_frames) >= GAZE_CONFIRMATION_FRAMES
            and all(self._gaze_away_frames)
            and gaze_held
        )
        head_confirmed = (
            len(self._head_turned_frames) >= HEAD_TURNED_CONFIRMATION_FRAMES
            and all(self._head_turned_frames)
            and head_held
        )
        eyes_closed_confirmed = len(self._eyes_closed_frames) >= EYES_CLOSED_CONFIRMATION_FRAMES and all(self._eyes_closed_frames)

        attention_state: AttentionState = "focused"
        if face_count == 0:
            attention_state = "absent"
        elif gaze_confirmed or head_confirmed or eyes_closed_confirmed:
            attention_state = "distracted"
        elif not has_landmarks:
            attention_state = "uncertain"
        else:
            attention_state = "focused"

        confidence = 0.85
        if face_count > 1:
            confidence = 0.95
        elif face_count == 0:
            confidence = 0.98

        return AttentionMetrics(
            attention_state=attention_state,
            looking_towards_screen=not (gaze_confirmed or looking_away_flag),
            head_direction=head_dir,
            gaze_direction=gaze_dir,
            face_stability=head_pose.is_stable if head_pose else False,
            eyes_closed=eyes_closed_confirmed or eyes_closed_flag,
            eyes_closed_duration=blink_metrics.eyes_closed_duration if blink_metrics else 0.0,
            prolonged_closure=blink_metrics.prolonged_closure if blink_metrics else False,
            blink_count=blink_metrics.blink_count if blink_metrics else 0,
            blink_rate_per_minute=blink_metrics.blink_rate_per_minute if blink_metrics else 0.0,
            face_count=face_count,
            quality=quality,
            confidence=confidence,
            yaw=head_pose.yaw if head_pose else 0.0,
            pitch=head_pose.pitch if head_pose else 0.0,
            roll=head_pose.roll if head_pose else 0.0,
            gaze_horizontal=gaze_est.horizontal if gaze_est else 0.0,
            gaze_vertical=gaze_est.vertical if gaze_est else 0.0,
            looking_away=gaze_confirmed,
            head_turned=head_confirmed,
            landmarks_available=has_landmarks,
            overlay_landmarks=overlay if ATTENTION_METRICS_IN_RESPONSE or ATTENTION_LANDMARKS_IN_RESPONSE else None,
            landmark_count=landmark_count,
        )

    def reset(self):
        self._gaze_away_frames.clear()
        self._head_turned_frames.clear()
        self._eyes_closed_frames.clear()
        self._gaze_away_since = None
        self._head_turned_since = None
        self._last_update = time.time()
