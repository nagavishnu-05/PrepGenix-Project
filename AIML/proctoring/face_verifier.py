"""Face identity verification backed by face embeddings.

Identity is decided by the same embedding backend used everywhere else
(InsightFace ArcFace, an ONNX ArcFace model, or, as a last resort, nothing at
all). It never falls back to an HSV/intensity histogram: a histogram is not an
identity descriptor, so treating a histogram match as proof of identity would
accept any frame under similar lighting.

When no usable embedding backend is loaded the verifier reports
``match=None`` ("identity verification unavailable") rather than a verdict, so a
missing model degrades to *unknown* instead of silently accepting a stranger.
"""

import base64
import os
from collections import deque

import cv2
import numpy as np

from .face_detector import FaceDetector

_HERE = os.path.dirname(__file__)
try:  # AIML/ on sys.path (normal package import)
    from face_detection.inference.face_embedding import FaceEmbedding
    from face_detection.utils.config import FACE_MATCH_THRESHOLD
    from face_detection.utils.image_utils import assess_face_quality
except ImportError:  # pragma: no cover - fallback for unusual import roots
    import sys

    sys.path.insert(0, os.path.dirname(_HERE))
    from face_detection.inference.face_embedding import FaceEmbedding
    from face_detection.utils.config import FACE_MATCH_THRESHOLD
    from face_detection.utils.image_utils import assess_face_quality

SIMILARITY_THRESHOLD = float(os.environ.get("FACE_SIMILARITY_THRESHOLD", str(FACE_MATCH_THRESHOLD)))
IMPOSTER_CONFIRM_FRAMES = int(os.environ.get("IMPOSTER_CONFIRMATION_FRAMES", "3"))

# Backends whose embedding is a genuine identity descriptor.
_IDENTITY_BACKENDS = ("insightface", "onnx_arcface")


class FaceVerifier:
    def __init__(self, similarity_threshold: float | None = None, embedding=None):
        self.face_detector = FaceDetector()
        # Reuse a shared embedding backend when one is supplied: each
        # FaceEmbedding loads a recognition model, and a second instance would
        # double the memory and warm-up cost for no benefit.
        self.embedding = embedding if embedding is not None else FaceEmbedding(threshold=similarity_threshold)
        self.similarity_threshold = float(
            similarity_threshold if similarity_threshold is not None else self.embedding.threshold
        )
        self._reference_embedding: np.ndarray | None = None
        self._reference_set = False
        # Recent per-frame verdicts. Kept so a caller can require a mismatch to
        # repeat before it is treated as a confirmed different person.
        self._recent_verdicts: deque[bool | None] = deque(maxlen=IMPOSTER_CONFIRM_FRAMES)

    @property
    def can_verify_identity(self) -> bool:
        """True only when a real embedding backend (not the histogram stub) is active."""
        return self.embedding.backend_name in _IDENTITY_BACKENDS

    def register(self, frame: np.ndarray) -> dict:
        """Register a reference face from an initial frame.

        Returns dict with success status, face count, quality and the face box.
        The reference is only stored when an identity-capable backend produced
        an embedding; otherwise registration fails rather than pretending. The
        embedding backend is authoritative for face presence - the Haar detector
        is only consulted for a box/quality hint and never blocks registration.
        """
        if not self.can_verify_identity:
            return {
                "success": False,
                "error": "identity_backend_unavailable",
                "message": "No face-recognition model available; identity cannot be verified.",
            }

        emb = self.embedding.generate_embedding(frame)
        if emb is None:
            detection = self.face_detector.detect(frame)
            if not detection.get("facePresent"):
                return {"success": False, "error": "no_face", "message": "No face detected in registration frame"}
            return {
                "success": False,
                "error": "embedding_failed",
                "message": "Could not generate a face embedding from the registration frame.",
            }

        detection = self.face_detector.detect(frame)
        box = detection["boxes"][0] if detection.get("boxes") else None
        quality = self._assess_quality(frame, box)

        self._reference_embedding = emb
        self._reference_set = True
        self._recent_verdicts.clear()

        return {
            "success": True,
            "faceCount": detection.get("faces", 1),
            "box": box,
            "quality": quality.get("quality", "good"),
            "quality_detail": quality,
            "backend": self.embedding.backend_name,
        }

    def _assess_quality(self, frame: np.ndarray, box: dict | None) -> dict:
        if frame is None:
            return {"quality": "unusable"}
        if box is None:
            # No Haar box to crop from: grade the whole frame as a rough hint.
            return assess_face_quality(frame)
        face_crop = self._crop_face(frame, box)
        if face_crop is None:
            return {"quality": "unusable"}
        return assess_face_quality(face_crop)

    def register_from_embeddings(self, embeddings: list[np.ndarray]) -> dict:
        """Register from several pre-computed embeddings (multi-frame enrollment)."""
        valid = [e for e in embeddings if e is not None and getattr(e, "size", 0) > 0]
        if not valid:
            return {"success": False, "error": "no_embeddings", "message": "No valid embeddings provided"}
        ref = self.embedding.aggregate_embeddings(valid)
        if ref is None:
            return {"success": False, "error": "aggregate_failed", "message": "Could not combine embeddings"}
        self._reference_embedding = ref
        self._reference_set = True
        self._recent_verdicts.clear()
        return {"success": True, "faceCount": len(valid), "message": "Reference face registered from multiple frames"}

    def verify(self, frame: np.ndarray) -> dict:
        """Verify that the face in the current frame matches the reference.

        ``match`` is one of ``True`` (candidate), ``False`` (different person) or
        ``None`` (nothing could be evaluated). Only ``False`` should ever be used
        as evidence of an imposter; ``None`` is explicitly *not* a mismatch.
        """
        if not self._reference_set or self._reference_embedding is None:
            return {"match": True, "similarity": None, "imposter": False, "reason": "no_reference"}

        if not self.can_verify_identity:
            return {
                "match": None,
                "similarity": None,
                "threshold": self.similarity_threshold,
                "imposter": False,
                "reason": "identity_backend_unavailable",
            }

        emb = self.embedding.generate_embedding(frame)
        if emb is None:
            self._recent_verdicts.append(None)
            return {
                "match": None,
                "similarity": None,
                "threshold": self.similarity_threshold,
                "imposter": False,
                "reason": "unverified",
            }

        comparison = self.embedding.compare(self._reference_embedding, emb)
        match = comparison.get("match")
        if match is None:
            self._recent_verdicts.append(None)
            return {
                "match": None,
                "similarity": None,
                "threshold": self.similarity_threshold,
                "imposter": False,
                "reason": "unverified",
            }

        is_imposter = match is False
        self._recent_verdicts.append(is_imposter)

        return {
            "match": bool(match),
            "similarity": comparison.get("similarity"),
            "threshold": comparison.get("threshold", self.similarity_threshold),
            "imposter": is_imposter,
            "confirmed": bool(is_imposter and len(self._recent_verdicts) >= IMPOSTER_CONFIRM_FRAMES
                              and all(v is True for v in self._recent_verdicts)),
            "reason": "IMPOSTER_DETECTED" if is_imposter else "verified",
        }

    def register_from_base64(self, image_b64: str) -> dict:
        frame = self._decode_b64(image_b64)
        if frame is None:
            return {"success": False, "error": "decode_failed", "message": "Could not decode image"}
        return self.register(frame)

    def verify_from_base64(self, image_b64: str) -> dict:
        frame = self._decode_b64(image_b64)
        if frame is None:
            return {"match": None, "similarity": None, "imposter": False, "reason": "decode_failed"}
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

    def _decode_b64(self, b64: str) -> np.ndarray | None:
        try:
            raw = base64.b64decode(b64)
            arr = np.frombuffer(raw, dtype=np.uint8)
            return cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def reset(self):
        self._reference_embedding = None
        self._reference_set = False
        self._recent_verdicts.clear()
