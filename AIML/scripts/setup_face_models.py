"""Download required pretrained models for face detection and recognition.

Usage:
  python AIML/scripts/setup_face_models.py

Downloads to:
  AIML/models/face_detector/   - OpenCV DNN face detector (optional)
  AIML/models/face_recognition/ - ArcFace ONNX model (optional)

Falls back gracefully if downloads fail.
"""

import os
import sys
import urllib.request
import ssl
from pathlib import Path

AIML_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = AIML_ROOT / "models"
FACE_DETECTOR_DIR = MODELS_DIR / "face_detector"
FACE_RECOGNITION_DIR = MODELS_DIR / "face_recognition"


def download_file(url: str, dest: Path, desc: str = "") -> bool:
    if dest.exists():
        print(f"  [skip] {desc or dest.name} already exists")
        return True
    print(f"  [download] {desc or dest.name} ...")
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        dest.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, str(dest))
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"  [done] {desc or dest.name} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        print(f"  [error] Failed to download {desc or dest.name}: {e}")
        if dest.exists():
            dest.unlink()
        return False


def main():
    print("=" * 60)
    print("Face Detection Model Setup")
    print("=" * 60)

    FACE_DETECTOR_DIR.mkdir(parents=True, exist_ok=True)
    FACE_RECOGNITION_DIR.mkdir(parents=True, exist_ok=True)

    print("\n1. OpenCV Haar Cascade (built-in, no download needed)")
    import cv2
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    print(f"  [ok] Haar Cascade: {cascade_path}")

    print("\n2. OpenCV DNN SSD Face Detector (optional)")
    ssd_pb = FACE_DETECTOR_DIR / "opencv_face_detector_uint8.pb"
    ssd_cfg = FACE_DETECTOR_DIR / "opencv_face_detector.pbtxt"
    download_file(
        "https://github.com/opencv/opencv_3rdparty/raw/dnn_samples_face_detector_20170830/opencv_face_detector_uint8.pb",
        ssd_pb, "OpenCV DNN face detector weights"
    )
    download_file(
        "https://raw.githubusercontent.com/opencv/opencv/master/samples/dnn/face_detector/opencv_face_detector.pbtxt",
        ssd_cfg, "OpenCV DNN face detector config"
    )

    print("\n3. InsightFace Models (auto-downloaded on first use)")
    print("  InsightFace models (buffalo_l) are auto-downloaded by the insightface package.")
    print("  No manual download needed.")

    print("\n4. ArcFace ONNX Model (optional)")
    arcface_onnx = FACE_RECOGNITION_DIR / "arcface_r100.onnx"
    if not arcface_onnx.exists():
        print("  [info] ArcFace ONNX model not found.")
        print("  The system will use InsightFace or histogram fallback.")
        print("  To use ONNX ArcFace, download arcface_r100.onnx to:")
        print(f"  {FACE_RECOGNITION_DIR}")
    else:
        print(f"  [ok] ArcFace ONNX: {arcface_onnx}")

    print("\n" + "=" * 60)
    print("Setup complete!")
    print("Available backends:")
    try:
        from insightface.app import FaceAnalysis
        print("  - InsightFace (RetinaFace + ArcFace) [BEST]")
    except ImportError:
        print("  - InsightFace: NOT INSTALLED (pip install insightface)")
    if ssd_pb.exists() and ssd_cfg.exists():
        print("  - OpenCV DNN (SSD) [GOOD]")
    print("  - OpenCV Haar Cascade [FALLBACK]")
    print("=" * 60)


if __name__ == "__main__":
    main()
