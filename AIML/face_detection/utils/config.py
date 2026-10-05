"""Central configuration for face detection and proctoring."""

import os
from pathlib import Path

AIML_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_DIR = AIML_ROOT / "models"
MODEL_DIR = MODELS_DIR
FACE_DETECTOR_DIR = MODELS_DIR / "face_detector"
FACE_RECOGNITION_DIR = MODELS_DIR / "face_recognition"
LANDMARK_MODEL_DIR = MODELS_DIR / "face_detection"

FACE_DETECTION_ENABLED = os.environ.get("FACE_DETECTION_ENABLED", "true").lower() == "true"
FACE_RECOGNITION_ENABLED = os.environ.get("FACE_RECOGNITION_ENABLED", "true").lower() == "true"

FACE_DETECTION_CONFIDENCE = float(os.environ.get("FACE_DETECTION_CONFIDENCE", "0.50"))
# Calibrated on the full official LFW protocol (6000 pairs, buffalo_sc pack):
# AUC 0.997, EER 0.8-0.9%, and 0.25 is the highest threshold holding the
# false-accusation rate near 0.1% while keeping ~99% of genuine matches. On
# degraded (blur/dim/JPEG) copies it stays at 0.249. Higher values reject real
# candidates on webcam-quality frames; lower values start accepting impostors.
FACE_MATCH_THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "0.25"))
# RetinaFace input size. 640 is accurate but costs ~1.7s per frame on CPU,
# which shows up directly as popup latency. 320 keeps detection in the tens of
# milliseconds while still resolving webcam-sized faces.
FACE_DETECT_SIZE = int(os.environ.get("FACE_DETECT_SIZE", "320"))

# InsightFace model pack. "buffalo_sc" ships the lighter SCRFD-500m detector and
# w600k_mbf recognition head, which run ~3-4x faster than buffalo_l on CPU at
# comparable LFW accuracy. Local packs under models/insightface/<pack> are used
# without downloading; anything else falls back to the insightface cache.
FACE_MODEL_PACK = os.environ.get("FACE_MODEL_PACK", "buffalo_sc").strip().lower()
INSIGHTFACE_MODEL_ROOT = MODELS_DIR / "insightface"

FACE_DETECTOR_BACKEND = os.environ.get("FACE_DETECTOR_BACKEND", "auto").strip().lower()
MEDIAPIPE_ENABLED = os.environ.get("MEDIAPIPE_ENABLED", "true").lower() == "true"
MEDIAPIPE_MODEL_PATH = os.environ.get(
    "MEDIAPIPE_FACE_LANDMARKER_MODEL",
    str(MODELS_DIR / "face_detection" / "face_landmarker.task"),
)
MEDIAPIPE_MIN_DETECTION_CONFIDENCE = float(os.environ.get("MEDIAPIPE_MIN_DETECTION_CONFIDENCE", "0.4"))
MEDIAPIPE_MIN_TRACKING_CONFIDENCE = float(os.environ.get("MEDIAPIPE_MIN_TRACKING_CONFIDENCE", "0.4"))
MEDIAPIPE_MAX_FACES = int(os.environ.get("MEDIAPIPE_MAX_FACES", "4"))
MEDIAPIPE_LANDMARKS_ENABLED = os.environ.get("MEDIAPIPE_LANDMARKS_ENABLED", "true").lower() == "true"
LANDMARK_DETECTOR_ENABLED = os.environ.get("LANDMARK_DETECTOR_ENABLED", "true").lower() == "true"

# MediaPipe's bundled Face Landmarker detection stage reliably finds a single
# face per frame, so a second face in the shot is frequently missed. YuNet
# supplies the face list instead, and landmarks are then refined one face at a
# time by running the Face Landmarker on each padded face crop.
YUNET_ENABLED = os.environ.get("YUNET_ENABLED", "true").lower() == "true"
YUNET_MODEL_PATH = os.environ.get(
    "YUNET_MODEL",
    str(MODELS_DIR / "face_detection" / "yunet_2023mar.onnx"),
)
YUNET_SCORE_THRESHOLD = float(os.environ.get("YUNET_SCORE_THRESHOLD", "0.6"))
YUNET_NMS_THRESHOLD = float(os.environ.get("YUNET_NMS_THRESHOLD", "0.3"))
YUNET_MIN_SIZE_PX = int(os.environ.get("YUNET_MIN_SIZE_PX", "24"))
# Fraction of a face crop kept as padding so the landmarker still sees the
# whole face oval, ears and chin rather than a clipped centre.
LANDMARK_CROP_PADDING = float(os.environ.get("LANDMARK_CROP_PADDING", "0.6"))

YOLO_FACE_ENABLED = os.environ.get("YOLO_FACE_ENABLED", "true").lower() == "true"
YOLO_FACE_MODEL = os.environ.get("YOLO_FACE_MODEL", "yolov8n-face-300w-lp.pt")
YOLO_FACE_WEIGHTS = os.environ.get(
    "YOLO_FACE_WEIGHTS",
    str(MODELS_DIR / "face_detection" / YOLO_FACE_MODEL),
)
YOLO_FACE_CONFIDENCE = float(os.environ.get("YOLO_FACE_CONFIDENCE", "0.35"))
YOLO_FACE_FALLBACK_ENABLED = os.environ.get("YOLO_FACE_FALLBACK_ENABLED", "true").lower() == "true"
YOLO_FACE_DIFFICULT_MIN_BRIGHTNESS = float(os.environ.get("YOLO_FACE_DIFFICULT_MIN_BRIGHTNESS", "55.0"))
YOLO_FACE_DIFFICULT_MIN_SIZE = int(os.environ.get("YOLO_FACE_DIFFICULT_MIN_SIZE", "30"))

HEAD_POSE_ENABLED = os.environ.get("HEAD_POSE_ENABLED", "true").lower() == "true"
HEAD_POSE_YAW_THRESHOLD = float(os.environ.get("HEAD_POSE_YAW_THRESHOLD", "18"))
HEAD_POSE_PITCH_THRESHOLD = float(os.environ.get("HEAD_POSE_PITCH_THRESHOLD", "15"))
HEAD_POSE_ROLL_THRESHOLD = float(os.environ.get("HEAD_POSE_ROLL_THRESHOLD", "25"))
# Geometric head-pose calibration. These reference ratios are measured from
# near-frontal reference faces and are expressed as multiples of the
# inter-ocular distance, so they hold at any distance or frame size.
# FRONTAL_NOSE_RATIO: eye-line to nose-tip distance over eye width on a frontal face.
HEAD_POSE_FRONTAL_NOSE_RATIO = float(os.environ.get("HEAD_POSE_FRONTAL_NOSE_RATIO", "0.64"))
HEAD_POSE_FRONTAL_MOUTH_RATIO = float(os.environ.get("HEAD_POSE_FRONTAL_MOUTH_RATIO", "0.57"))
HEAD_POSE_FRONTAL_MOUTH_Y_RATIO = float(os.environ.get("HEAD_POSE_FRONTAL_MOUTH_Y_RATIO", "0.92"))
HEAD_POSE_FRONTAL_CHIN_RATIO = float(os.environ.get("HEAD_POSE_FRONTAL_CHIN_RATIO", "1.42"))
# Gains converting measured ratios into degrees. The asymmetries are fractions of
# a sine, so a gain above 1.0 sharpens the response near frontal.
HEAD_POSE_YAW_GAIN = float(os.environ.get("HEAD_POSE_YAW_GAIN", "1.35"))
HEAD_POSE_PITCH_GAIN = float(os.environ.get("HEAD_POSE_PITCH_GAIN", "1.5"))

GAZE_ENABLED = os.environ.get("GAZE_ENABLED", "true").lower() == "true"
GAZE_HORIZONTAL_THRESHOLD = float(os.environ.get("GAZE_HORIZONTAL_THRESHOLD", "0.22"))
GAZE_VERTICAL_THRESHOLD = float(os.environ.get("GAZE_VERTICAL_THRESHOLD", "0.20"))
GAZE_CONFIRMATION_FRAMES = int(os.environ.get("GAZE_CONFIRMATION_FRAMES", "5"))
GAZE_IGNORE_YAW_ABOVE = float(os.environ.get("GAZE_IGNORE_YAW_ABOVE", "35"))
GAZE_HORIZONTAL_ANGLE_DEG = float(os.environ.get("GAZE_HORIZONTAL_ANGLE_DEG", "18"))
GAZE_HEAD_YAW_COMPENSATION = float(os.environ.get("GAZE_HEAD_YAW_COMPENSATION", "0.6"))
GAZE_ROLL_COMPENSATION_THRESHOLD = float(os.environ.get("GAZE_ROLL_COMPENSATION_THRESHOLD", "20"))
GAZE_ROLL_COMPENSATION = float(os.environ.get("GAZE_ROLL_COMPENSATION", "0.3"))

BLINK_ENABLED = os.environ.get("BLINK_ENABLED", "true").lower() == "true"
BLINK_EAR_OPEN_THRESHOLD = float(os.environ.get("BLINK_EAR_OPEN_THRESHOLD", "0.22"))
BLINK_EAR_CLOSED_THRESHOLD = float(os.environ.get("BLINK_EAR_CLOSED_THRESHOLD", "0.13"))
BLINK_NORMAL_MIN_SECONDS = float(os.environ.get("BLINK_NORMAL_MIN_SECONDS", "0.08"))
BLINK_NORMAL_MAX_SECONDS = float(os.environ.get("BLINK_NORMAL_MAX_SECONDS", "0.45"))
BLINK_EYES_CLOSED_SECONDS = float(os.environ.get("BLINK_EYES_CLOSED_SECONDS", "2.5"))
BLINK_RATE_WINDOW_SECONDS = float(os.environ.get("BLINK_RATE_WINDOW_SECONDS", "60"))
BLINK_RATE_MAX_PER_MINUTE = float(os.environ.get("BLINK_RATE_MAX_PER_MINUTE", "45"))
BLINK_MIN_CLOSURE_FRAMES = int(os.environ.get("BLINK_MIN_CLOSURE_FRAMES", "2"))

FACE_CHECK_INTERVAL_MS = int(os.environ.get("FACE_CHECK_INTERVAL_MS", "2000"))

REFERENCE_CAPTURE_FRAMES = int(os.environ.get("REFERENCE_CAPTURE_FRAMES", "5"))
REFERENCE_MIN_VALID_FRAMES = int(os.environ.get("REFERENCE_MIN_VALID_FRAMES", "3"))

MULTIPLE_FACE_CONFIRMATION_FRAMES = int(os.environ.get("MULTIPLE_FACE_CONFIRMATION_FRAMES", "3"))
IDENTITY_MISMATCH_CONFIRMATION_FRAMES = int(os.environ.get("IDENTITY_MISMATCH_CONFIRMATION_FRAMES", "5"))
NO_FACE_CONFIRMATION_FRAMES = int(os.environ.get("NO_FACE_CONFIRMATION_FRAMES", "8"))
CAMERA_DISABLED_CONFIRMATION_FRAMES = int(os.environ.get("CAMERA_DISABLED_CONFIRMATION_FRAMES", "2"))
NO_FACE_ABSENCE_GRACE_SECONDS = float(os.environ.get("NO_FACE_ABSENCE_GRACE_SECONDS", "3"))
HEAD_TURNED_CONFIRMATION_FRAMES = int(os.environ.get("HEAD_TURNED_CONFIRMATION_FRAMES", "5"))
EYES_CLOSED_CONFIRMATION_FRAMES = int(os.environ.get("EYES_CLOSED_CONFIRMATION_FRAMES", "3"))

# Face identity and presence are confirmed by *time*, not by a frame count.
# A fixed frame count makes the warning delay depend entirely on how fast the
# client polls: at a 2s interval "3 frames" is a 6 second warning. These
# windows keep the delay constant regardless of polling cadence, and the
# sample minimum stops a single bad inference from triggering anything.
IDENTITY_MISMATCH_CONFIRM_SECONDS = float(os.environ.get("IDENTITY_MISMATCH_CONFIRM_SECONDS", "0.8"))
IDENTITY_MISMATCH_MIN_SAMPLES = int(os.environ.get("IDENTITY_MISMATCH_MIN_SAMPLES", "2"))
MULTIPLE_FACE_CONFIRM_SECONDS = float(os.environ.get("MULTIPLE_FACE_CONFIRM_SECONDS", "0.8"))
MULTIPLE_FACE_MIN_SAMPLES = int(os.environ.get("MULTIPLE_FACE_MIN_SAMPLES", "2"))
NO_FACE_CONFIRM_SECONDS = float(os.environ.get("NO_FACE_CONFIRM_SECONDS", "0.6"))
NO_FACE_MIN_SAMPLES = int(os.environ.get("NO_FACE_MIN_SAMPLES", "2"))
# The scene/object detector runs on its own, slower cadence. Phone detection is
# the most expensive signal per frame and does not need to run at face rate.
SCENE_DETECTION_EVERY_N_CYCLES = int(os.environ.get("SCENE_DETECTION_EVERY_N_CYCLES", "2"))

# Attention conditions must persist for at least this long (seconds) before
# they can be confirmed, on top of the consecutive-frame count. A quick glance
# or a single head turn therefore never registers as a violation.
GAZE_HOLD_SECONDS = float(os.environ.get("GAZE_HOLD_SECONDS", "3.0"))
HEAD_TURNED_HOLD_SECONDS = float(os.environ.get("HEAD_TURNED_HOLD_SECONDS", "5.0"))

ATTENTION_ANALYZER_ENABLED = os.environ.get("ATTENTION_ANALYZER_ENABLED", "true").lower() == "true"
ATTENTION_METRICS_IN_RESPONSE = os.environ.get("ATTENTION_METRICS_IN_RESPONSE", "true").lower() == "true"
ATTENTION_LANDMARKS_IN_RESPONSE = os.environ.get("ATTENTION_LANDMARKS_IN_RESPONSE", "true").lower() == "true"
ATTENTION_OVERLAY_LANDMARK_COUNT = int(os.environ.get("ATTENTION_OVERLAY_LANDMARK_COUNT", "478"))

FACE_EMBEDDING_SIZE = int(os.environ.get("FACE_EMBEDDING_SIZE", "128"))

MIN_FACE_SIZE_PX = int(os.environ.get("MIN_FACE_SIZE_PX", "40"))
MIN_FACE_BRIGHTNESS = float(os.environ.get("MIN_FACE_BRIGHTNESS", "30.0"))
MIN_FACE_BLUR_VARIANCE = float(os.environ.get("MIN_FACE_BLUR_VARIANCE", "50.0"))
