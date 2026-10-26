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

### Windows

```bash
cd AIML
dev.bat setup
dev.bat serve
```

`setup` creates an isolated Python environment and installs dependencies. Run it
again when `requirements.txt` changes. `serve` starts both APIs:

- General API: http://localhost:5000
- Proctoring API: http://localhost:5050

Check http://localhost:5000/api/health to confirm that the service is running.
Keep the terminal open while developing; press **Ctrl+C** to stop the services.
See [GETTING_STARTED.md](./GETTING_STARTED.md) for Backend setup and macOS/Linux
instructions.

### Proctoring API Endpoints

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
| `PROCTORING_ALLOWED_ORIGINS` | `https://prep-genix-project.vercel.app,http://localhost:5173,http://127.0.0.1:5173` | Comma-separated browser origins allowed to call the proctoring API |
| `PHONE_CONFIDENCE` | `0.50` | YOLOv8 confidence threshold |
| `FACE_CONFIDENCE` | `0.60` | Face detection confidence threshold |

### Hosted performance defaults

The Docker image limits numerical-library threads and uses a smaller YOLO scene
input (`DEVICE_DETECTION_IMGSZ=416`). The service samples scene/object detection
every two active monitor cycles (`ACTIVE_SCENE_EVERY_N_CYCLES=2`) and every
three cycles in a quiet scene. Face and identity checks still run on each frame.
The frontend sends monitor frames every two seconds by default;
`VITE_FACE_CHECK_INTERVAL_MS` can tune this at build time from 1500 to 5000 ms.
These settings reduce CPU and network load while retaining temporal confirmation
for person and device detections.

The Docker Compose deployment runs the stateful proctoring API separately on
port 5050 with one Gunicorn worker and four request threads. Keep it at one
process per instance; the current enrollment and temporal-monitor state is
process-local. For a hosted frontend, set `VITE_PROCTORING_API` to the public
URL of this service and rebuild the frontend. If scaling to multiple instances,
add shared session state or session-affine routing first.

For a standalone hosted proctoring service, use this start command (replace
`$PORT` with the port variable required by the hosting provider):

```sh
gunicorn --bind 0.0.0.0:$PORT --workers 1 --worker-class gthread --threads 4 api.proctoring_api:app
```

If the frontend uses a different Vercel production domain or preview domain,
add its exact origin to `PROCTORING_ALLOWED_ORIGINS` in the hosting environment
and redeploy the proctoring service.

## Integration with Backend

The Express backend (`Backend/src/routes/proctoring.js`) calls the CLI script:

```javascript
// analyze_proctor.py is invoked via child_process.execFile
execFile(PYTHON, [ANALYZE_SCRIPT, "--image", tmpFile], ...)
```

The Flask `/monitor` API is the live face, identity, attention, and object
monitor used by the frontend. The backend's `/api/proctoring/analyze` route is
a separate one-shot CLI analysis path.

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
