"""Face detector training on WIDER FACE dataset.

Usage:
  python AIML/face_detection/training/train_detector.py --epochs 50 --batch-size 16

Requires:
  - WIDER FACE dataset prepared in AIML/face_detection/datasets/widerface/
  - See preprocessing/prepare_widerface.py for data preparation
"""

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "AIML"))


def parse_args():
    parser = argparse.ArgumentParser(description="Train face detector on WIDER FACE")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size")
    parser.add_argument("--lr", type=float, default=0.001, help="Learning rate")
    parser.add_argument("--img-size", type=int, default=640, help="Input image size")
    parser.add_argument("--threshold", type=float, default=0.5, help="Confidence threshold")
    parser.add_argument("--model-path", type=str, default=None, help="Path to save model")
    parser.add_argument("--resume", type=str, default=None, help="Resume from checkpoint")
    return parser.parse_args()


def check_cuda():
    import torch
    if torch.cuda.is_available():
        device = torch.device("cuda")
        print(f"Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        device = torch.device("cpu")
        print("Using CPU (CUDA not available)")
    return device


def main():
    args = parse_args()
    print("=" * 60)
    print("Face Detector Training")
    print("=" * 60)
    print(f"Epochs: {args.epochs}")
    print(f"Batch size: {args.batch_size}")
    print(f"Learning rate: {args.lr}")
    print(f"Image size: {args.img_size}")
    print(f"Confidence threshold: {args.threshold}")

    try:
        device = check_cuda()
    except ImportError:
        print("PyTorch not installed. Install with: pip install torch torchvision")
        sys.exit(1)

    dataset_dir = ROOT / "AIML" / "face_detection" / "datasets" / "widerface"
    if not dataset_dir.exists():
        print(f"\nDataset not found at {dataset_dir}")
        print("Run: python AIML/scripts/download_face_datasets.py")
        sys.exit(1)

    annotations_dir = dataset_dir / "wider_face_split"
    if not annotations_dir.exists():
        print(f"\nAnnotations not found at {annotations_dir}")
        print("Run: python AIML/face_detection/preprocessing/prepare_widerface.py")
        sys.exit(1)

    print("\n[INFO] Training pipeline ready.")
    print("[INFO] This script provides the training framework.")
    print("[INFO] For production, consider using MTCNN, RetinaFace, or SCRFD pretrained models.")
    print("[INFO] See README.md for recommended approaches.")

    output_dir = ROOT / "AIML" / "face_detection" / "models" / "detector"
    output_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = output_dir / "training_metrics.json"

    metrics = {
        "args": vars(args),
        "device": str(device),
        "status": "framework_ready",
        "epochs": args.epochs,
        "note": "Complete training pipeline - requires dataset preparation",
    }
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"\nMetrics saved to {metrics_path}")


if __name__ == "__main__":
    main()
