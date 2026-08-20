"""Evaluate a trained face detector.

Usage:
  python AIML/face_detection/training/evaluate_detector.py --model-path <path>
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "AIML"))


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate face detector")
    parser.add_argument("--model-path", type=str, default=None, help="Path to trained model")
    parser.add_argument("--dataset-dir", type=str, default=None, help="Dataset directory")
    parser.add_argument("--threshold", type=float, default=0.5, help="Detection threshold")
    parser.add_argument("--iou-threshold", type=float, default=0.5, help="IoU threshold for matching")
    return parser.parse_args()


def compute_iou(box1, box2):
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - inter
    return inter / union if union > 0 else 0


def main():
    args = parse_args()
    print("=" * 60)
    print("Face Detector Evaluation")
    print("=" * 60)

    sys.path.insert(0, str(ROOT / "AIML"))
    from face_detection.inference.face_detector import FaceDetector

    detector = FaceDetector(confidence_threshold=args.threshold)
    print(f"Backend: {detector.backend_name}")

    eval_results = {
        "precision": 0.0,
        "recall": 0.0,
        "f1": 0.0,
        "map": 0.0,
        "threshold": args.threshold,
        "backend": detector.backend_name,
        "note": "Requires WIDER FACE validation set for full evaluation",
    }

    output_dir = ROOT / "AIML" / "face_detection" / "models" / "detector"
    output_dir.mkdir(parents=True, exist_ok=True)
    eval_path = output_dir / "evaluation.json"
    with open(eval_path, "w") as f:
        json.dump(eval_results, f, indent=2)
    print(f"\nEvaluation results saved to {eval_path}")
    print(json.dumps(eval_results, indent=2))


if __name__ == "__main__":
    main()
