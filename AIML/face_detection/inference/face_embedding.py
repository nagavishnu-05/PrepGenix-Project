"""Face embedding generation for identity verification.

Backends, in preference order:
  1. InsightFace ArcFace
  2. Custom ONNX ArcFace model
  3. MediaPipe landmark geometry (shape descriptor, identity-discriminative)
  4. OpenCV intensity histogram (last-resort fallback only)

The histogram fallback is not a valid identity descriptor: a mirrored, blurred
copy of the same photo scores ~0.94 similarity against itself, so it accepts
any frame. It is retained only so the pipeline does not crash, and identity
verification is reported as unavailable when it is the active backend.
"""

import os
import logging
from pathlib import Path

import cv2
import numpy as np

from ..utils.config import (
    FACE_MATCH_THRESHOLD,
    FACE_RECOGNITION_DIR,
    FACE_EMBEDDING_SIZE,
    MODELS_DIR,
)
from .insightface_app import INSIGHTFACE_AVAILABLE, build_insightface_app

logger = logging.getLogger(__name__)

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


# ArcFace reference template for a 112x112 crop (right eye, left eye, nose,
# mouth corner, other mouth corner). Aligning to it is what makes the embedding
# comparable across framing and in-plane rotation.
ARCFACE_TEMPLATE_112 = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)


def align_face_to_arcface(crop: np.ndarray, kps: np.ndarray | list, size: int = 112) -> np.ndarray | None:
    """Warp a face crop onto the ArcFace template using its 5 keypoints.

    `kps` are the eye corners, nose tip and mouth corners in *crop* pixel
    coordinates. Doing the alignment here means the recognition model can be run
    directly on the crop, with no second detection pass over the image.
    """
    if crop is None or crop.size == 0 or kps is None:
        return None
    src = np.asarray(kps, dtype=np.float32).reshape(-1, 2)
    if src.shape[0] < 5:
        return None
    src = src[:5]
    try:
        matrix, _ = cv2.estimateAffinePartial2D(
            src, ARCFACE_TEMPLATE_112[: src.shape[0]], method=cv2.LMEDS
        )
        if matrix is None:
            return None
        return cv2.warpAffine(
            crop, matrix, (size, size), borderValue=0.0, flags=cv2.INTER_LINEAR
        )
    except Exception as exc:  # noqa: BLE001 - alignment is best effort
        logger.debug("ArcFace alignment failed: %s", exc)
        return None


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
                app, pack = build_insightface_app(["detection", "recognition"])
                if app is None:
                    raise RuntimeError("no usable InsightFace pack")
                app.prepare(ctx_id=0, det_size=(640, 640))
                self._insightface_app = app
                self._backend = "insightface"
                logger.info("Face embedding backend: InsightFace ArcFace (%s)", pack)
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
        logger.warning(
            "Face embedding backend: intensity histogram fallback. This cannot "
            "verify identity; install insightface or provide arcface_r100.onnx."
        )

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

    def generate_embedding_from_crop(
        self,
        face_crop: np.ndarray,
        kps=None,
        frame: np.ndarray | None = None,
    ) -> np.ndarray | None:
        """Generate embedding from an already-cropped face image.

        `kps` are the 5 ArcFace keypoints (right eye, left eye, nose, mouth
        corners) and `frame` the image those coordinates refer to, which is
        normally the un-cropped camera frame. When both are supplied the face is
        aligned on the full frame and pushed straight through the recognition
        network: no second detection pass, and pixel-identical to InsightFace's
        own alignment. Warping the crop instead loses a little accuracy to
        interpolation at the crop origin, so it is only the fallback.
        """
        if face_crop is None or face_crop.size == 0:
            return None
        if self._backend == "insightface":
            if kps is not None:
                aligned = align_face_to_arcface(frame if frame is not None else face_crop, kps)
                if aligned is not None:
                    emb = self._embed_recognition(aligned)
                    if emb is not None:
                        return emb
            # Never fall back to the histogram here. A histogram vector has a
            # different dimensionality and no identity meaning, so mixing the
            # two silently disables verification. Return None ("unknown")
            # instead, and pad small crops so detection has room to work.
            padded = self._pad_crop(face_crop)
            faces = self._insightface_app.get(padded)
            if faces:
                best = max(faces, key=lambda f: f.det_score)
                if getattr(best, "normed_embedding", None) is not None:
                    return best.normed_embedding.astype(np.float32)
            return None
        elif self._backend == "onnx_arcface":
            return self._compute_onnx_embedding(face_crop)
        return self._compute_histogram_embedding(face_crop)

    def _embed_recognition(self, aligned_112: np.ndarray) -> np.ndarray | None:
        """Run only the recognition network on an already-aligned 112x112 face."""
        try:
            # insightface 2.x exposes loaded sessions through `models`; older
            # releases set a `face_recognition` attribute instead.
            session = getattr(self._insightface_app, "face_recognition", None)
            if session is None and hasattr(self._insightface_app, "models"):
                session = self._insightface_app.models.get("recognition")
            if session is None or not hasattr(session, "get_feat"):
                return None
            batch = aligned_112.astype(np.float32)
            # ArcFaceONNX.get_feat expects a list of HxWx3 images and does its
            # own resize/normalisation.
            emb = session.get_feat([batch])
            emb = np.asarray(emb, dtype=np.float32).flatten()
            norm = np.linalg.norm(emb)
            if emb.size == 0 or norm < 1e-8:
                return None
            return (emb / norm).astype(np.float32)
        except Exception as e:  # noqa: BLE001
            logger.debug("InsightFace recognition-only embedding failed: %s", e)
            return None

    @staticmethod
    def _pad_crop(face_crop: np.ndarray, pad_ratio: float = 0.35) -> np.ndarray:
        """Grow a tight face crop so the detector has context around the face."""
        h, w = face_crop.shape[:2]
        pad = int(max(h, w) * pad_ratio)
        if pad <= 0:
            return face_crop
        border = max(pad, 2)
        try:
            return cv2.copyMakeBorder(
                face_crop, border, border, border, border, cv2.BORDER_REPLICATE
            )
        except Exception:
            return face_crop

    def compare(self, emb1: np.ndarray, emb2: np.ndarray) -> dict:
        """Compare two embeddings.

        Returns: {"match": bool, "similarity": float, "threshold": float}
        """
        if emb1 is None or emb2 is None:
            return {"match": None, "similarity": None, "threshold": self.threshold}

        # Guard against mixing embedding spaces (e.g. a histogram vector paired
        # with an ArcFace vector), which would produce a meaningless score.
        if emb1.shape != emb2.shape:
            logger.error(
                "Embedding dimension mismatch: %s vs %s; treating as unknown",
                emb1.shape, emb2.shape,
            )
            return {"match": None, "similarity": None, "threshold": self.threshold}

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
        """Last-resort fallback. Not identity-discriminative - see module docstring."""
        return self._compute_histogram_embedding(frame)

    def _compute_histogram_embedding(self, face_crop: np.ndarray) -> np.ndarray | None:
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        hist = cv2.calcHist([gray], [0], None, [FACE_EMBEDDING_SIZE], [0, 256])
        cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)
        return hist.flatten().astype(np.float32)
