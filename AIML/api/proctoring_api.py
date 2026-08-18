"""Flask API for AI proctoring: face detection + phone/object detection.

Run:
  cd AIML && python -m api.proctoring_api

Endpoints:
  POST /analyze  { image: base64, audio: base64 } -> detection results
  GET  /health   -> { status: "ok" }
"""

import base64
import json
import math
import os
import struct
import sys
import tempfile
import wave

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PHONE_CONFIDENCE_THRESHOLD = float(os.environ.get("PHONE_CONFIDENCE", "0.50"))
FACE_CONFIDENCE_THRESHOLD = float(os.environ.get("FACE_CONFIDENCE", "0.60"))
PROHIBITED_OBJECTS = ["cell phone", "mobile phone", "phone", "remote", "keyboard", "laptop", "tablet"]

# Lazy-load models on first request
_face_cascade = None
_yolo_model = None


def get_face_cascade():
    global _face_cascade
    if _face_cascade is None:
        import cv2
        _face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
    return _face_cascade


def get_yolo_model():
    global _yolo_model
    if _yolo_model is None:
        try:
            from ultralytics import YOLO
            model_path = os.path.join(os.path.dirname(__file__), "..", "models", "yolov8n.pt")
            if os.path.exists(model_path):
                _yolo_model = YOLO(model_path)
            else:
                _yolo_model = YOLO("yolov8n.pt")
        except ImportError:
            _yolo_model = False
    return _yolo_model


# ---------------------------------------------------------------------------
# Face detection
# ---------------------------------------------------------------------------
def analyze_face(image_path):
    try:
        import cv2
    except ImportError:
        return {"error": "opencv-python not available"}

    img = cv2.imread(image_path)
    if img is None:
        return {"error": "Could not read image"}

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    cascade = get_face_cascade()
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    count = int(len(faces))

    return {
        "faces": count,
        "facePresent": count >= 1,
        "multipleFaces": count > 1,
        "note": "" if count <= 1 else f"{count} faces detected",
    }


# ---------------------------------------------------------------------------
# Phone / object detection via YOLOv8-nano
# ---------------------------------------------------------------------------
def detect_objects(image_path):
    model = get_yolo_model()
    if not model or model is False:
        return {"error": "YOLOv8 not available", "objects": [], "phoneDetected": False}

    try:
        results = model(image_path, conf=PHONE_CONFIDENCE_THRESHOLD, verbose=False)
    except Exception as e:
        return {"error": str(e), "objects": [], "phoneDetected": False}

    detections = []
    phone_detected = False
    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            cls_name = r.names.get(cls_id, str(cls_id))
            conf = float(box.conf[0])
            det = {"class": cls_name, "confidence": round(conf, 3)}
            detections.append(det)
            if cls_name.lower() in PROHIBITED_OBJECTS or any(p in cls_name.lower() for p in ["phone", "cell"]):
                phone_detected = True

    return {
        "objects": detections,
        "phoneDetected": phone_detected,
        "count": len(detections),
    }


# ---------------------------------------------------------------------------
# Audio analysis (reused from existing analyze_proctor.py)
# ---------------------------------------------------------------------------
def analyze_audio(path):
    try:
        with wave.open(path, "rb") as w:
            params = w.getparams()
            nch, sampwidth, framerate, nframes = (
                params.nchannels, params.sampwidth, params.framerate, params.nframes,
            )
            if sampwidth not in (1, 2):
                return {"error": f"Unsupported sample width {sampwidth}"}
            raw = w.readframes(nframes)
    except Exception as e:
        return {"error": f"Could not read audio: {e}"}

    if sampwidth == 2:
        samples = struct.unpack(f"<{len(raw) // 2}h", raw[: (len(raw) // 2) * 2])
    else:
        samples = [b - 128 for b in raw]

    if nch > 1:
        samples = samples[::nch]

    if not samples:
        return {"error": "Empty audio"}

    frame_len = max(1, int(framerate * 0.02))
    voiced_frames = 0
    total_frames = 0
    peak = 0.0
    for start in range(0, len(samples) - frame_len + 1, frame_len):
        frame = samples[start: start + frame_len]
        rms = math.sqrt(sum(s * s for s in frame) / len(frame)) if frame else 0.0
        peak = max(peak, rms)
        if rms > 500:
            voiced_frames += 1
        total_frames += 1

    voiced_ratio = (voiced_frames / total_frames) if total_frames else 0.0
    voice_detected = voiced_ratio > 0.15 and peak > 800
    return {
        "voiceDetected": voice_detected,
        "voicedRatio": round(voiced_ratio, 3),
        "rms": round(peak, 1),
        "note": "Speech-like energy detected" if voice_detected else "",
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "proctoring-api"})


@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json(force=True)
    image_b64 = data.get("image")
    audio_b64 = data.get("audio")

    result = {"image": None, "objects": None, "audio": None, "violations": []}

    # Image analysis
    if image_b64:
        tmp = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
                f.write(base64.b64decode(image_b64))
                tmp = f.name
            result["image"] = analyze_face(tmp)
            result["objects"] = detect_objects(tmp)
        except Exception as e:
            result["image"] = {"error": str(e)}
        finally:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)

        img = result["image"]
        if img and not img.get("error"):
            if img.get("multipleFaces"):
                result["violations"].append({
                    "type": "multiple_faces",
                    "description": f"Multiple faces detected ({img['faces']}).",
                    "confidence": 0.9,
                })
            elif img.get("facePresent") is False:
                result["violations"].append({
                    "type": "no_face",
                    "description": "No face detected in webcam frame.",
                    "confidence": 0.85,
                })

        objs = result.get("objects", {})
        if objs and objs.get("phoneDetected"):
            result["violations"].append({
                "type": "phone_detected",
                "description": "Mobile phone or prohibited device detected.",
                "confidence": max((d["confidence"] for d in objs.get("objects", []) if "phone" in d.get("class", "").lower()), default=0.7),
            })

    # Audio analysis
    if audio_b64:
        tmp = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                f.write(base64.b64decode(audio_b64))
                tmp = f.name
            result["audio"] = analyze_audio(tmp)
        except Exception as e:
            result["audio"] = {"error": str(e)}
        finally:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)

        au = result["audio"]
        if au and not au.get("error") and au.get("voiceDetected"):
            result["violations"].append({
                "type": "voice_detected",
                "description": "Speech detected in test environment.",
                "confidence": min(0.95, au.get("voicedRatio", 0.5) + 0.3),
            })

    return jsonify(result)


if __name__ == "__main__":
    port = int(os.environ.get("PROCTORING_PORT", "5050"))
    print(f"Proctoring API starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
