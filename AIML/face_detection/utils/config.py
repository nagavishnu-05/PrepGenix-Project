"""Central configuration for face detection and proctoring."""

import os
from pathlib import Path

AIML_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_DIR = AIML_ROOT / "models"
FACE_DETECTOR_DIR = MODELS_DIR / "face_detector"
FACE_RECOGNITION_DIR = MODELS_DIR / "face_recognition"

FACE_DETECTION_ENABLED = os.environ.get("FACE_DETECTION_ENABLED", "true").lower() == "true"
FACE_RECOGNITION_ENABLED = os.environ.get("FACE_RECOGNITION_ENABLED", "true").lower() == "true"

FACE_DETECTION_CONFIDENCE = float(os.environ.get("FACE_DETECTION_CONFIDENCE", "0.50"))
FACE_MATCH_THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "0.40"))

FACE_CHECK_INTERVAL_MS = int(os.environ.get("FACE_CHECK_INTERVAL_MS", "2000"))

REFERENCE_CAPTURE_FRAMES = int(os.environ.get("REFERENCE_CAPTURE_FRAMES", "5"))
REFERENCE_MIN_VALID_FRAMES = int(os.environ.get("REFERENCE_MIN_VALID_FRAMES", "3"))

MULTIPLE_FACE_CONFIRMATION_FRAMES = int(os.environ.get("MULTIPLE_FACE_CONFIRMATION_FRAMES", "3"))
IDENTITY_MISMATCH_CONFIRMATION_FRAMES = int(os.environ.get("IDENTITY_MISMATCH_CONFIRMATION_FRAMES", "3"))
NO_FACE_CONFIRMATION_FRAMES = int(os.environ.get("NO_FACE_CONFIRMATION_FRAMES", "5"))
CAMERA_DISABLED_CONFIRMATION_FRAMES = int(os.environ.get("CAMERA_DISABLED_CONFIRMATION_FRAMES", "2"))

FACE_EMBEDDING_SIZE = int(os.environ.get("FACE_EMBEDDING_SIZE", "128"))

MIN_FACE_SIZE_PX = int(os.environ.get("MIN_FACE_SIZE_PX", "40"))
MIN_FACE_BRIGHTNESS = float(os.environ.get("MIN_FACE_BRIGHTNESS", "30.0"))
MIN_FACE_BLUR_VARIANCE = float(os.environ.get("MIN_FACE_BLUR_VARIANCE", "50.0"))
