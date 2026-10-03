"""Flask API for AI proctoring with modern face detection, embedding-based verification, and temporal confirmation.

Run:
  cd AIML && python -m api.proctoring_api

Endpoints:
  POST /analyze              { image: base64, attemptId } -> detection results
  POST /analyze/frame        same as /analyze
  POST /register-face        { image: base64, attemptId } -> register single reference face
  POST /enroll-face          { images: [base64...], attemptId } -> multi-frame enrollment
  POST /enroll-frame         { image: base64, attemptId } -> capture one enrollment frame
  POST /enroll-status        { attemptId } -> get enrollment status
  POST /verify-face          { image: base64, attemptId } -> verify face
  POST /monitor              { image: base64, attemptId } -> continuous monitoring
  POST /reset                { attemptId } -> reset engine state
  GET  /health               -> status check
"""

import base64
import os
import sys
from pathlib import Path

# Running this file directly (`python api/proctoring_api.py`) puts `AIML/api` on
# sys.path instead of the project root, which breaks the lazy
# `from face_detection...` imports inside the route handlers. Anchor the
# project root so both `python -m api.proctoring_api` and direct execution work.
_PROJECT_ROOT = str(Path(__file__).resolve().parents[1])
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

_engines = {}


def _get_engine(attempt_id: str):
    if attempt_id not in _engines:
        from proctoring import ProctoringEngine
        _engines[attempt_id] = ProctoringEngine()
    return _engines[attempt_id]


def _get_face_monitor(attempt_id: str):
    from proctoring.face_detection import FaceMonitor
    key = f"fm_{attempt_id}"
    if key not in _engines:
        test_config = _get_test_config(attempt_id)
        _engines[key] = FaceMonitor(
            max_violations=test_config.get("maxViolations", 5),
            auto_submit=test_config.get("autoSubmit", True),
        )
    return _engines[key]


def _get_test_config(attempt_id: str) -> dict:
    import os

    return {
        "maxViolations": int(os.environ.get("PROCTORING_MAX_VIOLATIONS", "5")),
        "autoSubmit": os.environ.get("PROCTORING_AUTO_SUBMIT", "true").lower() == "true",
    }


def _decode_image(b64: str):
    import numpy as np
    import cv2
    if not b64:
        return None
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    try:
        raw = base64.b64decode(b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


@app.route("/health", methods=["GET"])
def health():
    from face_detection.utils.config import (
        BLINK_ENABLED,
        FACE_DETECTION_ENABLED,
        FACE_RECOGNITION_ENABLED,
        GAZE_ENABLED,
        HEAD_POSE_ENABLED,
        LANDMARK_DETECTOR_ENABLED,
        MEDIAPIPE_ENABLED,
    )
    return jsonify({
        "status": "ok",
        "service": "proctoring-api",
        "engines": len(_engines),
        "face_detection_enabled": FACE_DETECTION_ENABLED,
        "face_recognition_enabled": FACE_RECOGNITION_ENABLED,
        "landmarks_enabled": LANDMARK_DETECTOR_ENABLED and MEDIAPIPE_ENABLED,
        "head_pose_enabled": HEAD_POSE_ENABLED,
        "gaze_enabled": GAZE_ENABLED,
        "blink_enabled": BLINK_ENABLED,
    })


@app.route("/capabilities", methods=["GET"])
def capabilities():
    """Report which analysis backends and models are actually loaded."""
    from face_detection.inference.attention_analyzer import AttentionAnalyzer
    from face_detection.inference.blink_detector import BlinkDetector
    from face_detection.inference.face_detector import FaceDetector
    from face_detection.inference.gaze_estimator import GazeEstimator
    from face_detection.inference.head_pose import HeadPoseEstimator
    from face_detection.inference.landmark_detector import FacialLandmarkDetector
    from face_detection.inference.yolo_face_detector import YOLOFaceDetector

    if "capabilities_probe" not in _engines:
        detector = FaceDetector()
        landmarks = detector.landmark_detector or FacialLandmarkDetector()
        yolo = YOLOFaceDetector()
        _engines["capabilities_probe"] = {
            "detector_backend": detector.backend_name,
            "detector_fallback_enabled": detector._allow_yolo_fallback,
            "landmark_backend": landmarks.backend_name,
            "landmark_model": str(landmarks.model_path),
            "landmark_model_present": landmarks.model_path.exists(),
            "head_pose_enabled": HeadPoseEstimator().enabled,
            "gaze_enabled": GazeEstimator().enabled,
            "blink_enabled": BlinkDetector().enabled,
            "attention_enabled": AttentionAnalyzer().enabled,
            "yolo_face_available": yolo.available,
            "yolo_face_backend": yolo.backend_name,
        }

    return jsonify({"capabilities": _engines["capabilities_probe"]})


@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json(force=True)
    image_b64 = data.get("image")
    attempt_id = data.get("attemptId", "default")

    if not image_b64:
        return jsonify({"error": "image (base64) is required"}), 400

    frame = _decode_image(image_b64)
    if frame is None:
        return jsonify({"error": "Could not decode image"}), 400

    engine = _get_engine(attempt_id)
    result = engine.analyze(frame)

    return jsonify({
        "analysis": {
            "face": result["face"],
            "person": result["person"],
            "device": result["device"],
        },
        "faceVerification": result.get("faceVerification"),
        "faceRegistered": result.get("faceRegistered", False),
        "violations": result["violations"],
        "autoSubmitted": result["autoSubmit"],
        "cheatingReason": result["cheatingReason"],
        "confirmationProgress": result["confirmationProgress"],
        "confirmedViolations": result["confirmedViolations"],
    })


@app.route("/analyze/frame", methods=["POST"])
def analyze_frame():
    return analyze()


@app.route("/register-face", methods=["POST"])
def register_face():
    """Register reference face from a single frame."""
    data = request.get_json(force=True)
    image_b64 = data.get("image")
    attempt_id = data.get("attemptId", "default")

    if not image_b64:
        return jsonify({"error": "image (base64) is required"}), 400

    frame = _decode_image(image_b64)
    if frame is None:
        return jsonify({"error": "Could not decode image"}), 400

    engine = _get_engine(attempt_id)
    result = engine.register_face(frame)

    if result.get("success"):
        monitor = _get_face_monitor(attempt_id)
        monitor._reference_embedding = engine._reference_embedding
        monitor._reference_captured = engine._face_registered
        return jsonify({
            "success": True,
            "faceCount": result.get("faceCount", 0),
            "quality": result.get("quality", "unknown"),
            "box": result.get("box"),
            "message": result.get("message", "Reference face registered successfully"),
        })
    else:
        return jsonify({
            "success": False,
            "error": result.get("error", "unknown"),
            "message": result.get("message", "Failed to register face"),
        }), 400


@app.route("/enroll-face", methods=["POST"])
def enroll_face_multi():
    """Multi-frame face enrollment.

    Body: { images: [base64, base64, ...], attemptId }
    Captures multiple frames, generates embeddings, creates stable reference.
    """
    data = request.get_json(force=True)
    images = data.get("images", [])
    attempt_id = data.get("attemptId", "default")

    if not images or not isinstance(images, list):
        return jsonify({"error": "images (array of base64) is required"}), 400

    monitor = _get_face_monitor(attempt_id)
    monitor.enroll_start()

    for img_b64 in images:
        result = monitor.enroll_from_base64(img_b64)
        if result.get("status") == "ready":
            engine = _get_engine(attempt_id)
            if monitor._reference_embedding is not None:
                import numpy as np
                engine._reference_embedding = monitor._reference_embedding
                engine._face_registered = True
            return jsonify({
                "success": True,
                "status": "ready",
                "captured": result.get("captured", 0),
                "message": result.get("message", "Face enrolled successfully"),
            })

    valid_count = len(monitor._enrollment_embeddings)
    min_valid = 3
    if valid_count >= min_valid:
        ref = monitor.embedding.aggregate_embeddings(monitor._enrollment_embeddings)
        if ref is not None:
            monitor._reference_embedding = ref
            monitor._reference_captured = True
            engine = _get_engine(attempt_id)
            engine._reference_embedding = ref
            engine._face_registered = True
            return jsonify({
                "success": True,
                "status": "ready",
                "captured": valid_count,
                "message": "Face enrolled from multiple frames.",
            })

    return jsonify({
        "success": False,
        "status": "error",
        "captured": valid_count,
        "message": f"Not enough valid frames ({valid_count}/{min_valid}).",
    }), 400


@app.route("/enroll-frame", methods=["POST"])
def enroll_frame():
    """Capture one enrollment frame.

    Body: { image: base64, attemptId }
    Returns enrollment progress.
    """
    data = request.get_json(force=True)
    image_b64 = data.get("image")
    attempt_id = data.get("attemptId", "default")

    if not image_b64:
        return jsonify({"error": "image (base64) is required"}), 400

    frame = _decode_image(image_b64)
    if frame is None:
        return jsonify({"error": "Could not decode image"}), 400

    from face_detection.utils.config import REFERENCE_CAPTURE_FRAMES

    monitor = _get_face_monitor(attempt_id)

    if not hasattr(monitor, "_enrollment_embeddings") or not hasattr(monitor, "enroll_start"):
        return jsonify({"error": "Face monitor not available"}), 500

    # Enrollment is a multi-frame session: the client calls this repeatedly
    # until the reference is ready. Restarting the batch on every call pinned
    # `captured` at 1 so enrollment never completed. An already-enrolled
    # attempt is idempotent; /reset starts a fresh session.
    if monitor.is_enrolled:
        return jsonify({
            "status": "ready",
            "captured": REFERENCE_CAPTURE_FRAMES,
            "required_frames": REFERENCE_CAPTURE_FRAMES,
            "face_detected": True,
            "face_count": 1,
            "quality": "good",
            "message": "Face already registered for this assessment.",
        })

    if not monitor._enrollment_embeddings:
        monitor.enroll_start()

    result = monitor.enroll_capture_frame(frame)

    if result.get("status") == "ready" and monitor._reference_embedding is not None:
        engine = _get_engine(attempt_id)
        engine._reference_embedding = monitor._reference_embedding
        engine._face_registered = True

    return jsonify(result)


@app.route("/enroll-status", methods=["POST"])
def enroll_status():
    """Check enrollment status for an attempt."""
    data = request.get_json(force=True)
    attempt_id = data.get("attemptId", "default")
    engine = _get_engine(attempt_id)
    return jsonify({
        "face_registered": engine._face_registered,
        "has_embedding": engine._reference_embedding is not None,
    })


@app.route("/verify-face", methods=["POST"])
def verify_face():
    """Verify face against registered reference."""
    data = request.get_json(force=True)
    image_b64 = data.get("image")
    attempt_id = data.get("attemptId", "default")

    if not image_b64:
        return jsonify({"error": "image (base64) is required"}), 400

    frame = _decode_image(image_b64)
    if frame is None:
        return jsonify({"error": "Could not decode image"}), 400

    engine = _get_engine(attempt_id)
    result = engine.face_verifier.verify(frame)
    return jsonify(result)


@app.route("/monitor", methods=["POST"])
def monitor():
    """Continuous monitoring endpoint.

    Body: { image: base64, attemptId, cameraActive: bool }
    Returns: face detection + identity verification + violation tracking.
    """
    data = request.get_json(force=True)
    image_b64 = data.get("image")
    attempt_id = data.get("attemptId", "default")
    camera_active = data.get("cameraActive", True)

    if not image_b64:
        return jsonify({"error": "image (base64) is required"}), 400

    frame = _decode_image(image_b64)
    if frame is None:
        return jsonify({"error": "Could not decode image"}), 400

    monitor_inst = _get_face_monitor(attempt_id)
    result = monitor_inst.monitor_frame(frame, camera_active=camera_active)

    return jsonify({
        "face_count": result["face_count"],
        "face_present": result["face_present"],
        "match": result["match"],
        "similarity": result["similarity"],
        "quality": result["quality"],
        "face_registered": result["face_registered"],
        "violations": result["violations"],
        "violation_count": result["violation_count"],
        "should_auto_submit": result["should_auto_submit"],
        "metrics": result["metrics"],
        "person_count": result.get("person_count", 0),
        "devices": result.get("devices", []),
        "device_detected": result.get("device_detected", False),
        "identity_blocked": result.get("identity_blocked", False),
        "identity_status": result.get("identity_status", "checking"),
        "identity_block_reason": result.get("identity_block_reason"),
        "identity_block_seconds": result.get("identity_block_seconds", 0.0),
        "info_logs": result["info_logs"],
    })


@app.route("/reset", methods=["POST"])
def reset():
    data = request.get_json(force=True)
    attempt_id = data.get("attemptId", "default")
    if attempt_id in _engines:
        _engines[attempt_id].reset()
        del _engines[attempt_id]
    fm_key = f"fm_{attempt_id}"
    if fm_key in _engines:
        _engines[fm_key].reset()
        del _engines[fm_key]
    return jsonify({"status": "reset", "attemptId": attempt_id})


@app.route("/enroll-reset", methods=["POST"])
def enroll_reset():
    """Discard any partial enrollment so a new one can be captured.

    /reset drops the whole monitor, which is heavier than needed when only the
    enrollment batch should be cleared.
    """
    data = request.get_json(force=True)
    attempt_id = data.get("attemptId", "default")
    monitor_inst = _get_face_monitor(attempt_id)
    monitor_inst.enroll_start()
    monitor_inst._reference_embedding = None
    monitor_inst._reference_captured = False
    return jsonify({"status": "reset", "attemptId": attempt_id})


@app.route("/state", methods=["POST"])
def state():
    """Return the full proctoring state for an attempt, including info logs."""
    data = request.get_json(force=True)
    attempt_id = data.get("attemptId", "default")
    monitor_inst = _get_face_monitor(attempt_id)
    return jsonify({
        "attemptId": attempt_id,
        "face_registered": monitor_inst.is_enrolled,
        "state": monitor_inst.get_state(),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PROCTORING_PORT", "5050"))
    print(f"Proctoring API starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
