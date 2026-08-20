"""Image utility functions for face detection pipeline."""

import base64
import cv2
import numpy as np


def decode_base64_image(b64: str) -> np.ndarray | None:
    """Decode a base64 string (with or without data-URI prefix) to an OpenCV BGR image."""
    if not b64:
        return None
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    try:
        raw = base64.b64decode(b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def encode_image_base64(frame: np.ndarray, fmt: str = ".jpg", quality: int = 70) -> str:
    """Encode an OpenCV BGR image to a base64 string."""
    ok, buf = cv2.imencode(fmt, frame, [cv2.IMWRITE_JPEG_QUALITY, quality] if fmt == ".jpg" else [])
    if not ok:
        return ""
    return base64.b64encode(buf).decode("utf-8")


def crop_face(frame: np.ndarray, box: dict, padding: float = 0.25) -> np.ndarray | None:
    """Crop a face region from the frame with padding.

    box keys: x, y, w, h (top-left + size) or x1, y1, x2, y2 (corners).
    """
    h, w = frame.shape[:2]
    if "x1" in box and "y1" in box and "x2" in box and "y2" in box:
        x1, y1, x2, y2 = int(box["x1"]), int(box["y1"]), int(box["x2"]), int(box["y2"])
    else:
        x1, y1 = int(box.get("x", 0)), int(box.get("y", 0))
        x2, y2 = x1 + int(box.get("w", 0)), y1 + int(box.get("h", 0))
    fw, fh = x2 - x1, y2 - y1
    if fw <= 0 or fh <= 0:
        return None
    pad_x, pad_y = int(fw * padding), int(fh * padding)
    cx1 = max(0, x1 - pad_x)
    cy1 = max(0, y1 - pad_y)
    cx2 = min(w, x2 + pad_x)
    cy2 = min(h, y2 + pad_y)
    crop = frame[cy1:cy2, cx1:cx2]
    return crop if crop.size > 0 else None


def assess_face_quality(face_crop: np.ndarray) -> dict:
    """Assess face quality: blur, brightness, size."""
    if face_crop is None or face_crop.size == 0:
        return {"blur": 0, "brightness": 0, "quality": "unusable"}
    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(np.mean(gray))
    h, w = face_crop.shape[:2]
    if blur < 30 or brightness < 20 or h < 40 or w < 40:
        quality = "poor"
    elif blur < 80 or brightness < 40:
        quality = "acceptable"
    else:
        quality = "good"
    return {"blur": round(blur, 1), "brightness": round(brightness, 1), "quality": quality}


def resize_for_detection(frame: np.ndarray, max_side: int = 640) -> tuple[np.ndarray, float]:
    """Resize frame so the longest side is max_side, return (resized, scale)."""
    h, w = frame.shape[:2]
    if max(h, w) <= max_side:
        return frame, 1.0
    scale = max_side / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR), scale
