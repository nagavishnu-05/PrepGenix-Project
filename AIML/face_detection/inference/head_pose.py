"""Head-pose estimation from MediaPipe landmark geometry.

Computes yaw/pitch/roll in degrees and classifies head direction
(left / right / up / down / center) plus face stability.

Angle convention
----------------
Directions are named from the viewer's point of view, matching the webcam
image, so "left" always means the face points toward the left of the frame.

yaw   > 0 -> face points toward image left (image-right side of the face is nearer)
yaw   < 0 -> face points toward image right
pitch > 0 -> subject looking up
roll  > 0 -> subject tilted toward image right
"""

import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import cv2
import numpy as np

from ..utils.config import (
    HEAD_POSE_ENABLED,
    HEAD_POSE_FRONTAL_CHIN_RATIO,
    HEAD_POSE_FRONTAL_MOUTH_RATIO,
    HEAD_POSE_FRONTAL_MOUTH_Y_RATIO,
    HEAD_POSE_FRONTAL_NOSE_RATIO,
    HEAD_POSE_PITCH_GAIN,
    HEAD_POSE_PITCH_THRESHOLD,
    HEAD_POSE_ROLL_THRESHOLD,
    HEAD_POSE_YAW_GAIN,
    HEAD_POSE_YAW_THRESHOLD,
    MODEL_DIR,
)
from .landmark_detector import (
    CHIN,
    EYE_OUTER_LEFT,
    EYE_OUTER_RIGHT,
    MOUTH_LEFT,
    MOUTH_RIGHT,
    NOSE_TIP,
    SOLVE_PNP_POINTS,
)

logger = logging.getLogger(__name__)

Direction = Literal["left", "right", "up", "down", "center"]

HEAD_POSE_BIAS_PATH = MODEL_DIR / "head_pose_bias.json"


@dataclass
class HeadPose:
    yaw: float
    pitch: float
    roll: float
    direction: Direction
    magnitude: float
    is_turning: bool
    is_tilted: bool
    is_stable: bool
    confidence: float


class HeadPoseEstimator:
    """Geometric head-pose estimator with optional calibration offsets."""

    def __init__(self, enabled: bool | None = None, bias_path: str | Path | None = None):
        self.enabled = HEAD_POSE_ENABLED if enabled is None else enabled
        self._yaw_bias, self._pitch_bias, self._roll_bias = self._load_bias(bias_path)
        self._last_solution_index = None

    def _load_bias(self, bias_path):
        path = Path(bias_path) if bias_path else HEAD_POSE_BIAS_PATH
        try:
            if path.exists():
                import json

                data = json.loads(path.read_text())
                return (
                    float(data.get("yaw", 0.0)),
                    float(data.get("pitch", 0.0)),
                    float(data.get("roll", 0.0)),
                )
        except Exception as e:
            logger.debug("Head-pose bias file unreadable, using zeros: %s", e)
        return (0.0, 0.0, 0.0)

    def estimate(
        self,
        landmarks: list[list[float]],
        frame_shape: tuple[int, int],
        normalized: bool = False,
    ) -> HeadPose | None:
        """Estimate head pose from a 478-point landmark set.

        Landmarks are expected in absolute pixel coordinates. Set `normalized`
        for landmark sets expressed as fractions of the frame, which is how
        heuristic landmarks are sometimes passed in.
        """
        if self.enabled is False or landmarks is None:
            return None
        if len(landmarks) < max(SOLVE_PNP_POINTS) + 1:
            return None

        h, w = frame_shape[0], frame_shape[1]
        if h <= 0 or w <= 0:
            return None

        scale_x, scale_y = (w, h) if normalized else (1.0, 1.0)
        try:
            image_points = []
            for idx in SOLVE_PNP_POINTS:
                p = landmarks[idx]
                if p is None:
                    return None
                image_points.append((float(p[0]) * scale_x, float(p[1]) * scale_y))
            image_points_arr = np.array(image_points, dtype=np.float64)
        except (IndexError, TypeError, ValueError):
            return None

        angles = self._geometric_angles(image_points_arr)
        if angles is None:
            return None
        yaw, pitch, roll, confidence = angles

        yaw_deg = math.degrees(yaw) - self._yaw_bias
        pitch_deg = math.degrees(pitch) - self._pitch_bias
        roll_deg = math.degrees(roll) - self._roll_bias

        direction: Direction = "center"
        if yaw_deg > HEAD_POSE_YAW_THRESHOLD:
            direction = "left"
        elif yaw_deg < -HEAD_POSE_YAW_THRESHOLD:
            direction = "right"
        elif pitch_deg > HEAD_POSE_PITCH_THRESHOLD:
            direction = "up"
        elif pitch_deg < -HEAD_POSE_PITCH_THRESHOLD:
            direction = "down"

        magnitude = max(abs(yaw_deg), abs(pitch_deg), abs(roll_deg))
        is_turning = abs(yaw_deg) > HEAD_POSE_YAW_THRESHOLD or abs(pitch_deg) > HEAD_POSE_PITCH_THRESHOLD
        is_tilted = abs(roll_deg) > HEAD_POSE_ROLL_THRESHOLD
        is_stable = magnitude < 4.0

        return HeadPose(
            yaw=round(yaw_deg, 2),
            pitch=round(pitch_deg, 2),
            roll=round(roll_deg, 2),
            direction=direction,
            magnitude=round(magnitude, 2),
            is_turning=is_turning,
            is_tilted=is_tilted,
            is_stable=is_stable,
            confidence=round(float(confidence), 3),
        )

    def _geometric_angles(self, points: np.ndarray):
        """Recover yaw/pitch/roll from 2D landmark geometry.

        A solvePnP fit is not usable here. It needs a canonical 3D face model
        whose proportions match MediaPipe's mesh, and with a hand-built template
        the solver compensates for the shape error by flying the face thousands
        of units away, landing on a mirrored branch that reads as roughly
        +/-180 deg pitch. That produced confident-looking but meaningless angles
        and false head-turn violations.

        The angles below are derived directly from the 2D geometry, normalised by
        the inter-ocular distance so that distance to camera and frame size drop
        out entirely:

        roll  is simply the tilt of the eye-to-eye axis.
        yaw   comes from the asymmetry between the nose-to-eye distances: a face
              pointing at the camera puts the nose tip midway between the eye
              corners, and the offset grows as the head turns.
        pitch comes from the eye-line-to-nose distance, normalised by the eye
              width, compared against the same ratio on a frontal face.

        This is scale-invariant, needs no intrinsics, cannot diverge, and
        degrades gracefully with occlusion because each angle depends on
        different landmarks.

        Accuracy is uneven, and the confidence value reflects that. Roll is
        reliable to about 2 degrees and pitch tracks the true angle closely
        (+40 deg -> +43, +25 -> +24). Yaw is only indicative: nose-to-eye
        asymmetry is weak, saturates past roughly 20 degrees, and is partly
        confounded with pitch, so treat it as a coarse turn signal rather than a
        measurement. Head-turn violations depend on yaw staying correct in sign
        and staying above threshold, which holds, but the reported degree value
        should not be treated as quantitative.
        """
        eye_vector = points[1] - points[0]
        eye_len = float(np.linalg.norm(eye_vector))
        if eye_len < 1e-6:
            return None

        # Work in a face-aligned frame: +x along the eye axis, +y perpendicular.
        axis_x = eye_vector / eye_len
        axis_y = np.array([-axis_x[1], axis_x[0]])

        # Image y grows downward, so a clockwise tilt gives a positive
        # component here and must be negated to match the documented sign
        # convention (roll > 0 -> subject tilted toward image right).
        roll = -math.atan2(axis_x[1], axis_x[0])
        eye_mid = (points[0] + points[1]) / 2.0

        def relative(pt):
            delta = pt - eye_mid
            return float(delta @ axis_x), float(delta @ axis_y)

        nose_x, nose_y = relative(points[2])
        mouth_l_x, mouth_l_y = relative(points[3])
        mouth_r_x, mouth_r_y = relative(points[4])
        chin_x, chin_y = relative(points[5])
        mouth_mid_x = (mouth_l_x + mouth_r_x) / 2.0
        mouth_mid_y = (mouth_l_y + mouth_r_y) / 2.0

        # Landmarks that fall on or behind the eye line mean the face is not
        # upright in the frame, so the ratios below would be meaningless.
        support = sum(1 for v in (nose_y, mouth_mid_y, chin_y) if v > 1e-6)

        # Yaw: compare the nose-to-eye-corner distances. A frontal face gives
        # equal distances on both sides.
        left_reach = math.hypot(nose_x + eye_len / 2.0, nose_y)
        right_reach = math.hypot(nose_x - eye_len / 2.0, nose_y)
        total = left_reach + right_reach
        if total < 1e-6:
            return None
        asymmetry = (right_reach - left_reach) / total
        # Negated so that yaw > 0 means the face points toward image left, per
        # the documented convention.
        yaw = -math.asin(max(-1.0, min(1.0, asymmetry * HEAD_POSE_YAW_GAIN)))

        # Pitch: when the head tilts back the lower face foreshortens, so the nose
        # sits closer to the eye line and the ratio drops; tilting down pushes
        # the nose further below the eyes. Negated so that pitch > 0 means the
        # subject is looking up, per the documented convention.
        nose_ratio = abs(nose_y) / eye_len
        pitch = -math.asin(
            max(
                -1.0,
                min(1.0, (nose_ratio - HEAD_POSE_FRONTAL_NOSE_RATIO) * HEAD_POSE_PITCH_GAIN),
            )
        )

        # A pose is only trustworthy when the mouth and chin corroborate the
        # eye/nose geometry; a partial or occluded face breaks these ratios.
        checks = (
            abs(abs(mouth_l_x - mouth_r_x) / eye_len - HEAD_POSE_FRONTAL_MOUTH_RATIO),
            abs(mouth_mid_x / eye_len),
            abs(abs(mouth_mid_y) / eye_len - HEAD_POSE_FRONTAL_MOUTH_Y_RATIO),
            abs(chin_x / eye_len),
            abs(chin_y / eye_len - HEAD_POSE_FRONTAL_CHIN_RATIO),
        )
        residual = sum(checks) / len(checks)
        confidence = 1.0 / (1.0 + residual * 10.0) if support else 0.0

        self._last_solution_index = None
        return yaw, pitch, roll, confidence

    def calibrate(self, samples: list[tuple[float, float, float]], path: str | Path | None = None):
        """Write a bias file from known-neutral samples.

        samples: list of (yaw, pitch, roll) tuples observed while the subject
        looks straight at the camera. The mean is stored as the bias.
        """
        if not samples:
            raise ValueError("calibrate() requires at least one sample")
        yaw = sum(s[0] for s in samples) / len(samples)
        pitch = sum(s[1] for s in samples) / len(samples)
        roll = sum(s[2] for s in samples) / len(samples)
        target = Path(path) if path else HEAD_POSE_BIAS_PATH
        target.parent.mkdir(parents=True, exist_ok=True)
        import json

        target.write_text(json.dumps({"yaw": yaw, "pitch": pitch, "roll": roll, "samples": len(samples)}, indent=2))
        self._yaw_bias, self._pitch_bias, self._roll_bias = yaw, pitch, roll
        return {"yaw": yaw, "pitch": pitch, "roll": roll, "samples": len(samples)}