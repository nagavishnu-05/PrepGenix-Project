"""Modern face detector with multiple backend support.

Backends (tried in order):
  1. InsightFace (RetinaFace ONNX via onnxruntime) if available
  2. OpenCV DNN (Caffe SSD) if model file exists
  3. OpenCV Haar Cascade (always available, fallback)

All backends return the same interface.
"""

import os
import logging
from pathlib import Path

import cv2
import numpy as np

from ..utils.config import FACE_DETECTION_CONFIDENCE, MIN_FACE_SIZE_PX, FACE_DETECTOR_DIR

logger = logging.getLogger(__name__)

INSIGHTFACE_AVAILABLE = False
try:
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    pass


class FaceDetector:
    """Production face detector that auto-selects the best available backend."""

    def __init__(self, confidence_threshold: float | None = None):
        self.confidence = confidence_threshold or FACE_DETECTION_CONFIDENCE
        self._backend = None
        self._insightface_app = None
        self._cascade = None
        self._cvnet = None
        self._init_backend()

    def _init_backend(self):
        if INSIGHTFACE_AVAILABLE:
            try:
                providers = ["CPUExecutionProvider"]
                if os.environ.get("USE_GPU", "false").lower() == "true":
                    providers.insert(0, "CUDAExecutionProvider")
                app = FaceAnalysis(
                    name="buffalo_l",
                    providers=providers,
                    allowed_modules=["detection"],
                )
                app.prepare(ctx_id=0, det_size=(640, 640))
                self._insightface_app = app
                self._backend = "insightface"
                logger.info("Face detector backend: InsightFace RetinaFace")
                return
            except Exception as e:
                logger.warning(f"InsightFace init failed, trying fallback: {e}")

        ssd_path = FACE_DETECTOR_DIR / "opencv_face_detector_uint8.pb"
        ssd_cfg = FACE_DETECTOR_DIR / "opencv_face_detector.pbtxt"
        if ssd_path.exists() and ssd_cfg.exists():
            try:
                self._cvnet = cv2.dnn.readNetFromTensorflow(str(ssd_path), str(ssd_cfg))
                self._backend = "opencv_dnn"
                logger.info("Face detector backend: OpenCV DNN (SSD)")
                return
            except Exception as e:
                logger.warning(f"OpenCV DNN init failed: {e}")

        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self._cascade = cv2.CascadeClassifier(cascade_path)
        self._backend = "haar_cascade"
        logger.info("Face detector backend: Haar Cascade")

    @property
    def backend_name(self) -> str:
        return self._backend or "unknown"

    def detect(self, frame: np.ndarray) -> dict:
        """Detect faces in an image.

        Returns:
            {
                "faces": [{"bbox": [x1,y1,x2,y2], "confidence": float, "landmarks": ...}],
                "face_count": int,
                "face_present": bool,
                "multiple_faces": bool
            }
        """
        if frame is None or frame.size == 0:
            return self._empty_result()

        if self._backend == "insightface":
            return self._detect_insightface(frame)
        elif self._backend == "opencv_dnn":
            return self._detect_opencv_dnn(frame)
        else:
            return self._detect_haar(frame)

    def detect_best_face(self, frame: np.ndarray) -> dict | None:
        """Return the single highest-confidence face, or None."""
        result = self.detect(frame)
        if not result["faces"]:
            return None
        return max(result["faces"], key=lambda f: f["confidence"])

    def _detect_insightface(self, frame: np.ndarray) -> dict:
        try:
            faces = self._insightface_app.get(frame)
            detections = []
            for face in faces:
                if face.det_score < self.confidence:
                    continue
                bbox = face.bbox.astype(int).tolist()
                detections.append({
                    "bbox": [int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])],
                    "confidence": round(float(face.det_score), 4),
                    "landmarks": face.kps.tolist() if hasattr(face, "kps") and face.kps is not None else None,
                    "embedding": face.normed_embedding.tolist() if hasattr(face, "normed_embedding") and face.normed_embedding is not None else None,
                })
            return {
                "faces": detections,
                "face_count": len(detections),
                "face_present": len(detections) >= 1,
                "multiple_faces": len(detections) > 1,
            }
        except Exception as e:
            logger.error(f"InsightFace detection error: {e}")
            return self._detect_haar(frame)

    def _detect_opencv_dnn(self, frame: np.ndarray) -> dict:
        h, w = frame.shape[:2]
        blob = cv2.dnn.blobFromImage(cv2.resize(frame, (300, 300)), 1.0, (300, 300), (104.0, 177.0, 123.0))
        self._cvnet.setInput(blob)
        dets = self._cvnet.forward()
        detections = []
        for i in range(dets.shape[2]):
            conf = float(dets[0, 0, i, 2])
            if conf < self.confidence:
                continue
            x1 = max(0, int(dets[0, 0, i, 3] * w))
            y1 = max(0, int(dets[0, 0, i, 4] * h))
            x2 = min(w, int(dets[0, 0, i, 5] * w))
            y2 = min(h, int(dets[0, 0, i, 6] * h))
            if (x2 - x1) >= MIN_FACE_SIZE_PX and (y2 - y1) >= MIN_FACE_SIZE_PX:
                detections.append({
                    "bbox": [x1, y1, x2, y2],
                    "confidence": round(conf, 4),
                    "landmarks": None,
                    "embedding": None,
                })
        return {
            "faces": detections,
            "face_count": len(detections),
            "face_present": len(detections) >= 1,
            "multiple_faces": len(detections) > 1,
        }

    def _detect_haar(self, frame: np.ndarray) -> dict:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        faces_raw = self._cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(MIN_FACE_SIZE_PX, MIN_FACE_SIZE_PX)
        )
        h, w = frame.shape[:2]
        detections = []
        for (fx, fy, fw, fh) in faces_raw:
            x1, y1 = int(fx), int(fy)
            x2, y2 = x1 + int(fw), y1 + int(fh)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            detections.append({
                "bbox": [x1, y1, x2, y2],
                "confidence": 0.9,
                "landmarks": None,
                "embedding": None,
            })
        return {
            "faces": detections,
            "face_count": len(detections),
            "face_present": len(detections) >= 1,
            "multiple_faces": len(detections) > 1,
        }

    def _empty_result(self) -> dict:
        return {"faces": [], "face_count": 0, "face_present": False, "multiple_faces": False}
