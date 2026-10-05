"""Modern face detector with multiple backend support.

Backends (tried in order):
  1. MediaPipe Face Landmarker (short-range detector + landmarks, multi-face)
  2. InsightFace (RetinaFace ONNX via onnxruntime) if available
  3. OpenCV DNN (Caffe SSD) if model file exists
  4. OpenCV Haar Cascade (always available, fallback)

All backends return the same interface.
"""

import logging
import os
from pathlib import Path

import cv2
import numpy as np

from ..utils.config import (
    FACE_DETECTION_CONFIDENCE,
    FACE_DETECT_SIZE,
    FACE_DETECTOR_BACKEND,
    FACE_DETECTOR_DIR,
    MEDIAPIPE_ENABLED,
    MIN_FACE_SIZE_PX,
    YOLO_FACE_DIFFICULT_MIN_BRIGHTNESS,
    YOLO_FACE_DIFFICULT_MIN_SIZE,
    YOLO_FACE_FALLBACK_ENABLED,
)
from .insightface_app import INSIGHTFACE_AVAILABLE, build_insightface_app
from .landmark_detector import FacialLandmarkDetector
from .yolo_face_detector import YOLOFaceDetector

logger = logging.getLogger(__name__)

_BACKEND_ALIASES = {
    "mediapipe": "mediapipe",
    "mp": "mediapipe",
    "insightface": "insightface",
    "opencv_dnn": "opencv_dnn",
    "dnn": "opencv_dnn",
    "ssd": "opencv_dnn",
    "haar": "haar_cascade",
    "haar_cascade": "haar_cascade",
    "cascade": "haar_cascade",
}


class FaceDetector:
    """Production face detector that auto-selects the best available backend."""

    def __init__(
        self,
        confidence_threshold: float | None = None,
        backend: str | None = None,
        use_landmarks: bool = True,
        allow_yolo_fallback: bool | None = None,
    ):
        self.confidence = confidence_threshold or FACE_DETECTION_CONFIDENCE
        self._requested_backend = _BACKEND_ALIASES.get((backend or FACE_DETECTOR_BACKEND or "auto").strip().lower())
        self._use_landmarks = use_landmarks
        self._allow_yolo_fallback = YOLO_FACE_FALLBACK_ENABLED if allow_yolo_fallback is None else allow_yolo_fallback
        self._backend = None
        self._insightface_app = None
        self._cascade = None
        self._cvnet = None
        self._landmark_detector = None
        self._yolo = None
        self._yolo_failed = False
        self._init_backend()

    def _init_backend(self):
        # InsightFace first: RetinaFace holds up better on angled, partially
        # occluded and off-centre faces than the MediaPipe short-range detector,
        # and multi-face recall is what intruder detection depends on.
        if self._requested_backend in (None, "insightface") and INSIGHTFACE_AVAILABLE:
            try:
                app, pack = build_insightface_app(["detection"])
                if app is None:
                    raise RuntimeError("no usable InsightFace pack")
                det_size = max(64, int(FACE_DETECT_SIZE))
                app.prepare(ctx_id=0, det_size=(det_size, det_size))
                self._insightface_app = app
                self._backend = "insightface"
                logger.info(
                    "Face detector backend: InsightFace SCRFD %s (det_size=%d)", pack, det_size
                )
                return
            except Exception as e:
                logger.warning(f"InsightFace init failed, trying fallback: {e}")

        if self._use_landmarks and self._requested_backend in (None, "mediapipe") and MEDIAPIPE_ENABLED:
            detector = FacialLandmarkDetector()
            if detector.backend_name == "mediapipe":
                self._landmark_detector = detector
                self._backend = "mediapipe"
                logger.info("Face detector backend: MediaPipe Face Landmarker")
                return

        if self._requested_backend in (None, "opencv_dnn"):
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

    @property
    def landmark_detector(self) -> FacialLandmarkDetector | None:
        return self._landmark_detector

    def detect(self, frame: np.ndarray) -> dict:
        """Detect faces in an image.

        Returns:
            {
                "faces": [{"bbox": [x1,y1,x2,y2], "confidence": float, "landmarks": ...}],
                "face_count": int,
                "face_present": bool,
                "multiple_faces": bool,
                "backend": str,
                "conditions": str
            }
        """
        if frame is None or frame.size == 0:
            return self._empty_result()

        if self._backend == "mediapipe":
            result = self._detect_mediapipe(frame)
        elif self._backend == "insightface":
            result = self._detect_insightface(frame)
        elif self._backend == "opencv_dnn":
            result = self._detect_opencv_dnn(frame)
        else:
            result = self._detect_haar(frame)

        conditions = self._assess_conditions(frame, result)
        result["conditions"] = conditions

        if result["face_count"] == 0 and self._allow_yolo_fallback and conditions in ("difficult", "extreme"):
            merged = self._detect_yolo_fallback(frame, conditions)
            if merged["face_count"] > 0:
                return merged

        return result

    def detect_best_face(self, frame: np.ndarray) -> dict | None:
        """Return the single highest-confidence face, or None."""
        result = self.detect(frame)
        if not result["faces"]:
            return None
        return max(result["faces"], key=lambda f: f["confidence"] * ((f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1])))

    def _assess_conditions(self, frame: np.ndarray, result: dict) -> str:
        """Classify capture conditions to decide if a fallback detector is worthwhile."""
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))
        if brightness < YOLO_FACE_DIFFICULT_MIN_BRIGHTNESS * 0.55:
            return "extreme"

        largest = 0
        for f in result["faces"]:
            bw = f["bbox"][2] - f["bbox"][0]
            bh = f["bbox"][3] - f["bbox"][1]
            largest = max(largest, int(np.sqrt(max(0, bw * bh))))

        frame_diag = float(np.hypot(h, w))
        if largest == 0:
            return "difficult"
        if largest < YOLO_FACE_DIFFICULT_MIN_SIZE or largest < frame_diag * 0.06:
            return "difficult"
        if brightness < YOLO_FACE_DIFFICULT_MIN_BRIGHTNESS:
            return "difficult"
        return "normal"

    def _detect_yolo_fallback(self, frame: np.ndarray, conditions: str) -> dict:
        # Without its weights the YOLO fallback can never succeed, and building it
        # again on every dark frame costs a failed model lookup per detection.
        # Latch the failure after the first attempt.
        if self._yolo_failed:
            return self._empty_result()
        if self._yolo is None:
            self._yolo = YOLOFaceDetector()
        if not self._yolo.available:
            self._yolo_failed = True
            logger.warning(
                "YOLO face fallback unavailable; relying on the primary detector only."
            )
            return self._empty_result()
        result = self._yolo.detect(frame)
        if result["face_count"] == 0:
            return self._empty_result()
        result["backend"] = "yolov8"
        result["conditions"] = conditions
        result["fallback"] = True
        return result

    def _detect_mediapipe(self, frame: np.ndarray) -> dict:
        landmark_result = self._landmark_detector.detect(frame)
        faces = []
        for det in landmark_result["faces"]:
            faces.append(
                {
                    "bbox": det["bbox"],
                    "confidence": round(float(det["confidence"]), 4),
                    "landmarks": det["landmarks"],
                    "embedding": None,
                    "landmark_count": det["landmark_count"],
                }
            )
        return {
            "faces": faces,
            "face_count": len(faces),
            "face_present": len(faces) >= 1,
            "multiple_faces": len(faces) > 1,
            "backend": "mediapipe",
        }

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
                "backend": "insightface",
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
            "backend": "opencv_dnn",
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
            "backend": "haar_cascade",
        }

    def _empty_result(self) -> dict:
        return {
            "faces": [],
            "face_count": 0,
            "face_present": False,
            "multiple_faces": False,
            "backend": self.backend_name,
            "conditions": "unknown",
        }