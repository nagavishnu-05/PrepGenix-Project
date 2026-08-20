"""Train face recognition model.

Usage:
  python AIML/face_detection/training/train_recognition.py --epochs 30
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "AIML"))


def parse_args():
    parser = argparse.ArgumentParser(description="Train face recognition model")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=0.0001)
    parser.add_argument("--dataset", type=str, default="lfw")
    return parser.parse_args()


def main():
    args = parse_args()
    print("Face Recognition Training")
    print("For production use, pre-trained ArcFace/InsightFace models are recommended.")
    print("See README.md for recommended approach.")


if __name__ == "__main__":
    main()
