"""Face detection using OpenCV Haar Cascade (runtime).

Detects:
- Face present / not present
- Number of faces
- Multiple faces violation
"""

import cv2
import os
import numpy as np

CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"


class FaceDetector:
    def __init__(self):
        self._cascade = cv2.CascadeClassifier(CASCADE_PATH)

    def detect(self, frame: np.ndarray) -> dict:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        faces = self._cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(60, 60),
        )
        count = int(len(faces))
        return {
            "faces": count,
            "facePresent": count >= 1,
            "multipleFaces": count > 1,
            "boxes": [{"x": int(x), "y": int(y), "w": int(w), "h": int(h)} for (x, y, w, h) in faces] if count else [],
        }
