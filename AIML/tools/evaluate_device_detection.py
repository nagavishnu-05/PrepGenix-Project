"""Evaluate phone/device detection per scenario.

Overall accuracy hides the cases that matter. A detector can look fine on the
easy set while missing every phone that is only partially visible - the exact
failure this project cares about. This script reports recall and false-positive
rate *per scenario folder*, so partial/cropped phones are measured separately
from ordinary objects.

Dataset layout - one folder per scenario. A folder whose name contains "phone"
(or "device") is treated as positive; anything else is treated as negative:

    dataset/
      full_phone/        img1.jpg ...
      partial_phone/     img1.jpg ...
      edge_phone/        img1.jpg ...
      negative_desk/     img1.jpg ...
      negative_hand/     img1.jpg ...

Usage:
    python tools/evaluate_device_detection.py path/to/dataset
    python tools/evaluate_device_detection.py path/to/dataset --conf 0.18 --crops
"""

import argparse
import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
POSITIVE_TOKENS = ("phone", "device", "laptop", "electronic")


def is_positive(folder_name: str) -> bool:
    lowered = folder_name.lower()
    return any(token in lowered for token in POSITIVE_TOKENS)


def evaluate(dataset_dir: Path, conf: float, use_crops: bool):
    import cv2

    from proctoring.object_detector import SceneObjectDetector

    detector = SceneObjectDetector()
    summary = []

    for folder in sorted(p for p in dataset_dir.iterdir() if p.is_dir()):
        images = [p for p in sorted(folder.iterdir()) if p.suffix.lower() in IMAGE_EXTS]
        if not images:
            continue
        positive = is_positive(folder.name)
        hits = 0
        confirmed_hits = 0
        total = 0
        for img_path in images:
            frame = cv2.imread(str(img_path))
            if frame is None:
                continue
            total += 1
            result = detector.detect(frame)
            devices = [d for d in result.get("devices", []) if d.get("confidence", 0) >= conf]
            if devices:
                hits += 1
            if result.get("confirmedDevices"):
                confirmed_hits += 1
        rate = hits / total if total else 0.0
        confirmed_rate = confirmed_hits / total if total else 0.0
        summary.append({
            "scenario": folder.name,
            "positive": positive,
            "images": total,
            "recall": rate if positive else None,
            "false_positive_rate": None if positive else rate,
            "confirmed_rate": confirmed_rate,
            "detections": hits,
        })

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate device detection per scenario.")
    parser.add_argument("dataset", type=Path, help="Directory with one subfolder per scenario")
    parser.add_argument("--conf", type=float, default=0.18,
                        help="Confidence floor counted as a detection (default 0.18)")
    parser.add_argument("--crops", action="store_true",
                        help="Force crop inference on (default follows DEVICE_CROP_INFERENCE_ENABLED)")
    args = parser.parse_args()

    if not args.dataset.is_dir():
        print(f"error: {args.dataset} is not a directory")
        return 2

    if args.crops:
        os.environ["DEVICE_CROP_INFERENCE_ENABLED"] = "true"

    summary = evaluate(args.dataset, args.conf, args.crops)

    print(f"Scenario detection report (confidence >= {args.conf})\n")
    print(f"  {'scenario':<24} {'images':>6} {'detect':>7} {'rate':>7} {'confirmed':>10}  kind")
    for row in summary:
        rate = row["recall"] if row["positive"] else row["false_positive_rate"]
        kind = "positive" if row["positive"] else "negative"
        print(f"  {row['scenario']:<24} {row['images']:>6} {row['detections']:>7} "
              f"{rate:>7.3f} {row['confirmed_rate']:>10.3f}  {kind}")

    positives = [r for r in summary if r["positive"] and r["recall"] is not None]
    negatives = [r for r in summary if not r["positive"] and r["false_positive_rate"] is not None]
    if positives:
        mean_recall = sum(r["recall"] for r in positives) / len(positives)
        print(f"\nMean recall across positive scenarios: {mean_recall:.3f}")
    if negatives:
        mean_fpr = sum(r["false_positive_rate"] for r in negatives) / len(negatives)
        print(f"Mean false-positive rate across negative scenarios: {mean_fpr:.3f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
