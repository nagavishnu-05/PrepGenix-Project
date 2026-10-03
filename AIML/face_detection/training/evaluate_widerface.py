"""Evaluate face detection on the WIDER FACE benchmark.

WIDER FACE is the standard detection benchmark: 32,203 images with ~394k faces,
grouped into Easy / Medium / Hard subsets by face size, blur, illumination,
expression, occlusion and pose. A proctoring system needs reliable detection of
*every* face in frame, because a missed second face is a missed "another person
is present" violation.

This script computes Average Precision at IoU 0.5 (the standard WIDER/Face
Detection metric) for each subset, using a greedy confidence-ordered matcher and
VOC-style AP integration. It also reports the best-F1 operating point per subset.

Usage
-----
    python AIML/scripts/download_face_datasets.py --wider-only
    python AIML/face_detection/training/evaluate_widerface.py --backend insightface
    python AIML/face_detection/training/evaluate_widerface.py --max-images 200   # smoke test

Notes
-----
- Default subset is ``val`` (3,226 images). ``--include-train`` is only needed if
  you also downloaded WIDER_train.
- For meaningful numbers use ``--backend insightface`` (RetinaFace). The default
  ``auto`` backend picks the single-face MediaPipe short-range detector, which is
  built for webcam distances and will underreport small faces.
- CPU detection of the full val set takes several minutes.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "AIML"))

from face_detection.inference.face_detector import FaceDetector  # noqa: E402
from face_detection.utils.config import FACE_DETECTOR_DIR  # noqa: E402

DEFAULT_DATASETS_DIR = ROOT / "AIML" / "face_detection" / "datasets"

# WIDER attribute order on each GT line:
#   x y w h blur expr illum invalid occl pose
# Easy/Medium/Hard membership follows the official wider_eval definitions.
SUBSET_FILTERS = {
    "easy": lambda b: b["invalid"] == 0,
    "medium": lambda b: (
        b["invalid"] == 0 and b["blur"] <= 1 and b["expr"] == 0 and b["illum"] == 0 and b["occl"] <= 2
    ),
    "hard": lambda b: (
        b["invalid"] == 0
        and b["blur"] <= 2
        and b["expr"] <= 1
        and b["illum"] <= 1
        and b["occl"] <= 2
        and b["pose"] <= 1
    ),
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Evaluate face detection on WIDER FACE (AP@IoU 0.5).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default=str(DEFAULT_DATASETS_DIR / "widerface"),
        help="WIDER FACE root (contains WIDER_val/ and wider_face_split/)",
    )
    parser.add_argument("--split", choices=["val", "train"], default="val")
    parser.add_argument("--max-images", type=int, default=0, help="Evaluate only the first N images (0 = all)")
    parser.add_argument(
        "--confidence",
        type=float,
        default=0.03,
        help="Detector confidence threshold; keep low for a full PR curve (default 0.03)",
    )
    parser.add_argument("--iou", type=float, default=0.5, help="IoU threshold for a true positive (default 0.5)")
    parser.add_argument(
        "--backend",
        choices=["auto", "mediapipe", "insightface", "opencv_dnn", "haar_cascade"],
        default="insightface",
        help="Detector backend (default insightface)",
    )
    parser.add_argument("--output", type=str, default=None, help="Output JSON path")
    return parser.parse_args()


def parse_gt(gt_path: Path) -> list[tuple[str, list[dict]]]:
    """Parse a wider_face_*_bbx_gt.txt file into (relative_image_path, boxes)."""
    with gt_path.open("r", encoding="utf-8") as fh:
        lines = fh.read().splitlines()

    entries: list[tuple[str, list[dict]]] = []
    i = 0
    n = len(lines)
    while i < n:
        rel = lines[i].strip()
        i += 1
        if not rel:
            continue
        if i >= n:
            break
        try:
            count = int(lines[i].strip())
        except ValueError:
            # A malformed header: skip this block defensively.
            continue
        i += 1
        boxes: list[dict] = []
        for _ in range(count):
            if i >= n:
                break
            parts = lines[i].split()
            i += 1
            if len(parts) < 10:
                continue
            try:
                x, y, w, h, blur, expr, illum, invalid, occl, pose = (int(float(v)) for v in parts[:10])
            except ValueError:
                continue
            boxes.append(
                {
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h,
                    "blur": blur,
                    "expr": expr,
                    "illum": illum,
                    "invalid": invalid,
                    "occl": occl,
                    "pose": pose,
                }
            )
        entries.append((rel, boxes))
    return entries


def resolve_paths(dataset_dir: Path, split: str) -> tuple[Path, Path]:
    images_candidates = [
        dataset_dir / f"WIDER_{split}" / "images",
        dataset_dir / f"WIDER_{split}",
        dataset_dir / "images",
        dataset_dir,
    ]
    gt_candidates = [
        dataset_dir / "wider_face_split" / f"wider_face_{split}_bbx_gt.txt",
        dataset_dir / f"wider_face_{split}_bbx_gt.txt",
    ]

    images_root = next((p for p in images_candidates if p.is_dir()), None)
    gt_path = next((p for p in gt_candidates if p.is_file()), None)

    if images_root is None:
        raise FileNotFoundError(
            f"Could not find images for split '{split}' under {dataset_dir} "
            f"(looked for {[str(p) for p in images_candidates]})"
        )
    if gt_path is None:
        raise FileNotFoundError(
            f"Could not find ground-truth for split '{split}' under {dataset_dir} "
            f"(looked for {[str(p) for p in gt_candidates]})"
        )
    return images_root, gt_path


def iou(a: list[float], b: dict) -> float:
    """IoU of a detection [x1,y1,x2,y2] against a GT box dict (x,y,w,h)."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = bx1 + b["w"], by1 + b["h"]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def voc_ap(recall: np.ndarray, precision: np.ndarray) -> float:
    """VOC-style area under the precision-recall curve."""
    mrec = np.concatenate(([0.0], recall, [1.0]))
    mpre = np.concatenate(([0.0], precision, [0.0]))
    for i in range(len(mpre) - 1, 0, -1):
        mpre[i - 1] = max(mpre[i - 1], mpre[i])
    idx = np.where(mrec[1:] != mrec[:-1])[0]
    return float(np.sum((mrec[idx + 1] - mrec[idx]) * mpre[idx + 1]))


def evaluate_subset(
    detections: list[tuple[float, int, list[float]]],
    gt_boxes: dict[int, list[dict]],
    iou_threshold: float,
) -> dict | None:
    npos = sum(len(v) for v in gt_boxes.values())
    if npos == 0 or not detections:
        return None

    detections = sorted(detections, key=lambda d: d[0], reverse=True)
    matched = {img: np.zeros(len(boxes), dtype=bool) for img, boxes in gt_boxes.items()}
    tp = np.zeros(len(detections), dtype=np.float64)
    fp = np.zeros(len(detections), dtype=np.float64)

    for di, (_conf, img_idx, box) in enumerate(detections):
        boxes = gt_boxes.get(img_idx)
        if not boxes:
            fp[di] = 1.0
            continue
        best_iou, best_j = iou_threshold, -1
        for j, gbox in enumerate(boxes):
            if matched[img_idx][j]:
                continue
            ov = iou(box, gbox)
            if ov >= best_iou:
                best_iou, best_j = ov, j
        if best_j >= 0:
            tp[di] = 1.0
            matched[img_idx][best_j] = True
        else:
            fp[di] = 1.0

    tp_cum = np.cumsum(tp)
    fp_cum = np.cumsum(fp)
    recall = tp_cum / npos
    precision = tp_cum / np.maximum(tp_cum + fp_cum, 1e-12)

    f1 = 2 * precision * recall / np.maximum(precision + recall, 1e-12)
    k = int(np.argmax(f1))

    return {
        "ap": round(float(voc_ap(recall, precision)), 4),
        "gt_faces": int(npos),
        "detections": int(len(detections)),
        "best_f1": round(float(f1[k]), 4),
        "best_confidence": round(float(detections[k][0]), 4),
        "precision_at_best_f1": round(float(precision[k]), 4),
        "recall_at_best_f1": round(float(recall[k]), 4),
    }


def main() -> int:
    args = parse_args()
    dataset_dir = Path(args.dataset_dir)

    print("=" * 62)
    print("WIDER FACE Detection Evaluation")
    print("=" * 62)

    try:
        images_root, gt_path = resolve_paths(dataset_dir, args.split)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}")
        print("Run: python AIML/scripts/download_face_datasets.py --wider-only")
        return 2

    entries = parse_gt(gt_path)
    if not entries:
        print(f"ERROR: no entries parsed from {gt_path}")
        return 2

    limit = len(entries) if args.max_images <= 0 else min(len(entries), args.max_images)
    print(f"Images root  : {images_root}")
    print(f"Ground truth : {gt_path}")
    print(f"Images       : {limit} of {len(entries)}")
    print(f"Backend      : {args.backend}  (confidence {args.confidence}, IoU {args.iou})")
    print("-" * 62)

    detector = FaceDetector(confidence_threshold=args.confidence, backend=args.backend)
    actual_backend = detector.backend_name
    if actual_backend != args.backend and args.backend not in ("auto",):
        print(f"WARNING: requested backend '{args.backend}' unavailable; using '{actual_backend}'")
    print(f"Active detector backend: {actual_backend}")

    detections: list[tuple[float, int, list[float]]] = []
    gt_all: list[list[dict]] = []
    read_failures = 0

    for img_idx, (rel, boxes) in enumerate(entries[:limit]):
        image = cv2.imread(str(images_root / rel))
        gt_all.append(boxes)
        if image is None:
            read_failures += 1
            continue
        result = detector.detect(image)
        for face in result["faces"]:
            conf = float(face["confidence"])
            if conf < args.confidence:
                continue
            detections.append((conf, img_idx, [float(v) for v in face["bbox"]]))
        if (img_idx + 1) % 250 == 0:
            print(f"  ...{img_idx + 1}/{limit} images ({len(detections)} detections)")

    if read_failures == limit:
        print(f"ERROR: could not read any image under {images_root}")
        return 2
    if read_failures:
        print(f"WARNING: {read_failures} image(s) could not be read")

    subsets = {}
    for name, condition in SUBSET_FILTERS.items():
        gt_boxes = {
            img_idx: [b for b in boxes if condition(b)]
            for img_idx, boxes in enumerate(gt_all)
        }
        gt_boxes = {k: v for k, v in gt_boxes.items() if v}
        metrics = evaluate_subset(detections, gt_boxes, args.iou)
        if metrics is not None:
            subsets[name] = metrics

    if not subsets:
        print("ERROR: no evaluable faces found for any subset.")
        return 2

    report = {
        "dataset": "WIDER FACE",
        "split": args.split,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "backend": actual_backend,
        "iou_threshold": args.iou,
        "confidence_threshold": args.confidence,
        "images_evaluated": limit,
        "images_unreadable": read_failures,
        "subsets": subsets,
    }

    print("\nResults (AP @ IoU %.2f)" % args.iou)
    print("-" * 62)
    for name in ("easy", "medium", "hard"):
        m = subsets.get(name)
        if not m:
            continue
        print(
            f"  {name.capitalize():<7}: AP {m['ap']:.4f}  "
            f"(best F1 {m['best_f1']:.4f} @ conf {m['best_confidence']}, "
            f"{m['gt_faces']} GT faces)"
        )

    output_path = Path(args.output) if args.output else FACE_DETECTOR_DIR / "widerface_evaluation.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(f"\nSaved report to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
