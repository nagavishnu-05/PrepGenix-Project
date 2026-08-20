"""Automated tests for face detector."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "AIML"))

import cv2
import numpy as np


def create_test_face_image():
    """Create a synthetic test image with a face-like rectangle."""
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:] = (180, 160, 140)
    cv2.ellipse(img, (320, 240), (80, 100), 0, 0, 360, (200, 180, 160), -1)
    cv2.circle(img, (290, 220), 10, (50, 50, 50), -1)
    cv2.circle(img, (350, 220), 10, (50, 50, 50), -1)
    cv2.ellipse(img, (320, 280), (20, 10), 0, 0, 180, (100, 80, 80), 2)
    return img


def test_no_face():
    print("test_no_face...", end=" ")
    sys.path.insert(0, str(ROOT / "AIML"))
    from face_detection.inference.face_detector import FaceDetector
    detector = FaceDetector()
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    result = detector.detect(img)
    assert result["face_count"] == 0, f"Expected 0 faces, got {result['face_count']}"
    assert not result["face_present"]
    assert not result["multiple_faces"]
    print("PASSED")


def test_single_face():
    print("test_single_face...", end=" ")
    from face_detection.inference.face_detector import FaceDetector
    detector = FaceDetector()
    img = create_test_face_image()
    result = detector.detect(img)
    print(f"(detected {result['face_count']} face(s)) PASSED")


def test_multiple_faces():
    print("test_multiple_faces...", end=" ")
    from face_detection.inference.face_detector import FaceDetector
    detector = FaceDetector()
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:] = (180, 160, 140)
    for cx in [160, 480]:
        cv2.ellipse(img, (cx, 240), (60, 80), 0, 0, 360, (200, 180, 160), -1)
        cv2.circle(img, (cx - 20, 220), 8, (50, 50, 50), -1)
        cv2.circle(img, (cx + 20, 220), 8, (50, 50, 50), -1)
    result = detector.detect(img)
    print(f"(detected {result['face_count']} face(s)) PASSED")


def test_empty_frame():
    print("test_empty_frame...", end=" ")
    from face_detection.inference.face_detector import FaceDetector
    detector = FaceDetector()
    result = detector.detect(None)
    assert result["face_count"] == 0
    assert not result["face_present"]
    print("PASSED")


def test_confidence_threshold():
    print("test_confidence_threshold...", end=" ")
    from face_detection.inference.face_detector import FaceDetector
    high_det = FaceDetector(confidence_threshold=0.99)
    low_det = FaceDetector(confidence_threshold=0.01)
    img = create_test_face_image()
    high_result = high_det.detect(img)
    low_result = low_det.detect(img)
    assert high_result["face_count"] <= low_result["face_count"]
    print(f"(high_th={high_result['face_count']}, low_th={low_result['face_count']}) PASSED")


if __name__ == "__main__":
    print("=" * 60)
    print("Face Detector Tests")
    print("=" * 60)
    test_no_face()
    test_single_face()
    test_multiple_faces()
    test_empty_frame()
    test_confidence_threshold()
    print("\nAll tests passed!")
