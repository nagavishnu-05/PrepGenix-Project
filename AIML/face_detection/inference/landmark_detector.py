"""Facial landmark detection (MediaPipe Face Landmarker).

Backends (tried in order):
  1. MediaPipe Face Landmarker - 478 landmarks including refined iris rings.
     A YuNet detector supplies the face list (the landmarker's own detection
     stage reliably returns only one face per frame), then the landmarker
     refines each face individually inside a padded crop. This is what makes
     multiple-face detection reliable.
  2. Heuristic landmark projection - derives an equivalent landmark set from a
     face bounding box using anthropometric proportions, so blink / gaze /
     head-pose analytics keep working when the MediaPipe model is unavailable.

Landmark indices follow the MediaPipe Face Mesh topology so downstream
consumers can rely on stable semantic groups (eyes, irises, nose, mouth, chin).
"""

import logging
import math
import os
from pathlib import Path

import cv2
import numpy as np

from ..utils.config import (
    LANDMARK_CROP_PADDING,
    LANDMARK_DETECTOR_ENABLED,
    MEDIAPIPE_ENABLED,
    MEDIAPIPE_LANDMARKS_ENABLED,
    MEDIAPIPE_MAX_FACES,
    MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
    MEDIAPIPE_MIN_TRACKING_CONFIDENCE,
    MEDIAPIPE_MODEL_PATH,
    YUNET_ENABLED,
    YUNET_MIN_SIZE_PX,
    YUNET_MODEL_PATH,
    YUNET_NMS_THRESHOLD,
    YUNET_SCORE_THRESHOLD,
)

logger = logging.getLogger(__name__)

MEDIAPIPE_LANDMARK_COUNT = 478

NOSE_TIP = 1
CHIN = 152
FOREHEAD = 10
MOUTH_TOP = 13
MOUTH_BOTTOM = 14

# Eye corner indices are named by their side in the image, not the subject's
# anatomy. MediaPipe's subject-relative naming ("left" == image right) is a
# frequent source of sign errors when mapping to a 3D model.
EYE_OUTER_LEFT = 33
EYE_INNER_LEFT = 133
EYE_OUTER_RIGHT = 263
EYE_INNER_RIGHT = 362

MOUTH_LEFT = 61
MOUTH_RIGHT = 291

IRIS_A_CENTER = 468
IRIS_A = list(range(468, 473))
IRIS_B_CENTER = 473
IRIS_B = list(range(473, 478))

EYE_SIX_LEFT = [33, 160, 158, 133, 153, 144]
EYE_SIX_RIGHT = [362, 385, 387, 263, 373, 380]

EYE_RING_LEFT = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
EYE_RING_RIGHT = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]

NOSE_BRIDGE = [168, 6, 197, 195, 5, 4]
NOSE_CONTOUR = [98, 97, 2, 326, 327, 294]

MOUTH_CORNERS = [61, 291]
MOUTH_LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]

JAWLINE = [
    172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397,
    288, 361, 323, 454, 356, 370, 391, 349, 360, 311, 312, 310, 415,
    308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81,
    82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317,
]

FACE_OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
    400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54,
    103, 67, 109,
]

SOLVE_PNP_POINTS = [
    EYE_OUTER_LEFT,
    EYE_OUTER_RIGHT,
    NOSE_TIP,
    MOUTH_LEFT,
    MOUTH_RIGHT,
    CHIN,
]

OVERLAY_LANDMARK_GROUPS = {
    "face_oval": FACE_OVAL,
    "eye_left": EYE_RING_LEFT,
    "eye_right": EYE_RING_RIGHT,
    "iris_a": IRIS_A,
    "iris_b": IRIS_B,
    "lips": MOUTH_LIPS,
    "nose": NOSE_CONTOUR,
}

EYE_SIDES = {
    "left": {
        "outer": EYE_OUTER_LEFT,
        "inner": EYE_INNER_LEFT,
        "six": EYE_SIX_LEFT,
        "ring": EYE_RING_LEFT,
    },
    "right": {
        "outer": EYE_OUTER_RIGHT,
        "inner": EYE_INNER_RIGHT,
        "six": EYE_SIX_RIGHT,
        "ring": EYE_RING_RIGHT,
    },
}


def resolve_irises(landmarks: list[list[float]]) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """Pair each MediaPipe iris with the eye it actually sits inside.

    MediaPipe's iris index labels are not guaranteed to match a fixed eye side,
    so pairing is resolved geometrically by proximity to the eye corners. This
    removes a whole class of mirrored / mislabelled gaze errors.

    Returns ((left_iris_xy, right_iris_xy), None) where "left"/"right" are
    image sides, or None when the landmark set is unusable.
    """
    if not landmarks or len(landmarks) < 478:
        return None
    try:
        left_mid = _mid(landmarks[EYE_OUTER_LEFT], landmarks[EYE_INNER_LEFT])
        right_mid = _mid(landmarks[EYE_OUTER_RIGHT], landmarks[EYE_INNER_RIGHT])
        iris_a = landmarks[IRIS_A_CENTER]
        iris_b = landmarks[IRIS_B_CENTER]
    except (IndexError, TypeError):
        return None

    def dist(a, b):
        return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

    a_to_left = dist(iris_a, left_mid)
    a_to_right = dist(iris_a, right_mid)
    b_to_left = dist(iris_b, left_mid)
    b_to_right = dist(iris_b, right_mid)

    if a_to_left + b_to_right <= a_to_right + b_to_left:
        return (iris_a, iris_b)
    return (iris_b, iris_a)


def _mid(a, b) -> tuple[float, float]:
    return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)

_PROPORTIONS = {
    "eye_y": 0.40,
    "eye_half_width": 0.115,
    "iris_y": 0.42,
    "mouth_y": 0.68,
    "mouth_half_width": 0.135,
    "nose_y": 0.52,
    "chin_y": 1.0,
    "forehead_y": 0.10,
}


class _HeuristicLandmarks:
    """Fallback landmark source derived from a face bounding box."""

    backend = "heuristic"
    available = True
    landmark_count = 0

    def detect_faces(self, frame: np.ndarray) -> list:
        return []

    def close(self) -> None:
        return None


class _YuNetFaceDetector:
    """Multi-face detector used to seed per-face landmark refinement.

    MediaPipe's bundled Face Landmarker detection stage reliably returns only
    one face per frame, so a second person in the shot is usually missed. YuNet
    supplies the face list instead: it is an anchor-free detector trained for
    genuine multi-face use, and it holds up across one to three people at
    realistic webcam scales, which is what proctoring needs.

    Each detected face is then refined by running the Face Landmarker on that
    face alone, which is what restores per-face 478-point landmarks.
    """

    INPUT_SIZE = (320, 320)

    def __init__(self):
        self._detector = None
        self.available = False
        self.model_path = Path(YUNET_MODEL_PATH)
        self._init()

    def _init(self):
        if not YUNET_ENABLED:
            return
        if not self.model_path.exists():
            logger.info(
                "YuNet model not found at %s - multi-face landmark seeding disabled",
                self.model_path,
            )
            return
        if not hasattr(cv2, "FaceDetectorYN"):
            logger.warning(
                "This OpenCV build has no FaceDetectorYN - multi-face landmark seeding disabled"
            )
            return
        try:
            self._detector = cv2.FaceDetectorYN.create(
                str(self.model_path),
                "",
                self.INPUT_SIZE,
                YUNET_SCORE_THRESHOLD,
                YUNET_NMS_THRESHOLD,
                5000,
            )
            self.available = True
            logger.info("Multi-face detection backend: OpenCV YuNet")
        except Exception as e:
            logger.warning("YuNet detector init failed: %s", e)

    def detect(self, frame: np.ndarray) -> list[dict]:
        """Return every detected face as {"x1","y1","x2","y2","score"}."""
        if not self.available or frame is None or frame.size == 0:
            return []

        h, w = frame.shape[:2]
        try:
            self._detector.setInputSize((w, h))
            ok, faces = self._detector.detect(frame)
        except Exception as e:
            logger.debug("YuNet detection failed: %s", e)
            return []
        if not ok or faces is None:
            return []

        boxes = []
        for face in faces:
            # YuNet rows are
            # [x, y, w, h, right_eye, left_eye, nose, mouth_r, mouth_l, score].
            score = float(face[-1])
            if score < YUNET_SCORE_THRESHOLD:
                continue
            x, y, fw, fh = (float(v) for v in face[:4])
            boxes.append(
                {
                    "x1": max(0.0, x - fw / 2.0),
                    "y1": max(0.0, y - fh / 2.0),
                    "x2": min(float(w), x + fw / 2.0),
                    "y2": min(float(h), y + fh / 2.0),
                    "score": score,
                }
            )
        return [b for b in boxes if _box_area(b) >= YUNET_MIN_SIZE_PX ** 2]


def _mp_image(rgb: np.ndarray):
    import mediapipe as mp

    return mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)


def _box_area(box: dict) -> float:
    return max(0.0, box["x2"] - box["x1"]) * max(0.0, box["y2"] - box["y1"])


class FacialLandmarkDetector:
    """Produces a MediaPipe-compatible landmark set for every detected face."""

    def __init__(self, model_path: str | os.PathLike | None = None, max_faces: int | None = None):
        self.enabled = LANDMARK_DETECTOR_ENABLED and MEDIAPIPE_ENABLED
        self.max_faces = max_faces or MEDIAPIPE_MAX_FACES
        self.model_path = Path(model_path) if model_path else Path(MEDIAPIPE_MODEL_PATH)
        self._landmarker = None
        self._fallback = _HeuristicLandmarks()
        self._backend = "disabled"
        self._last_timestamp_ms = 0
        self._face_detector = None
        self._image_landmarker = None
        self._init_backend()

    def _init_backend(self):
        if not self.enabled:
            logger.info("Facial landmark detection disabled by configuration")
            return
        try:
            import mediapipe as mp
            from mediapipe.tasks.python import vision as mp_vision
        except ImportError:
            logger.warning("mediapipe not installed - facial landmarks fall back to heuristic mode")
            self._backend = "heuristic"
            return

        if not self.model_path.exists():
            logger.warning(
                "MediaPipe face_landmarker.task not found at %s - run AIML/scripts/download_models.py",
                self.model_path,
            )
            self._backend = "heuristic"
            return

        try:
            base_options = mp.tasks.BaseOptions(model_asset_path=str(self.model_path))
            options = mp_vision.FaceLandmarkerOptions(
                base_options=base_options,
                running_mode=mp_vision.RunningMode.VIDEO,
                num_faces=self.max_faces,
                min_face_detection_confidence=MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
                min_face_presence_confidence=MEDIAPIPE_MIN_TRACKING_CONFIDENCE,
                min_tracking_confidence=MEDIAPIPE_MIN_TRACKING_CONFIDENCE,
                output_face_blendshapes=False,
                output_facial_transformation_matrixes=True,
            )
            self._landmarker = mp_vision.FaceLandmarker.create_from_options(options)
            self._backend = "mediapipe"
            logger.info("Facial landmark backend: MediaPipe Face Landmarker (%d faces max)", self.max_faces)
        except Exception as e:
            logger.warning("MediaPipe Face Landmarker init failed, using heuristic landmarks: %s", e)
            self._backend = "heuristic"

    @property
    def backend_name(self) -> str:
        return self._backend

    @property
    def available(self) -> bool:
        return self.enabled and self._backend != "disabled"

    def detect(self, frame: np.ndarray, timestamp_ms: int | None = None) -> dict:
        """Detect landmarks with MediaPipe for every face in the frame.

        Returns an empty result when MediaPipe is unavailable or finds nothing.
        Callers that need heuristic landmarks should call detect_heuristic().
        """
        empty = {"faces": [], "face_count": 0, "backend": self._backend}
        if frame is None or frame.size == 0:
            return empty

        if self._landmarker is not None:
            return self._detect_mediapipe(frame, timestamp_ms)

        return empty

    def detect_with_fallback(self, frame: np.ndarray, timestamp_ms: int | None = None) -> dict:
        """MediaPipe landmarks, falling back to the heuristic projection."""
        result = self.detect(frame, timestamp_ms)
        if result["faces"]:
            return result
        return self.detect_heuristic(frame)

    def detect_primary(self, frame: np.ndarray, timestamp_ms: int | None = None) -> dict | None:
        """Return landmarks for the largest face, or None."""
        result = self.detect_with_fallback(frame, timestamp_ms)
        if not result["faces"]:
            return None
        return max(result["faces"], key=lambda f: (f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1]))

    def _detect_mediapipe(self, frame: np.ndarray, timestamp_ms: int | None) -> dict:
        if self._landmarker is None:
            return {"faces": [], "face_count": 0, "backend": "mediapipe"}

        try:
            h, w = frame.shape[:2]
            ts = int(timestamp_ms) if timestamp_ms is not None else int(_now_ms())
            if ts <= self._last_timestamp_ms:
                ts = self._last_timestamp_ms + 1
            self._last_timestamp_ms = int(ts)

            boxes = self._detect_face_boxes(frame)
            faces = []
            for box in boxes:
                landmarks = self._refine_landmarks(frame, box, boxes)
                if landmarks and _landmarks_match_box(landmarks, box):
                    faces.append(self._face_entry(landmarks, w, h, box.get("score", 1.0)))
                elif box.get("landmarks"):
                    faces.append(
                        self._face_entry(box["landmarks"], w, h, box.get("score", 1.0))
                    )
                if len(faces) >= self.max_faces:
                    break
            return {"faces": faces, "face_count": len(faces), "backend": "mediapipe"}
        except Exception as e:
            logger.warning("MediaPipe landmark detection failed: %s", e)
            return {"faces": [], "face_count": 0, "backend": "mediapipe"}

    def _detect_face_boxes(self, frame: np.ndarray) -> list[dict]:
        """Face boxes from YuNet, or the landmarker's own list as a fallback."""
        if self._face_detector is None:
            self._face_detector = _YuNetFaceDetector()

        if self._face_detector.available:
            boxes = self._face_detector.detect(frame)
            if boxes:
                return boxes[: self.max_faces]

        return self._landmarker_faces(frame)

    def _landmarker_faces(self, frame: np.ndarray) -> list[dict]:
        """Whole-frame landmarker pass, used when YuNet is unavailable."""
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self._landmarker.detect_for_video(_mp_image(rgb), self._next_timestamp())
        boxes = []
        for face_landmarks in getattr(result, "face_landmarks", None) or []:
            points = [
                [float(p.x) * w, float(p.y) * h, float(p.z) * w] for p in face_landmarks
            ]
            xs = [p[0] for p in points]
            ys = [p[1] for p in points]
            boxes.append(
                {
                    "x1": min(xs),
                    "y1": min(ys),
                    "x2": max(xs),
                    "y2": max(ys),
                    "score": 1.0,
                    "landmarks": points,
                }
            )
        return boxes

    def _refine_landmarks(self, frame: np.ndarray, box: dict, neighbours: list[dict]) -> list[list[float]]:
        """Run the single-face landmarker on this face's crop, in frame pixels.

        The crop starts generously padded so the mesh keeps the hairline and
        chin, but a generous crop on a crowded frame can contain a second face,
        and a one-face landmarker will happily return that neighbour instead.
        Padding is therefore reduced until the returned landmarks land on the
        box that was actually being refined.
        """
        if box.get("landmarks"):
            return box["landmarks"]

        landmarker = self._crop_landmarker()
        if landmarker is None:
            return []

        h, w = frame.shape[:2]
        padding = LANDMARK_CROP_PADDING
        points = []
        for _ in range(3):
            x1, y1, x2, y2 = _padded_crop(box, w, h, padding)
            x1, y1, x2, y2 = _exclude_neighbours(box, neighbours, x1, y1, x2, y2, w, h)
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                return []
            points = self._landmarks_in_crop(landmarker, crop, x1, y1, x2 - x1, y2 - y1)
            if not points:
                return []
            if _landmarks_match_box(points, box):
                return points
            padding *= 0.4
        return points

    @staticmethod
    def _landmarks_in_crop(landmarker, crop: np.ndarray, x1: int, y1: int, crop_w: int, crop_h: int):
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        try:
            result = landmarker.detect(_mp_image(rgb))
        except Exception as e:
            logger.debug("Per-face landmark refinement failed: %s", e)
            return []
        face_sets = getattr(result, "face_landmarks", None) or []
        if not face_sets:
            return []
        return [
            [float(p.x) * crop_w + x1, float(p.y) * crop_h + y1, float(p.z) * crop_w]
            for p in face_sets[0]
        ]

    def _crop_landmarker(self):
        """A single-face landmarker in IMAGE mode for per-crop refinement.

        The frame-wide landmarker runs in VIDEO mode so it can be reused as the
        fallback detector; per-crop refinement needs stateless IMAGE mode
        because consecutive crops are different people at different sizes.
        """
        if self._image_landmarker is not None:
            return self._image_landmarker
        try:
            import mediapipe as mp
            from mediapipe.tasks.python import vision as mp_vision

            self._image_landmarker = mp_vision.FaceLandmarker.create_from_options(
                mp_vision.FaceLandmarkerOptions(
                    base_options=mp.tasks.BaseOptions(model_asset_path=str(self.model_path)),
                    running_mode=mp_vision.RunningMode.IMAGE,
                    num_faces=1,
                    min_face_detection_confidence=MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
                    min_face_presence_confidence=MEDIAPIPE_MIN_TRACKING_CONFIDENCE,
                    output_face_blendshapes=False,
                    output_facial_transformation_matrixes=False,
                )
            )
        except Exception as e:
            logger.warning("Per-face landmark refinement unavailable: %s", e)
        return self._image_landmarker

    def _next_timestamp(self) -> int:
        ts = int(_now_ms())
        if ts <= self._last_timestamp_ms:
            ts = self._last_timestamp_ms + 1
        self._last_timestamp_ms = ts
        return ts

    @staticmethod
    def _face_entry(points: list[list[float]], w: int, h: int, score: float) -> dict:
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        return {
            "landmarks": points,
            "bbox": _clamp_bbox(min(xs), min(ys), max(xs), max(ys), w, h),
            "landmark_count": len(points),
            "confidence": float(score or 1.0),
            "has_iris": len(points) > max(IRIS_A_CENTER, IRIS_B_CENTER),
        }

    def detect_heuristic(self, frame: np.ndarray) -> dict:
        """Project an equivalent landmark set from detected face boxes."""
        from .face_detector import FaceDetector

        if getattr(self, "_shared_detector", None) is None:
            self._shared_detector = FaceDetector(use_landmarks=False)
        detection = self._shared_detector.detect(frame)
        if not detection["faces"]:
            return {"faces": [], "face_count": 0, "backend": "heuristic"}

        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = []
        for det in detection["faces"]:
            bbox = det["bbox"]
            points = _project_heuristic_landmarks(bbox, w, h, gray)
            faces.append(
                {
                    "landmarks": points,
                    "bbox": bbox,
                    "landmark_count": MEDIAPIPE_LANDMARK_COUNT,
                    "confidence": float(det["confidence"]),
                    "has_iris": True,
                }
            )
        return {"faces": faces, "face_count": len(faces), "backend": "heuristic"}

    def close(self):
        if self._landmarker is not None:
            try:
                self._landmarker.close()
            except Exception:
                pass
            self._landmarker = None


def _now_ms() -> float:
    import time

    return time.time() * 1000


def _exclude_neighbours(
    box: dict, neighbours: list[dict], x1: int, y1: int, x2: int, y2: int, w: int, h: int
) -> tuple[int, int, int, int]:
    """Pull a padded crop back so it does not swallow an adjacent face.

    Without this, two people sitting side by side produce two crops that both
    contain both faces, and the single-face landmarker returns the same person
    twice - the classic "two faces detected, one is a duplicate" failure.
    """
    bx1, by1 = min(box["x1"], box["x2"]), min(box["y1"], box["y2"])
    bx2, by2 = max(box["x1"], box["x2"]), max(box["y1"], box["y2"])

    for other in neighbours:
        if other is box:
            continue
        ox1, oy1 = min(other["x1"], other["x2"]), min(other["y1"], other["y2"])
        ox2, oy2 = max(other["x1"], other["x2"]), max(other["y1"], other["y2"])
        if ox1 >= bx2 or ox2 <= bx1 or oy1 >= by2 or oy2 <= by1:
            continue

        # Only trim on the side where the neighbour actually intrudes.
        if ox1 >= (bx1 + bx2) / 2:
            x2 = min(x2, int(ox1))
        elif ox2 <= (bx1 + bx2) / 2:
            x1 = max(x1, int(ox2))
        if oy1 >= (by1 + by2) / 2:
            y2 = min(y2, int(oy1))
        elif oy2 <= (by1 + by2) / 2:
            y1 = max(y1, int(oy2))

    x1 = max(0, min(int(x1), w - 1))
    y1 = max(0, min(int(y1), h - 1))
    x2 = max(x1 + 1, min(int(x2), w))
    y2 = max(y1 + 1, min(int(y2), h))
    return x1, y1, x2, y2


def _landmarks_match_box(landmarks: list[list[float]], box: dict, tolerance: float = 0.6) -> bool:
    """Whether a landmark set plausibly belongs to the given detector box.

    Centres are compared with a slack proportional to box size so a slightly
    loose YuNet box still matches, while a landmark set belonging to a
    neighbouring face (which lands far outside this box) does not.
    """
    if not landmarks or not box:
        return False
    try:
        xs = [p[0] for p in landmarks]
        ys = [p[1] for p in landmarks]
    except (IndexError, TypeError, ValueError):
        return False

    lx1, ly1, lx2, ly2 = min(xs), min(ys), max(xs), max(ys)
    box_x1, box_y1 = min(box["x1"], box["x2"]), min(box["y1"], box["y2"])
    box_x2, box_y2 = max(box["x1"], box["x2"]), max(box["y1"], box["y2"])
    slack_x = (box_x2 - box_x1) * tolerance
    slack_y = (box_y2 - box_y1) * tolerance

    overlap_x = min(lx2, box_x2 + slack_x) - max(lx1, box_x1 - slack_x)
    overlap_y = min(ly2, box_y2 + slack_y) - max(ly1, box_y1 - slack_y)
    if overlap_x <= 0 or overlap_y <= 0:
        return False

    box_area = max(1.0, (box_x2 - box_x1) * (box_y2 - box_y1))
    inter = overlap_x * overlap_y
    return inter / box_area >= 0.5


def _padded_crop(box: dict, w: int, h: int, padding: float) -> tuple[int, int, int, int]:
    """Clamp a face box to the frame after expanding it by `padding` on all sides.

    YuNet boxes are tight around the face, but the landmark mesh expects the
    hairline, chin and both cheeks to be visible, so a crop taken straight from
    the detector box gets clipped and the outer landmarks drift.
    """
    x1, y1 = min(box["x1"], box["x2"]), min(box["y1"], box["y2"])
    x2, y2 = max(box["x1"], box["x2"]), max(box["y1"], box["y2"])
    pad_x = (x2 - x1) * padding
    pad_y = (y2 - y1) * padding
    return (
        int(max(0, math.floor(x1 - pad_x))),
        int(max(0, math.floor(y1 - pad_y))),
        int(min(w, math.ceil(x2 + pad_x))),
        int(min(h, math.ceil(y2 + pad_y))),
    )


def _clamp_bbox(x1, y1, x2, y2, w, h):
    return [
        int(max(0, min(x1, w - 1))),
        int(max(0, min(y1, h - 1))),
        int(max(1, min(x2, w))),
        int(max(1, min(y2, h))),
    ]


def _project_heuristic_landmarks(bbox, w, h, gray) -> list:
    """Build a MediaPipe-shaped landmark array from a face box.

    Eye corners, iris centres and mouth corners are estimated at fixed
    anthropometric offsets, then refined by locating the darkest region inside
    each eye band (the pupil/iris is darker than the sclera and lids). This
    keeps EAR, iris-offset gaze and solvePnP usable without the .task model.
    """
    x1, y1, x2, y2 = bbox
    bw = float(x2 - x1)
    bh = float(y2 - y1)
    if bw < 4 or bh < 4:
        return []

    def pt(u, v, depth=0.0):
        return [float(x1 + u * bw), float(y1 + v * bh), float(depth)]

    eye_y = _PROPORTIONS["eye_y"]
    eye_hw = _PROPORTIONS["eye_half_width"]
    mouth_y = _PROPORTIONS["mouth_y"]
    mouth_hw = _PROPORTIONS["mouth_half_width"]
    nose_y = _PROPORTIONS["nose_y"]

    eye_centers = {}
    for name, u in (("left", 0.50 - eye_hw * 0.62), ("right", 0.50 + eye_hw * 0.62)):
        cx, cy = x1 + u * bw, y1 + eye_y * bh
        offset = _refine_iris_offset(gray, cx, cy, eye_hw * bw, bh * 0.06)
        eye_centers[name] = (cx + offset[0] * bw, cy + offset[1] * bh)

    eye_heights = {}
    for name, u in (("left", 0.50 - eye_hw * 0.62), ("right", 0.50 + eye_hw * 0.62)):
        eye_heights[name] = _refine_eye_opening(gray, x1 + u * bw, y1 + eye_y * bh, eye_hw * bw, bh)

    points = [None] * MEDIAPIPE_LANDMARK_COUNT

    for idx, u, v in _base_ring():
        points[idx] = pt(u, v)

    # "left"/"right" below are image sides: the image-left eye uses MediaPipe's
    # 33/133 corners, the image-right eye uses 263/362.
    for side, center_u in (("left", 0.50 - eye_hw * 0.62), ("right", 0.50 + eye_hw * 0.62)):
        direction = -1.0 if side == "left" else 1.0
        outer_u = center_u + direction * eye_hw * 0.52
        inner_u = center_u - direction * eye_hw * 0.52
        iris_center = eye_centers[side]
        iris_u = (iris_center[0] - x1) / bw
        iris_v = (iris_center[1] - y1) / bh
        openness = eye_heights[side]

        if side == "left":
            outer_idx = EYE_OUTER_LEFT
            inner_idx = EYE_INNER_LEFT
            six = EYE_SIX_LEFT
            ring = EYE_RING_LEFT
            iris_base = IRIS_B_CENTER
        else:
            outer_idx = EYE_OUTER_RIGHT
            inner_idx = EYE_INNER_RIGHT
            six = EYE_SIX_RIGHT
            ring = EYE_RING_RIGHT
            iris_base = IRIS_A_CENTER

        points[outer_idx] = pt(outer_u, eye_y)
        points[inner_idx] = pt(inner_u, eye_y)
        points[six[0]] = points[outer_idx]
        points[six[3]] = points[inner_idx]
        points[six[1]] = pt(center_u - direction * eye_hw * 0.16, eye_y - openness * 0.5)
        points[six[4]] = pt(center_u + direction * eye_hw * 0.16, eye_y - openness * 0.42)
        points[six[2]] = pt(center_u, eye_y + openness * 0.5)
        points[six[5]] = pt(center_u, eye_y + openness * 0.45)

        for pos, idx in enumerate(ring):
            if points[idx] is not None:
                continue
            angle = (pos / len(ring)) * 2 * np.pi
            points[idx] = pt(
                center_u + np.cos(angle) * eye_hw * 0.46,
                eye_y + np.sin(angle) * max(openness * 0.55, bh * 0.012),
            )

        points[iris_base] = pt(iris_u, iris_v)
        for i in range(1, 5):
            angle = (i / 4) * 2 * np.pi
            radius = min(bw, bh) * 0.012
            points[iris_base + i] = pt(
                iris_u + np.cos(angle) * radius / bw,
                iris_v + np.sin(angle) * radius / bh,
            )

    points[NOSE_TIP] = pt(0.5, nose_y)
    points[168] = pt(0.5, 0.32)
    points[6] = pt(0.5, 0.38)
    points[197] = pt(0.485, 0.44)
    points[195] = pt(0.515, 0.44)
    points[5] = pt(0.5, 0.36)
    points[4] = pt(0.5, 0.30)
    for pos, idx in enumerate(NOSE_CONTOUR):
        angle = np.pi * (0.08 + 0.84 * pos / max(1, len(NOSE_CONTOUR) - 1))
        points[idx] = pt(0.5 - np.cos(angle) * bw * 0.055, nose_y + np.sin(angle) * bh * 0.045)

    for idx in MOUTH_LIPS:
        if points[idx] is not None:
            continue
        angle = (MOUTH_LIPS.index(idx) / len(MOUTH_LIPS)) * 2 * np.pi
        points[idx] = pt(
            0.5 + np.cos(angle) * mouth_hw,
            mouth_y + np.sin(angle) * bh * 0.045,
        )
    points[MOUTH_LEFT] = pt(0.5 - mouth_hw, mouth_y)
    points[MOUTH_RIGHT] = pt(0.5 + mouth_hw, mouth_y)
    points[MOUTH_TOP] = pt(0.5, mouth_y - bh * 0.02)
    points[MOUTH_BOTTOM] = pt(0.5, mouth_y + bh * 0.04)
    points[CHIN] = pt(0.5, _PROPORTIONS["chin_y"])
    points[FOREHEAD] = pt(0.5, _PROPORTIONS["forehead_y"])
    points[EYE_OUTER_LEFT] = points[EYE_OUTER_LEFT] or pt(0.5 - eye_hw, eye_y)
    points[EYE_OUTER_RIGHT] = points[EYE_OUTER_RIGHT] or pt(0.5 + eye_hw, eye_y)

    default = pt(0.5, 0.5)
    return [p if p is not None else list(default) for p in points]


def _base_ring() -> list:
    ring = []
    for pos, idx in enumerate(FACE_OVAL):
        angle = (pos / len(FACE_OVAL)) * 2 * np.pi - np.pi / 2
        ring.append((idx, 0.5 + np.cos(angle) * 0.47, 0.5 + np.sin(angle) * 0.48))
    for pos, idx in enumerate(JAWLINE):
        if idx in FACE_OVAL:
            continue
        angle = (pos / max(1, len(JAWLINE) - 1)) * np.pi * 2 - np.pi / 2
        ring.append((idx, 0.5 + np.cos(angle) * 0.45, 0.5 + np.sin(angle) * 0.46))
    return ring


def _refine_iris_offset(gray, cx, cy, half_width, half_height) -> tuple:
    """Locate the pupil as the darkest blob inside an eye region."""
    h, w = gray.shape[:2]
    x0 = int(max(0, cx - half_width * 1.6))
    x1 = int(min(w, cx + half_width * 1.6))
    y0 = int(max(0, cy - max(half_height * 3.0, 2)))
    y1 = int(min(h, cy + max(half_height * 3.0, 2)))
    if x1 - x0 < 3 or y1 - y0 < 2:
        return (0.0, 0.0)
    patch = gray[y0:y1, x0:x1].astype(np.float32)
    if patch.size == 0:
        return (0.0, 0.0)
    window_x = max(3, int(half_width * 1.8)) | 1
    window_y = max(3, int(half_height * 3.0)) | 1
    box = cv2.boxFilter(patch, ddepth=-1, ksize=(window_x, window_y), normalize=True, borderType=cv2.BORDER_REFLECT)
    diff = patch - box
    ys, xs = np.where(diff < -8)
    if xs.size < 3:
        return (0.0, 0.0)
    weights = np.abs(diff[ys, xs])
    mean_x = float(np.average(x0 + xs, weights=weights))
    mean_y = float(np.average(y0 + ys, weights=weights))
    return (mean_x - cx, mean_y - cy)


def _refine_eye_opening(gray, cx, cy, half_width, box_h) -> float:
    """Estimate vertical eye aperture in pixels from the dark-pixel profile."""
    h, w = gray.shape[:2]
    x0 = int(max(0, cx - half_width * 0.8))
    x1 = int(min(w, cx + half_width * 0.8))
    if x1 - x0 < 3:
        return box_h * 0.10
    column = gray[:, x0:x1].mean(axis=1)
    top = int(max(0, cy - box_h * 0.14))
    bottom = int(min(h, cy + box_h * 0.14))
    if bottom - top < 3:
        return box_h * 0.10
    segment = column[top:bottom]
    if segment.size == 0:
        return box_h * 0.10
    threshold = float(segment.min()) + max(6.0, float(segment.max() - segment.min()) * 0.35)
    dark = np.where(segment <= threshold)[0]
    if dark.size == 0:
        return box_h * 0.10
    return float(dark.max() - dark.min() + 1)