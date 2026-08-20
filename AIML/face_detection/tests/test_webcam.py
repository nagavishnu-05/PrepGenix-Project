"""Test face detector on webcam in real-time.

Usage:
  python AIML/face_detection/tests/test_webcam.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "AIML"))

import cv2
import numpy as np


def main():
    print("=" * 60)
    print("Webcam Face Detection Test")
    print("=" * 60)
    print("Press 'q' to quit, 'r' to register face, 'v' to verify")

    from face_detection.inference.face_detector import FaceDetector
    from face_detection.inference.face_embedding import FaceEmbedding

    detector = FaceDetector()
    embedding_system = FaceEmbedding()
    print(f"Detector backend: {detector.backend_name}")
    print(f"Embedding backend: {embedding_system.backend_name}")

    reference_embedding = None

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam")
        sys.exit(1)

    print("\nWebcam opened. Detecting faces...")
    print("Controls:")
    print("  'q' - Quit")
    print("  'r' - Register current face as reference")
    print("  'v' - Verify current face against reference")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        result = detector.detect(frame)
        display = frame.copy()

        for face in result["faces"]:
            bbox = face["bbox"]
            conf = face["confidence"]
            color = (0, 255, 0) if result["face_count"] == 1 else (0, 165, 255)
            cv2.rectangle(display, (bbox[0], bbox[1]), (bbox[2], bbox[3]), color, 2)
            cv2.putText(display, f"{conf:.2f}", (bbox[0], bbox[1] - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        status = f"Faces: {result['face_count']}"
        if reference_embedding is not None:
            emb = embedding_system.generate_embedding(frame)
            if emb is not None:
                cmp = embedding_system.compare(reference_embedding, emb)
                match_str = "MATCH" if cmp["match"] else "MISMATCH"
                status += f" | {match_str} ({cmp['similarity']:.3f})"
            else:
                status += " | No face for verify"
        else:
            status += " | No reference registered"

        cv2.putText(display, status, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(display, f"Backend: {detector.backend_name}", (10, 60),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        cv2.imshow("Face Detection Test", display)
        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            break
        elif key == ord("r"):
            emb = embedding_system.generate_embedding(frame)
            if emb is not None:
                reference_embedding = emb
                print("Face registered as reference.")
            else:
                print("No face detected - cannot register.")
        elif key == ord("v"):
            if reference_embedding is None:
                print("No reference registered. Press 'r' first.")
            else:
                emb = embedding_system.generate_embedding(frame)
                if emb is not None:
                    cmp = embedding_system.compare(reference_embedding, emb)
                    print(f"Match: {cmp['match']}, Similarity: {cmp['similarity']:.4f}")
                else:
                    print("No face detected for verification.")

    cap.release()
    cv2.destroyAllWindows()
    print("Done.")


if __name__ == "__main__":
    main()
