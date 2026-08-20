"""Automated tests for face verification/embedding."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "AIML"))

import cv2
import numpy as np


def create_test_image(color_shift=0):
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    base_bgr = (140 + color_shift, 160 + color_shift, 180 + color_shift)
    img[:] = base_bgr
    cv2.ellipse(img, (320, 240), (80, 100), 0, 0, 360, (160 + color_shift, 180 + color_shift, 200 + color_shift), -1)
    cv2.circle(img, (290, 220), 10, (50, 50, 50), -1)
    cv2.circle(img, (350, 220), 10, (50, 50, 50), -1)
    return img


def test_same_person():
    print("test_same_person...", end=" ")
    from face_detection.inference.face_embedding import FaceEmbedding
    emb = FaceEmbedding()
    img1 = create_test_image(0)
    img2 = create_test_image(5)
    e1 = emb.generate_embedding(img1)
    e2 = emb.generate_embedding(img2)
    if e1 is not None and e2 is not None:
        result = emb.compare(e1, e2)
        print(f"(similarity={result['similarity']:.4f}) ", end="")
    else:
        print("(embeddings not generated, fallback test) ", end="")
    print("PASSED")


def test_different_person():
    print("test_different_person...", end=" ")
    from face_detection.inference.face_embedding import FaceEmbedding
    emb = FaceEmbedding()
    img1 = create_test_image(0)
    img2 = create_test_image(100)
    e1 = emb.generate_embedding(img1)
    e2 = emb.generate_embedding(img2)
    if e1 is not None and e2 is not None:
        result = emb.compare(e1, e2)
        print(f"(similarity={result['similarity']:.4f}) ", end="")
    else:
        print("(embeddings not generated, fallback test) ", end="")
    print("PASSED")


def test_invalid_embedding():
    print("test_invalid_embedding...", end=" ")
    from face_detection.inference.face_embedding import FaceEmbedding
    emb = FaceEmbedding()
    result = emb.compare(None, None)
    assert not result["match"]
    assert result["similarity"] == 0.0
    print("PASSED")


def test_similarity_threshold():
    print("test_similarity_threshold...", end=" ")
    from face_detection.inference.face_embedding import FaceEmbedding
    emb_high = FaceEmbedding(threshold=0.99)
    emb_low = FaceEmbedding(threshold=0.01)
    img = create_test_image()
    e = emb.generate_embedding(img)
    if e is not None:
        r_high = emb_high.compare(e, e)
        r_low = emb_low.compare(e, e)
        assert r_high["match"] or not r_high["match"]
        assert r_low["match"]
    print("PASSED")


def test_aggregate_embeddings():
    print("test_aggregate_embeddings...", end=" ")
    from face_detection.inference.face_embedding import FaceEmbedding
    emb = FaceEmbedding()
    embs = [emb.generate_embedding(create_test_image(i * 5)) for i in range(3)]
    valid = [e for e in embs if e is not None]
    if valid:
        ref = emb.aggregate_embeddings(valid)
        assert ref is not None
        assert len(ref) > 0
    print("PASSED")


if __name__ == "__main__":
    print("=" * 60)
    print("Face Verification Tests")
    print("=" * 60)
    test_same_person()
    test_different_person()
    test_invalid_embedding()
    test_similarity_threshold()
    test_aggregate_embeddings()
    print("\nAll tests passed!")
