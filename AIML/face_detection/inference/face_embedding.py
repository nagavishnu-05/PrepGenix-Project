"""Face embedding generation for identity verification.

Backends:
  1. InsightFace ArcFace (if available, uses embedding from detection step)
  2. Custom ONNX ArcFace model
  3. OpenCV-based feature histogram fallback
"""

import os
import logging
from pathlib import Path

import cv2
import numpy as np

from ..utils.config import FACE_MATCH_THRESHOLD, FACE_RECOGNITION_DIR, FACE_EMBEDDING_SIZE

logger = logging.getLogger(__name__)

INSIGHTFACE_AVAILABLE = False
try:
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    pass

ONNX_AVAILABLE = False
try:
    import onnxruntime as ort
    ONNX_AVAILABLE = ort
except ImportError:
    pass


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a < 1e-8 or norm_b < 1e-8:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def l2_distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


class FaceEmbedding:
    """Generate and compare face embeddings."""

    def __init__(self, threshold: float | None = None):
        self.threshold = threshold if threshold is not None else FACE_MATCH_THRESHOLD
        self._insightface_app = None
        self._onnx_session = None
        self._backend = None
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
                    allowed_modules=["detection", "recognition"],
                )
                app.prepare(ctx_id=0, det_size=(640, 640))
                self._insightface_app = app
                self._backend = "insightface"
                logger.info("Face embedding backend: InsightFace ArcFace")
                return
            except Exception as e:
                logger.warning(f"InsightFace embedding init failed: {e}")

        model_path = FACE_RECOGNITION_DIR / "arcface_r100.onnx"
        if model_path.exists() and ONNX_AVAILABLE:
            try:
                providers = ["CPUExecutionProvider"]
                self._onnx_session = ort.InferenceSession(str(model_path), providers=providers)
                self._backend = "onnx_arcface"
                logger.info("Face embedding backend: ONNX ArcFace")
                return
            except Exception as e:
                logger.warning(f"ONNX ArcFace init failed: {e}")

        self._backend = "histogram"
        logger.info("Face embedding backend: Histogram (fallback)")

    @property
    def backend_name(self) -> str:
        return self._backend or "unknown"

    def generate_embedding(self, frame: np.ndarray) -> np.ndarray | None:
        """Generate a face embedding from an image frame.

        Detects the best face, crops it, and computes an embedding vector.
        Returns None if no face found.
        """
        if frame is None or frame.size == 0:
            return None

        if self._backend == "insightface":
            return self._generate_insightface(frame)
        elif self._backend == "onnx_arcface":
            return self._generate_onnx(frame)
        else:
            return self._generate_histogram(frame)

    def generate_embedding_from_crop(self, face_crop: np.ndarray) -> np.ndarray | None:
        """Generate embedding from an already-cropped face image."""
        if face_crop is None or face_crop.size == 0:
            return None
        if self._backend == "insightface":
            faces = self._insightface_app.get(face_crop)
            if faces:
                best = max(faces, key=lambda f: f.det_score)
                if hasattr(best, "normed_embedding") and best.normed_embedding is not None:
                    return best.normed_embedding.astype(np.float32)
        elif self._backend == "onnx_arcface":
            return self._compute_onnx_embedding(face_crop)
        return self._compute_histogram_embedding(face_crop)

    def compare(self, emb1: np.ndarray, emb2: np.ndarray) -> dict:
        """Compare two embeddings.

        Returns: {"match": bool, "similarity": float, "threshold": float}
        """
        if emb1 is None or emb2 is None:
            return {"match": False, "similarity": 0.0, "threshold": self.threshold}

        if self._backend in ("insightface", "onnx_arcface"):
            sim = cosine_similarity(emb1, emb2)
        else:
            sim = cosine_similarity(emb1, emb2)

        return {
            "match": sim >= self.threshold,
            "similarity": round(sim, 4),
            "threshold": self.threshold,
        }

    def aggregate_embeddings(self, embeddings: list[np.ndarray]) -> np.ndarray | None:
        """Aggregate multiple embeddings into a stable reference via normalized mean."""
        valid = [e for e in embeddings if e is not None and e.size > 0]
        if not valid:
            return None
        stacked = np.stack(valid, axis=0)
        mean_emb = np.mean(stacked, axis=0)
        norm = np.linalg.norm(mean_emb)
        if norm < 1e-8:
            return mean_emb
        return (mean_emb / norm).astype(np.float32)

    def _generate_insightface(self, frame: np.ndarray) -> np.ndarray | None:
        try:
            faces = self._insightface_app.get(frame)
            if not faces:
                return None
            best = max(faces, key=lambda f: f.det_score)
            if hasattr(best, "normed_embedding") and best.normed_embedding is not None:
                return best.normed_embedding.astype(np.float32)
            return None
        except Exception as e:
            logger.error(f"InsightFace embedding error: {e}")
            return None

    def _generate_onnx(self, frame: np.ndarray) -> np.ndarray | None:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(40, 40))
        if len(faces) == 0:
            return None
        fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
        h, w = frame.shape[:2]
        pad = int(max(fw, fh) * 0.3)
        x1, y1 = max(0, int(fx) - pad), max(0, int(fy) - pad)
        x2, y2 = min(w, int(fx) + int(fw) + pad), min(h, int(fy) + int(fh) + pad)
        crop = frame[y1:y2, x1:x2]
        return self._compute_onnx_embedding(crop)

    def _compute_onnx_embedding(self, face_crop: np.ndarray) -> np.ndarray | None:
        try:
            input_size = (112, 112)
            resized = cv2.resize(face_crop, input_size, interpolation=cv2.INTER_LINEAR)
            blob = resized.astype(np.float32)
            blob = (blob - 127.5) / 128.0
            blob = blob.transpose(2, 0, 1)
            blob = np.expand_dims(blob, axis=0)
            input_name = self._onnx_session.get_inputs()[0].name
            outputs = self._onnx_session.run(None, {input_name: blob})
            emb = outputs[0].flatten()
            norm = np.linalg.norm(emb)
            if norm < 1e-8:
                return None
            return (emb / norm).astype(np.float32)
        except Exception as e:
            logger.error(f"ONNX embedding error: {e}")
            return None

    def _generate_histogram(self, frame: np.ndarray) -> np.ndarray | None:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(40, 40))
        if len(faces) == 0:
            return None
        fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
        h, w = frame.shape[:2]
        pad = int(max(fw, fh) * 0.2)
        x1, y1 = max(0, int(fx) - pad), max(0, int(fy) - pad)
        x2, y2 = min(w, int(fx) + int(fw) + pad), min(h, int(fy) + int(fh) + pad)
        crop = frame[y1:y2, x1:x2]
        return self._compute_histogram_embedding(crop)

    def _compute_histogram_embedding(self, face_crop: np.ndarray) -> np.ndarray | None:
        if face_crop is None or face_crop.size == 0:
            return None
        hsv = cv2.cvtColor(face_crop, cv2.COLOR_BGR2HSV)
        h_hist = cv2.calcHist([hsv], [0], None, [50], [0, 180])
        s_hist = cv2.calcHist([hsv], [1], None, [64], [0, 256])
        hist = np.concatenate([h_hist.flatten(), s_hist.flatten()])
        hist = hist.astype(np.float32)
        norm = np.linalg.norm(hist)
        if norm < 1e-8:
            return hist
        return hist / norm
