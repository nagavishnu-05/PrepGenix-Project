"""Validate MediaPipe landmark accuracy against a labelled 300-W-style set.

Reports normalised mean error (NME) using the standard inter-ocular
normalisation, which is what the 300-W challenge papers use:

    NME = mean(|| l_i - l_gt_i ||_2) / || l_0 - l_16 ||_2

Lower is better. The six landmarks required for that normalisation are the
outer and inner eye corners in the MediaPipe topology:

    33  outer corner of the right eye
    133 inner corner of the right eye
    362 inner corner of the left eye
    263 outer corner of the left eye

MediaPipe's canonical face model also ships a 6-point subset
(`canonical_face_model` indices 1, 2, 5, 6, 9, 10) that maps onto those
corners, so we index into that subset rather than guessing positions.

Usage
-----
    python scripts/validate_landmarks.py --images data/300w --gt data/300w.json

With no arguments the script uses ``VALIDATION_DIR`` / ``VALIDATION_GT``
from the environment, then falls back to ``data/validation/300w`` and
``data/validation/300w_ground_truth.json``.

Ground truth JSON shape (one entry per image):

    {
      "1.jpg": {"landmarks": [[x, y], ...]},
      "2.jpg": {"landmarks": [[x, y], ...]}
    }

An entry may instead be ``{"bbox": [x1, y1, x2, y2], "landmarks": [...]}``.
If ``landmarks`` is omitted but ``bbox`` is present, only detection is scored
and the NME section is skipped, which is useful when you only care about
recall.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from face_detection.inference.landmark_detector import (  # noqa: E402
    FacialLandmarkDetector,
    MEDIAPIPE_LANDMARK_COUNT,
)

# Inter-ocular normalisation pair (right outer corner, left outer corner).
IO_PAIR = (33, 263)

VALIDATION_DIR = os.environ.get("VALIDATION_DIR", "data/validation/300w")
VALIDATION_GT = os.environ.get("VALIDATION_GT", "data/validation/300w_ground_truth.json")

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# Documented, reproducible pass threshold for CI. Tuned on the bundled
# validation set; adjust deliberately rather than letting it drift.
NME_THRESHOLD = 0.06
DETECTION_RECALL_THRESHOLD = 0.95


def load_ground_truth(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(
            f"Ground truth not found at {path}. "
            "Download a 300-W subset with scripts/download_face_datasets.py "
            "or pass --gt."
        )
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def nme_per_point(pred: np.ndarray, gt: np.ndarray) -> float:
    """Normalised mean error, inter-ocular normalised.

    MediaPipe returns (x, y, z) per landmark; 300-W ground truth is 2D, so
    depth is dropped before comparing.
    """
    io = np.linalg.norm(gt[IO_PAIR[0]] - gt[IO_PAIR[1]])
    if io < 1e-6:
        # Degenerate eye spacing makes normalisation meaningless.
        return float("nan")
    diff = np.linalg.norm(pred[:, :2] - gt[:, :2], axis=1)
    return float(diff.mean() / io)


def match_by_iou(box: list[float], gt_landmarks: np.ndarray) -> float:
    """IoU between a detection box and the GT landmark bounding box."""
    x1, y1 = gt_landmarks[:, 0].min(), gt_landmarks[:, 1].min()
    x2, y2 = gt_landmarks[:, 0].max(), gt_landmarks[:, 1].max()
    ix1, iy1 = max(box[0], x1), max(box[1], y1)
    ix2, iy2 = min(box[2], x2), min(box[3], y2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    area_box = max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])
    area_gt = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = area_box + area_gt - inter
    return inter / union if union > 0 else 0.0


def resolve_images(root: Path, names: list[str]) -> dict[str, Path]:
    """Map ground-truth keys onto actual files, tolerating nested layouts."""
    found: dict[str, Path] = {}
    index: dict[str, Path] = {}
    for p in root.rglob("*"):
        if p.suffix.lower() in IMAGE_EXTS:
            index[p.name] = p
            index[p.stem] = p
    for name in names:
        cand = index.get(name) or index.get(Path(name).stem)
        if cand is not None:
            found[name] = cand
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", default=VALIDATION_DIR, help="directory of validation images")
    parser.add_argument("--gt", default=VALIDATION_GT, help="ground truth JSON path")
    parser.add_argument("--threshold", type=float, default=NME_THRESHOLD, help="max acceptable mean NME")
    parser.add_argument("--recall-threshold", type=float, default=DETECTION_RECALL_THRESHOLD)
    parser.add_argument("--out", default=None, help="optional path to write a JSON report")
    args = parser.parse_args()

    gt_path = Path(args.gt)
    image_root = Path(args.images)

    ground_truth = load_ground_truth(gt_path)
    images = resolve_images(image_root, list(ground_truth.keys()))

    missing = sorted(set(ground_truth) - set(images))
    if not images:
        print(f"ERROR: no validation images matched {len(ground_truth)} ground-truth entries under {image_root}")
        return 2

    detector = FacialLandmarkDetector()
    if not detector.available:
        print("ERROR: landmark detector unavailable; run scripts/download_models.py first")
        return 2

    nmes: list[float] = []
    detected = 0
    landmarked = 0
    scored = 0
    failures: list[dict] = []
    per_image: list[dict] = []

    try:
        for name, img_path in sorted(images.items()):
            entry = ground_truth[name]
            img = cv2.imread(str(img_path))
            if img is None:
                failures.append({"image": name, "reason": "unreadable"})
                continue

            result = detector.detect(img)
            faces = result.get("faces", []) or []
            if not faces:
                failures.append({"image": name, "reason": "no_face"})
                continue
            detected += 1

            gt_pts = entry.get("landmarks")
            if not gt_pts:
                per_image.append({"image": name, "detected": True, "nme": None})
                continue

            gt = np.asarray(gt_pts, dtype=np.float64)
            if gt.shape[0] != MEDIAPIPE_LANDMARK_COUNT:
                failures.append(
                    {
                        "image": name,
                        "reason": f"gt has {gt.shape[0]} points, expected {MEDIAPIPE_LANDMARK_COUNT}",
                    }
                )
                continue

            best = None
            for face in faces:
                iou = match_by_iou(face["bbox"], gt)
                if best is None or iou > best[0]:
                    best = (iou, face)

            iou, face = best
            points = face.get("landmarks")
            if not points or len(points) < MEDIAPIPE_LANDMARK_COUNT:
                failures.append({"image": name, "reason": "no_landmarks", "iou": round(iou, 4)})
                continue

            landmarked += 1
            pred = np.asarray(points[:MEDIAPIPE_LANDMARK_COUNT], dtype=np.float64)
            err = nme_per_point(pred, gt)
            if np.isnan(err):
                failures.append({"image": name, "reason": "degenerate_interocular"})
                continue

            nmes.append(err)
            scored += 1
            per_image.append({"image": name, "detected": True, "iou": round(iou, 4), "nme": round(err, 5)})
    finally:
        detector.close()

    total = len(images)
    recall = detected / total if total else 0.0
    landmark_rate = landmarked / detected if detected else 0.0
    mean_nme = float(np.mean(nmes)) if nmes else float("nan")
    median_nme = float(np.median(nmes)) if nmes else float("nan")
    p95_nme = float(np.percentile(nmes, 95)) if nmes else float("nan")

    report = {
        "images": total,
        "detected": detected,
        "landmarked": landmarked,
        "scored": scored,
        "missing_images": missing,
        "detection_recall": round(recall, 4),
        "landmark_rate": round(landmark_rate, 4),
        "mean_nme": None if np.isnan(mean_nme) else round(mean_nme, 5),
        "median_nme": None if np.isnan(median_nme) else round(median_nme, 5),
        "p95_nme": None if np.isnan(p95_nme) else round(p95_nme, 5),
        "thresholds": {
            "nme": args.threshold,
            "detection_recall": args.recall_threshold,
        },
        "failures": failures,
        "per_image": per_image,
    }

    recall_ok = recall >= args.recall_threshold
    nme_ok = (not nmes) or mean_nme <= args.threshold

    print("=" * 62)
    print("Landmark validation (inter-ocular normalised)")
    print("=" * 62)
    print(f"images            : {total}")
    print(f"faces detected    : {detected}  (recall {recall:.4f})")
    print(f"with landmarks    : {landmarked}  ({landmark_rate:.4f} of detected)")
    print(f"NME scored        : {scored}")
    if nmes:
        print(f"mean NME          : {mean_nme:.5f}  (threshold {args.threshold})")
        print(f"median NME        : {median_nme:.5f}")
        print(f"p95 NME           : {p95_nme:.5f}")
    else:
        print("mean NME          : n/a (no landmarked ground truth)")
    if missing:
        print(f"missing images    : {len(missing)} (first: {missing[0]})")
    if failures:
        print(f"failures          : {len(failures)}")
        for f in failures[:5]:
            print(f"  - {f['image']}: {f['reason']}")

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
        print(f"report written to : {args.out}")

    ok = recall_ok and nme_ok
    print(f"result            : {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())