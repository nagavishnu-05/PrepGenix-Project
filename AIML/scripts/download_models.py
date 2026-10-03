"""Download required pretrained models for proctoring.

Usage:
  python AIML/scripts/download_models.py

Downloads:
  - YOLOv8-nano (COCO pretrained) for person + device detection
  - YOLOv8-nano-face for detection under difficult conditions
  - MediaPipe face_landmarker.task for 478-point facial landmarks
  - OpenCV Haar Cascade (bundled with opencv-python)
"""

import os
import sys

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


def ensure_dir():
    os.makedirs(MODELS_DIR, exist_ok=True)
    print(f"[OK] Models directory: {os.path.abspath(MODELS_DIR)}")


def _promote_cached(filename: str, dest: str) -> bool:
    import shutil
    candidates = [
        os.path.join(os.path.expanduser("~"), ".cache", "ultralytics", filename),
        filename,
    ]
    for cache_path in candidates:
        if os.path.exists(cache_path):
            shutil.copy2(cache_path, dest)
            return True
    return False


def download_yolo():
    yolo_path = os.path.join(MODELS_DIR, "yolov8n.pt")
    if os.path.exists(yolo_path):
        size_mb = os.path.getsize(yolo_path) / (1024 * 1024)
        print(f"[OK] YOLOv8-nano available ({size_mb:.1f} MB)")
        return True

    try:
        from ultralytics import YOLO
        print("[..] Downloading YOLOv8-nano (~6 MB)...")
        model = YOLO("yolov8n.pt")
        if _promote_cached("yolov8n.pt", yolo_path):
            print("[OK] YOLOv8-nano downloaded")
        else:
            print(f"[!!] YOLOv8-nano downloaded but not found at {yolo_path}")
        return True
    except ImportError:
        print("[!!] ultralytics not installed — pip install ultralytics")
        return False
    except Exception as e:
        print(f"[!!] YOLOv8 download failed: {e}")
        return False


def download_yolo_face():
    face_dir = os.path.join(MODELS_DIR, "face_detection")
    os.makedirs(face_dir, exist_ok=True)
    model_name = os.environ.get("YOLO_FACE_MODEL", "yolov8n-face.pt")
    face_path = os.path.join(face_dir, model_name)

    if os.path.exists(face_path):
        size_mb = os.path.getsize(face_path) / (1024 * 1024)
        print(f"[OK] YOLO face model available ({size_mb:.1f} MB)")
        return True

    try:
        from ultralytics import YOLO
        print(f"[..] Downloading {model_name} (~6 MB)...")
        model = YOLO(model_name)
        if _promote_cached(model_name, face_path):
            print("[OK] YOLO face model downloaded")
        else:
            print(f"[!!] Downloaded but not found at {face_path}")
        return True
    except ImportError:
        print("[!!] ultralytics not installed — pip install ultralytics")
        return False
    except Exception as e:
        print(f"[!!] YOLO face model download failed: {e}")
        return False


def download_face_landmarker():
    """MediaPipe Face Landmarker bundle (478 landmarks incl. iris)."""
    face_dir = os.path.join(MODELS_DIR, "face_detection")
    os.makedirs(face_dir, exist_ok=True)
    model_path = os.path.join(face_dir, "face_landmarker.task")

    if os.path.exists(model_path):
        size_mb = os.path.getsize(model_path) / (1024 * 1024)
        print(f"[OK] MediaPipe face_landmarker.task available ({size_mb:.1f} MB)")
        return True

    urls = [
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    ]

    try:
        import urllib.request
    except ImportError:
        print("[!!] urllib unavailable")
        return False

    for url in urls:
        try:
            print(f"[..] Downloading face_landmarker.task from {url.rsplit('/', 4)[-4]}...")
            urllib.request.urlretrieve(url, model_path)
            size_mb = os.path.getsize(model_path) / (1024 * 1024)
            print(f"[OK] MediaPipe face_landmarker.task downloaded ({size_mb:.1f} MB)")
            return True
        except Exception as e:
            print(f"[!!] Download failed: {e}")
            continue

    print(f"[!!] Could not download face_landmarker.task — place it at {model_path}")
    return False


def check_mediapipe():
    try:
        import mediapipe
        print(f"[OK] mediapipe {mediapipe.__version__} installed")
        return True
    except ImportError:
        print("[!!] mediapipe not installed — pip install mediapipe")
        return False


def check_haar():
    try:
        import cv2
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        if cascade.empty():
            print("[!!] Haar Cascade failed to load")
            return False
        print("[OK] Haar Cascade face detector available (OpenCV bundled)")
        return True
    except ImportError:
        print("[!!] opencv-python not installed — pip install opencv-python")
        return False


def check_custom_device_model():
    custom_path = os.path.join(MODELS_DIR, "device_detector.pt")
    if os.path.exists(custom_path):
        size_mb = os.path.getsize(custom_path) / (1024 * 1024)
        print(f"[OK] Custom device detector available ({size_mb:.1f} MB)")
        return True
    print("[--] No custom device detector (using COCO pretrained)")
    return True


def main():
    print("=" * 50)
    print("  Proctoring Model Check")
    print("=" * 50)
    ensure_dir()

    results = []
    results.append(("MediaPipe runtime", check_mediapipe()))
    results.append(("Face landmarker model", download_face_landmarker()))
    results.append(("Face detector", check_haar()))
    results.append(("YOLO face fallback", download_yolo_face()))
    results.append(("Person detector", download_yolo()))
    results.append(("Device detector", check_custom_device_model()))

    print("\n" + "=" * 50)
    all_ok = all(ok for _, ok in results)
    if all_ok:
        print("  All proctoring models ready")
    else:
        print("  Some models need attention")
    print("=" * 50)
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
