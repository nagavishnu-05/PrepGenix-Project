"""Gaze estimation using facial landmarks and iris offsets.

Estimates horizontal/vertical gaze ratio (normalized 0..1) and classifies
whether the student is looking toward the screen or away. Falls back to a
neutral estimate if iris landmarks are unavailable.
"""

from dataclasses import dataclass
from typing import Literal

import numpy as np

from ..utils.config import (
    GAZE_ENABLED,
    GAZE_HEAD_YAW_COMPENSATION,
    GAZE_HORIZONTAL_ANGLE_DEG,
    GAZE_HORIZONTAL_THRESHOLD,
    GAZE_IGNORE_YAW_ABOVE,
    GAZE_ROLL_COMPENSATION,
    GAZE_ROLL_COMPENSATION_THRESHOLD,
    GAZE_VERTICAL_THRESHOLD,
)

from .landmark_detector import EYE_SIDES, resolve_irises

Direction2D = Literal["center", "left", "right", "up", "down", "mixed"]


@dataclass
class GazeEstimate:
    horizontal: float
    vertical: float
    looking_towards_screen: bool
    direction: Direction2D
    confidence: float


class GazeEstimator:
    """Iris-based gaze estimator.

    The iris centre is expressed as a normalised offset inside the eye
    aperture (0 = one corner, 1 = the other) on both axes, then recentred on
    0.5. Iris/eye pairing is resolved geometrically so a mirrored or
    mismapped landmark set cannot flip the reported gaze direction.

    Offsets are converted to a head-relative gaze angle so the result stays
    meaningful when the head is tilted, and horizontal gaze is compensated for
    head yaw so a turned head does not automatically read as looking away.
    """

    def __init__(self, enabled: bool | None = None):
        self.enabled = GAZE_ENABLED if enabled is None else enabled

    def estimate(self, landmarks: list[list[float]], head_pose=None) -> GazeEstimate | None:
        if not self.enabled or not landmarks:
            return None

        irises = resolve_irises(landmarks)
        if irises is None:
            return None
        iris_left, iris_right = irises

        try:
            sides = (
                (EYE_SIDES["left"], iris_left),
                (EYE_SIDES["right"], iris_right),
            )
            h_offsets, v_offsets = [], []
            for spec, iris in sides:
                outer = landmarks[spec["outer"]]
                inner = landmarks[spec["inner"]]
                width = inner[0] - outer[0]
                if abs(width) < 1e-6:
                    continue
                h_offsets.append((iris[0] - outer[0]) / width)

                # Vertical scale must come from the eyelid aperture, not from
                # the outer/inner corner y-delta. The corners sit at nearly the
                # same height, so using their delta as the denominator blows up
                # the normalised offset and saturates vertical gaze.
                ring = [landmarks[i][1] for i in spec["ring"]]
                aperture = max(ring) - min(ring)
                if aperture > 1e-6:
                    center_y = (max(ring) + min(ring)) / 2.0
                    v_offsets.append(2.0 * (iris[1] - center_y) / aperture)
                else:
                    v_offsets.append(0.0)
        except (IndexError, TypeError, ZeroDivisionError):
            return None

        if not h_offsets:
            return None

        h = float(np.mean(h_offsets))
        h_centered = (h - 0.5) * 2.0
        v_centered = float(np.clip(np.mean(v_offsets), -1.0, 1.0))

        yaw = float(getattr(head_pose, "yaw", 0.0)) if head_pose is not None else 0.0
        roll = float(getattr(head_pose, "roll", 0.0)) if head_pose is not None else 0.0

        h_angle = h_centered * GAZE_HORIZONTAL_ANGLE_DEG
        if abs(yaw) > GAZE_IGNORE_YAW_ABOVE:
            h_angle -= yaw * GAZE_HEAD_YAW_COMPENSATION
        if abs(roll) > GAZE_ROLL_COMPENSATION_THRESHOLD:
            v_centered += (roll / 90.0) * GAZE_ROLL_COMPENSATION

        h_centered = float(np.clip(h_angle / GAZE_HORIZONTAL_ANGLE_DEG, -1.0, 1.0))
        v_centered = float(np.clip(v_centered, -1.0, 1.0))

        h_thresh = GAZE_HORIZONTAL_THRESHOLD
        v_thresh = GAZE_VERTICAL_THRESHOLD

        direction: Direction2D = "center"
        if h_centered < -h_thresh * 1.5:
            direction = "left"
        elif h_centered > h_thresh * 1.5:
            direction = "right"
        elif v_centered > v_thresh * 1.5:
            direction = "up"
        elif v_centered < -v_thresh * 1.5:
            direction = "down"
        elif abs(h_centered) > h_thresh * 0.7 or abs(v_centered) > v_thresh * 0.6:
            direction = "mixed"

        looking_away = abs(h_centered) > h_thresh or abs(v_centered) > v_thresh

        return GazeEstimate(
            horizontal=round(h_centered, 3),
            vertical=round(v_centered, 3),
            looking_towards_screen=not looking_away,
            direction=direction,
            confidence=0.9,
        )
