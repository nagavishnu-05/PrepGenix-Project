"""Face identity verification using OpenCV histogram comparison.

Compares a reference face (captured at test start) against each frame
during the exam to detect if a different person is taking the test.

Uses HSV histogram comparison of the detected face region.
"""

import cv2
import numpy as np
from .face_detector import FaceDetector

HIST_BINS = [50, 60, 64]
HIST_RANGE = [0, 180, 0, 256, 0, 256]
SIMILARITY_THRESHOLD = float(__import__("os").environ.get("FACE_SIMILARITY_THRESHOLD", "0.45"))
IMPOSTER_CONFIRM_FRAMES = int(__import__("os").environ.get("IMPOSTER_CONFIRMATION_FRAMES", "3"))


class FaceVerifier:
    def __init__(self, similarity_threshold: float = SIMILARITY_THRESHOLD):
        self.face_detector = FaceDetector()
        self.similarity_threshold = similarity_threshold
        self._reference_histogram = None
        self._reference_set = False

    def register(self, frame: np.ndarray) -> dict:
        """Register a reference face from the initial frame.

        Returns dict with success status, face count, and quality info.
        """
        result = self.face_detector.detect(frame)
        if not result.get("facePresent"):
            return {"success": False, "error": "no_face", "message": "No face detected in registration frame"}

        if result.get("multipleFaces"):
            return {"success": False, "error": "multiple_faces", "message": "Multiple faces detected — please ensure only you are visible"}

        box = result["boxes"][0]
        face_crop = self._crop_face(frame, box)
        if face_crop is None:
            return {"success": False, "error": "crop_failed", "message": "Failed to extract face region"}

        self._reference_histogram = self._compute_histogram(face_crop)
        self._reference_set = True

        return {
            "success": True,
            "faceCount": result["faces"],
            "box": box,
            "quality": self._assess_face_quality(face_crop),
        }

    def verify(self, frame: np.ndarray) -> dict:
        """Verify that the face in the current frame matches the registered reference.

        Returns dict with match status, similarity score, and imposter flag.
        """
        if not self._reference_set or self._reference_histogram is None:
            return {"match": True, "similarity": None, "imposter": False, "reason": "no_reference"}

        result = self.face_detector.detect(frame)

        if not result.get("facePresent"):
            return {"match": True, "similarity": None, "imposter": False, "reason": "no_face"}

        box = result["boxes"][0]
        face_crop = self._crop_face(frame, box)
        if face_crop is None:
            return {"match": True, "similarity": None, "imposter": False, "reason": "crop_failed"}

        current_histogram = self._compute_histogram(face_crop)
        similarity = self._compare_histograms(self._reference_histogram, current_histogram)

        is_imposter = similarity < self.similarity_threshold

        return {
            "match": not is_imposter,
            "similarity": round(float(similarity), 4),
            "threshold": self.similarity_threshold,
            "imposter": is_imposter,
            "reason": "IMPOSTER_DETECTED" if is_imposter else "verified",
        }

    def register_from_base64(self, image_b64: str) -> dict:
        """Register from a base64-encoded JPEG image."""
        frame = self._decode_b64(image_b64)
        if frame is None:
            return {"success": False, "error": "decode_failed", "message": "Could not decode image"}
        return self.register(frame)

    def verify_from_base64(self, image_b64: str) -> dict:
        """Verify from a base64-encoded JPEG image."""
        frame = self._decode_b64(image_b64)
        if frame is None:
            return {"match": True, "similarity": None, "imposter": False, "reason": "decode_failed"}
        return self.verify(frame)

    def _crop_face(self, frame: np.ndarray, box: dict, padding: float = 0.2) -> np.ndarray | None:
        """Crop face region with padding from the frame."""
        h, w = frame.shape[:2]
        x = int(box.get("x", 0))
        y = int(box.get("y", 0))
        fw = int(box.get("w", 0))
        fh = int(box.get("h", 0))
        if fw <= 0 or fh <= 0:
            return None

        pad_x = int(fw * padding)
        pad_y = int(fh * padding)
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(w, x + fw + pad_x)
        y2 = min(h, y + fh + pad_y)

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        return crop

    def _compute_histogram(self, face_crop: np.ndarray) -> np.ndarray:
        """Compute a normalized HSV histogram of the face crop."""
        hsv = cv2.cvtColor(face_crop, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1, 2], None, HIST_BINS, HIST_RANGE)
        cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)
        return hist

    def _compare_histograms(self, hist1: np.ndarray, hist2: np.ndarray) -> float:
        """Compare two histograms using correlation (returns -1 to 1, higher = more similar)."""
        return cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)

    def _assess_face_quality(self, face_crop: np.ndarray) -> str:
        """Simple quality assessment based on blur detection."""
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        if laplacian_var < 50:
            return "blurry"
        if laplacian_var < 100:
            return "acceptable"
        return "good"

    def _decode_b64(self, b64: str) -> np.ndarray | None:
        """Decode a base64 string to an OpenCV image."""
        try:
            import base64
            raw = base64.b64decode(b64)
            arr = np.frombuffer(raw, dtype=np.uint8)
            return cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def reset(self):
        self._reference_histogram = None
        self._reference_set = False
