"""Evaluate face verification (1:1) accuracy on the LFW benchmark.

LFW measures whether two face images are the *same person*. For a proctoring
system this is the metric that matters most: it is the exact decision made when
comparing the enrolled reference face against a frame mid-test. A high score
means the identity check works; a low score means it either rejects the real
student (false reject) or accepts an imposter (false accept).

What it reports
---------------
- accuracy at the configured ``FACE_MATCH_THRESHOLD`` (the shipping decision)
- ROC AUC (threshold-independent separability of same vs. different)
- best threshold and the accuracy it achieves
- TPR at FPR = 1e-2 / 1e-3 / 1e-4 (security-relevant operating points)
- mean similarity for genuine and impostor pairs

Usage
-----
    python AIML/scripts/download_face_datasets.py --lfw-only
    python AIML/face_detection/training/evaluate_lfw.py
    python AIML/face_detection/training/evaluate_lfw.py --max-pairs 1000

Notes
-----
This uses the real embedding backend (InsightFace ArcFace / ONNX ArcFace). If
only the histogram fallback is available the script refuses to run unless
``--allow-fallback`` is passed, because a histogram is not an identity
descriptor and its scores are meaningless.

Per-pair cost on CPU (RetinaFace + ArcFace at 640x640) is roughly 0.2-0.6 s, so a
full 6000-pair run takes tens of minutes. Use ``--max-pairs`` for a quick smoke
test and to check the pipeline before committing to the full run.
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

from face_detection.inference.face_embedding import FaceEmbedding  # noqa: E402
from face_detection.utils.config import (  # noqa: E402
    FACE_MATCH_THRESHOLD,
    FACE_RECOGNITION_DIR,
)

DEFAULT_DATASETS_DIR = ROOT / "AIML" / "face_detection" / "datasets"
FPR_TARGETS = (1e-2, 1e-3, 1e-4)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Evaluate 1:1 face verification on LFW.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default=str(DEFAULT_DATASETS_DIR / "lfw"),
        help="LFW root containing the person folders and pairs.txt",
    )
    parser.add_argument("--pairs", type=str, default=None, help="Override path to pairs.txt")
    parser.add_argument(
        "--threshold",
        type=float,
        default=FACE_MATCH_THRESHOLD,
        help=f"Cosine-similarity match threshold (default {FACE_MATCH_THRESHOLD})",
    )
    parser.add_argument("--max-pairs", type=int, default=0, help="Evaluate only the first N pairs (0 = all)")
    parser.add_argument(
        "--allow-fallback",
        action="store_true",
        help="Run even if the embedding backend is the non-identity histogram fallback",
    )
    parser.add_argument("--output", type=str, default=None, help="Output JSON path")
    return parser.parse_args()


def parse_pairs(pairs_path: Path) -> list[tuple[str, int, str, int, int]]:
    """Parse an LFW pairs file into (name1, idx1, name2, idx2, label) tuples.

    ``label`` is 1 for a genuine (same person) pair and 0 for an impostor pair.
    The first line is the pair count and is skipped.
    """
    with pairs_path.open("r", encoding="utf-8") as fh:
        lines = [ln.strip() for ln in fh if ln.strip()]

    pairs: list[tuple[str, int, str, int, int]] = []
    start = 1 if lines and lines[0].isdigit() else 0
    for line in lines[start:]:
        parts = line.split()
        try:
            if len(parts) == 3:
                name, a, b = parts[0], int(parts[1]), int(parts[2])
                pairs.append((name, a, name, b, 1))
            elif len(parts) == 4:
                pairs.append((parts[0], int(parts[1]), parts[2], int(parts[3]), 0))
        except ValueError:
            continue
    return pairs


def image_path(lfw_dir: Path, name: str, idx: int) -> Path:
    return lfw_dir / name / f"{name}_{idx:04d}.jpg"


def run_embedding_pass(
    embedding: FaceEmbedding,
    pairs: list[tuple[str, int, str, int, int]],
    lfw_dir: Path,
    max_pairs: int,
    progress_every: int = 200,
) -> tuple[np.ndarray, np.ndarray, int]:
    """Return (similarities, labels, skipped) over the selected pairs."""
    total = len(pairs) if max_pairs <= 0 else min(len(pairs), max_pairs)
    sims: list[float] = []
    labels: list[int] = []
    skipped = 0

    for i, (n1, a, n2, b, label) in enumerate(pairs[:total]):
        img1 = cv2.imread(str(image_path(lfw_dir, n1, a)))
        img2 = cv2.imread(str(image_path(lfw_dir, n2, b)))
        if img1 is None or img2 is None:
            skipped += 1
            continue

        emb1 = embedding.generate_embedding(img1)
        emb2 = embedding.generate_embedding(img2)
        if emb1 is None or emb2 is None:
            skipped += 1
            continue

        result = embedding.compare(emb1, emb2)
        if result["similarity"] is None:
            skipped += 1
            continue

        sims.append(float(result["similarity"]))
        labels.append(int(label))

        if progress_every and (i + 1) % progress_every == 0:
            print(f"  ...{i + 1}/{total} pairs ({skipped} skipped)")

    return np.asarray(sims, dtype=np.float64), np.asarray(labels, dtype=np.int64), skipped


def compute_metrics(sims: np.ndarray, labels: np.ndarray, threshold: float) -> dict:
    from sklearn.metrics import roc_auc_score, roc_curve

    predicted = (sims >= threshold).astype(np.int64)
    accuracy = float(np.mean(predicted == labels))

    genuine = sims[labels == 1]
    impostor = sims[labels == 0]

    auc = float(roc_auc_score(labels, sims)) if len(np.unique(labels)) > 1 else None
    fpr, tpr, _ = roc_curve(labels, sims)

    tpr_at_fpr = {f"{target:g}": float(np.interp(target, fpr, tpr)) for target in FPR_TARGETS}

    # Sweep every observed similarity to find the most accurate single threshold.
    best_acc, best_thr = accuracy, threshold
    for candidate in np.unique(sims):
        acc = float(np.mean((sims >= candidate).astype(np.int64) == labels))
        if acc > best_acc:
            best_acc, best_thr = acc, float(candidate)

    return {
        "threshold": round(float(threshold), 4),
        "accuracy": round(accuracy, 4),
        "roc_auc": round(auc, 4) if auc is not None else None,
        "best_threshold": round(best_thr, 4),
        "best_accuracy": round(best_acc, 4),
        "tpr_at_fpr": {k: round(v, 4) for k, v in tpr_at_fpr.items()},
        "mean_genuine_similarity": round(float(np.mean(genuine)), 4) if genuine.size else None,
        "mean_impostor_similarity": round(float(np.mean(impostor)), 4) if impostor.size else None,
        "genuine_pairs": int(genuine.size),
        "impostor_pairs": int(impostor.size),
    }


def main() -> int:
    args = parse_args()
    lfw_dir = Path(args.dataset_dir)
    pairs_path = Path(args.pairs) if args.pairs else lfw_dir / "pairs.txt"

    print("=" * 62)
    print("LFW Verification Evaluation")
    print("=" * 62)

    if not pairs_path.exists():
        print(f"ERROR: pairs.txt not found at {pairs_path}")
        print("Run: python AIML/scripts/download_face_datasets.py --lfw-only")
        return 2
    has_person_dirs = lfw_dir.is_dir() and any(
        p.is_dir() and p.name[:1].isupper() for p in lfw_dir.iterdir()
    )
    if not has_person_dirs:
        print(f"ERROR: no LFW person folders found under {lfw_dir}")
        print("Run: python AIML/scripts/download_face_datasets.py --lfw-only")
        return 2

    pairs = parse_pairs(pairs_path)
    if not pairs:
        print(f"ERROR: no pairs parsed from {pairs_path}")
        return 2

    embedding = FaceEmbedding(threshold=args.threshold)
    print(f"Embedding backend : {embedding.backend_name}")

    if embedding.backend_name == "histogram" and not args.allow_fallback:
        print("ERROR: only the histogram fallback is available. It cannot verify identity.")
        print("Install insightface (pip install insightface) or pass --allow-fallback to force a meaningless run.")
        return 2

    total = len(pairs) if args.max_pairs <= 0 else min(len(pairs), args.max_pairs)
    print(f"Pairs to evaluate : {total} of {len(pairs)}")
    print(f"Match threshold   : {args.threshold}")
    print("-" * 62)

    sims, labels, skipped = run_embedding_pass(embedding, pairs, lfw_dir, args.max_pairs)
    if sims.size == 0:
        print("ERROR: no pairs produced embeddings (are the images extracted?).")
        return 2

    metrics = compute_metrics(sims, labels, args.threshold)
    report = {
        "dataset": "LFW",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "backend": embedding.backend_name,
        "pairs_evaluated": int(sims.size),
        "pairs_skipped": int(skipped),
        **metrics,
    }

    print("\nResults")
    print("-" * 62)
    print(f"  pairs evaluated        : {report['pairs_evaluated']} ({skipped} skipped)")
    print(f"  accuracy @ {metrics['threshold']:<6}: {metrics['accuracy']:.4f}")
    print(f"  ROC AUC                : {metrics['roc_auc']}")
    print(f"  best threshold         : {metrics['best_threshold']} (acc {metrics['best_accuracy']:.4f})")
    print(f"  mean genuine similarity: {metrics['mean_genuine_similarity']}")
    print(f"  mean impostor similarity: {metrics['mean_impostor_similarity']}")
    for target, value in metrics["tpr_at_fpr"].items():
        print(f"  TPR @ FPR={target:<6}     : {value:.4f}")

    output_path = Path(args.output) if args.output else FACE_RECOGNITION_DIR / "lfw_evaluation.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(f"\nSaved report to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
