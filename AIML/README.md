# AIML Module — AI Proctoring

AI-powered proctoring engine for the PrepGenix examination platform.

## Architecture

```
AIML/
├── api/
│   └── proctoring_api.py      # Flask REST API (face + phone detection)
├── scripts/
│   └── analyze_proctor.py      # CLI script (face + audio analysis)
├── models/
│   ├── places365/              # Places365 scene classifier (scene recognition)
│   └── yolov8n.pt             # YOLOv8-nano (auto-downloaded on first use)
├── data/
│   └── places365/              # Scene classification training data (3000 images)
├── notebooks/                  # Jupyter training notebooks
└── requirements.txt            # Python dependencies
```

## Detection Capabilities

| Capability | Model | Backend Route | Status |
|---|---|---|---|
| Face detection | Haar Cascade (OpenCV) | `analyze_proctor.py --image` | Active |
| Multiple faces | Haar Cascade (OpenCV) | `analyze_proctor.py --image` | Active |
| No face detected | Haar Cascade (OpenCV) | `analyze_proctor.py --image` | Active |
| Voice/speech detection | RMS energy analysis | `analyze_proctor.py --audio` | Active |
| Phone detection | YOLOv8-nano | `proctoring_api.py /analyze` | Active |
| Prohibited objects | YOLOv8-nano | `proctoring_api.py /analyze` | Active |
| Scene classification | Places365 (Keras) | training notebooks | Experimental |

## Quick Start

### Setup Virtual Environment

```bash
cd AIML
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

### Run Flask API (standalone)

```bash
cd AIML
python -m api.proctoring_api
# API starts on http://localhost:5050
```

### API Endpoints

#### `POST /analyze`

Send base64-encoded image and/or audio for proctoring analysis.

**Request:**
```json
{
  "image": "<base64 JPEG>",
  "audio": "<base64 WAV>"
}
```

**Response:**
```json
{
  "image": {
    "faces": 1,
    "facePresent": true,
    "multipleFaces": false,
    "note": ""
  },
  "objects": {
    "objects": [{"class": "person", "confidence": 0.89}],
    "phoneDetected": false,
    "count": 1
  },
  "audio": {
    "voiceDetected": false,
    "voicedRatio": 0.023,
    "rms": 412.5,
    "note": ""
  },
  "violations": []
}
```

#### `GET /health`

Returns `{"status": "ok", "service": "proctoring-api"}`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PROCTORING_PORT` | `5050` | Flask API port |
| `PHONE_CONFIDENCE` | `0.50` | YOLOv8 confidence threshold |
| `FACE_CONFIDENCE` | `0.60` | Face detection confidence threshold |

## Integration with Backend

The Express backend (`Backend/src/routes/proctoring.js`) calls the CLI script:

```javascript
// analyze_proctor.py is invoked via child_process.execFile
execFile(PYTHON, [ANALYZE_SCRIPT, "--image", tmpFile], ...)
```

The Flask API is an optional alternative for richer object detection (phone, etc.).

## Prohibited Objects (YOLOv8)

- Cell phone / mobile phone
- Tablet
- Laptop
- Remote control
- External keyboard

## Models

- **Haar Cascade** — bundled with OpenCV (`haarcascade_frontalface_default.xml`)
- **YOLOv8-nano** — downloaded automatically on first API call (~6MB)
- **Places365** — pre-trained scene classifier in `models/places365/` (~21MB Keras model)

## Violation Types

| Type | Severity | Auto-submit? |
|---|---|---|
| `fullscreen_exit` | high | Yes |
| `multiple_faces` | high | Yes |
| `phone_detected` | high | Yes |
| `dev_tools` | high | Yes |
| `screen_capture` | high | Yes |
| `voice_detected` | high | No |
| `no_face` | medium | No |
| `tab_switch` | medium | No |
| `window_blur` | medium | No |
| `right_click` | medium | No |
| `copy_attempt` | medium | No |
| `paste_attempt` | medium | No |
| `camera_lost` | high | No |
| `mic_lost` | high | No |
| `looking_away` | low | No |
