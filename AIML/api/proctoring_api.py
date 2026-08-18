"""Flask API for AI proctoring with temporal confirmation.

Run:
  cd AIML && python -m api.proctoring_api

Endpoints:
  POST /analyze       { image: base64 } -> detection results with temporal confirmation
  POST /analyze/frame { image: base64 } -> same, shorter alias
  POST /reset         -> reset engine state for new attempt
  GET  /health        -> status check

Temporal confirmation:
  Violations must persist for N consecutive frames before auto-submit is triggered.
  N is configurable via environment variables.
"""

import base64
import os
import sys
import tempfile

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


def _decode_image(b64: str):
    import numpy as np
    import cv2
    raw = base64.b64decode(b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "proctoring-api", "engines": len(_engines)})


@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json(force=True)
    image_b64 = data.get("image")
    attempt_id = data.get("attemptId", "default")

    if not image_b64:
        return jsonify({"error": "image (base64) is required"}), 400

    engine = _get_engine(attempt_id)
    frame = None
    try:
        frame = _decode_image(image_b64)
    except Exception as e:
        return jsonify({"error": f"Failed to decode image: {e}"}), 400

    if frame is None:
        return jsonify({"error": "Could not decode image"}), 400

    result = engine.analyze(frame)

    return jsonify({
        "analysis": {
            "face": result["face"],
            "person": result["person"],
            "device": result["device"],
        },
        "violations": result["violations"],
        "autoSubmitted": result["autoSubmit"],
        "cheatingReason": result["cheatingReason"],
        "confirmationProgress": result["confirmationProgress"],
        "confirmedViolations": result["confirmedViolations"],
    })


@app.route("/analyze/frame", methods=["POST"])
def analyze_frame():
    return analyze()


@app.route("/reset", methods=["POST"])
def reset():
    data = request.get_json(force=True)
    attempt_id = data.get("attemptId", "default")
    if attempt_id in _engines:
        _engines[attempt_id].reset()
        del _engines[attempt_id]
    return jsonify({"status": "reset", "attemptId": attempt_id})


if __name__ == "__main__":
    port = int(os.environ.get("PROCTORING_PORT", "5050"))
    print(f"Proctoring API starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
