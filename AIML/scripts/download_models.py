"""Download required pretrained models for proctoring.

Usage:
  python AIML/scripts/download_models.py

Downloads:
  - YOLOv8-nano (COCO pretrained) for person + device detection
  - OpenCV Haar Cascade (bundled with opencv-python)
"""

import os
import sys

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


def ensure_dir():
    os.makedirs(MODELS_DIR, exist_ok=True)
    print(f"[OK] Models directory: {os.path.abspath(MODELS_DIR)}")


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
        import shutil
        cache_path = os.path.join(os.path.expanduser("~"), ".cache", "ultralytics", "yolov8n.pt")
        if os.path.exists(cache_path):
            shutil.copy2(cache_path, yolo_path)
        elif os.path.exists("yolov8n.pt"):
            shutil.move("yolov8n.pt", yolo_path)
        print("[OK] YOLOv8-nano downloaded")
        return True
    except ImportError:
        print("[!!] ultralytics not installed — pip install ultralytics")
        return False
    except Exception as e:
        print(f"[!!] YOLOv8 download failed: {e}")
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
    results.append(("Face detector", check_haar()))
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
