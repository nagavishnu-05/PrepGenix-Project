"""Measure identity verification accuracy on the LFW pairs protocol.

The runtime path (SCRFD/RetinaFace detection -> ArcFace embedding on the
aligned crop) is used unchanged so the numbers describe the code that actually
runs during an assessment, not a research notebook.

    python scripts/evaluate_lfw.py --pairs 1200
    python scripts/evaluate_lfw.py --pairs 6000 --folds 10

Embeddings are cached per image path, so a second run is instant. Pass
--augment to also score blurred/dimmed/JPEG-degraded copies, which approximates
the low-quality webcam frames an assessment is served over.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

AIML_ROOT = Path(__file__).resolve().parent.parent
if str(AIML_ROOT) not in sys.path:
    sys.path.insert(0, str(AIML_ROOT))

from face_detection.inference.face_detector import FaceDetector
from face_detection.inference.face_embedding import FaceEmbedding
from face_detection.utils.config import FACE_MODEL_PACK

DEFAULT_LFW = AIML_ROOT / "face_detection" / "datasets" / "lfw"
DEFAULT_IMAGES = DEFAULT_LFW / "lfw"
DEFAULT_CACHE = AIML_ROOT / "data" / "validation" / "lfw_embeddings.json"


def parse_pairs(path: Path) -> list[tuple[str, str, int, int]]:
    """Read the bundled LFW pair list.

    Layout: first line is "<folds>\t<pairs per fold>", then one pair per line.

      Name \\t idx \\t idx            -> same identity (two images of that person)
      Name \\t idx \\t Name \\t idx   -> different identities

    Image indices are 1-based and map to <Name>/<Name>_%04d.jpg. Folds are not
    stored per line; they are assigned by position so the official split
    (3000 same / 3000 different over 10 folds) is reproduced.
    """
    lines = [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    if not lines:
        return []

    header = [p for p in lines[0].split("\t") if p]
    n_folds = int(header[0]) if header and header[0].isdigit() else 10
    per_fold = int(header[1]) if len(header) > 1 and header[1].isdigit() else 0

    entries: list[tuple[str, str, int]] = []
    for line in lines[1:]:
        parts = [p for p in line.split("\t") if p]
        if len(parts) == 3:
            name, idx_a, idx_b = parts
            entries.append(
                (
                    f"{name}/{name}_{int(idx_a):04d}.jpg",
                    f"{name}/{name}_{int(idx_b):04d}.jpg",
                    1,
                )
            )
        elif len(parts) >= 4:
            name_a, idx_a, name_b, idx_b = parts[:4]
            entries.append(
                (
                    f"{name_a}/{name_a}_{int(idx_a):04d}.jpg",
                    f"{name_b}/{name_b}_{int(idx_b):04d}.jpg",
                    0,
                )
            )

    pairs: list[tuple[str, str, int, int]] = []
    for i, (a, b, label) in enumerate(entries):
        fold = (i // per_fold) % n_folds if per_fold else i % n_folds
        pairs.append((a, b, label, fold))
    return pairs


def augment_image(img: np.ndarray, level: int = 1) -> np.ndarray:
    """Degrade a clean frame the way a real webcam feed does."""
    if level <= 0:
        return img
    out = cv2.GaussianBlur(img, (5, 5), 2)
    if level >= 2:
        out = cv2.resize(out, None, fx=0.6, fy=0.6, interpolation=cv2.INTER_AREA)
        out = cv2.resize(out, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
    out = (out.astype(np.float32) * 0.72 + 28).clip(0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", out, [int(cv2.IMWRITE_JPEG_QUALITY), 55])
    if ok:
        out = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    return out


def embed_image(
    detector: FaceDetector,
    embedding: FaceEmbedding,
    img: np.ndarray,
) -> tuple[np.ndarray | None, dict]:
    """Embed the largest face in an image using the runtime code path."""
    det = detector.detect(img)
    if not det.get("faces"):
        return None, {"reason": "no_face"}
    face = max(
        det["faces"],
        key=lambda f: (f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1]),
    )
    x1, y1, x2, y2 = face["bbox"]
    crop = img[y1:y2, x1:x2]
    if crop is None or crop.size == 0:
        return None, {"reason": "bad_crop"}
    kps = face.get("landmarks")
    vec = embedding.generate_embedding_from_crop(crop, kps=kps, frame=img)
    if vec is None:
        return None, {"reason": "no_embedding"}
    return vec.astype(np.float32), {"detector": det.get("backend"), "bbox": face["bbox"]}


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def roc_stats(sims: np.ndarray, labels: np.ndarray) -> dict:
    """AUC, EER and threshold metrics without extra dependencies."""
    pos = int(labels.sum())
    neg = int(labels.size - pos)
    if pos == 0 or neg == 0:
        return {}
    # Walk thresholds from the highest score down: every point is (FPR, TPR) at
    # one threshold, both rising, so prepending (0,0) and appending (1,1) gives
    # the ROC curve directly.
    order = np.argsort(-sims)
    sorted_sims = sims[order]
    sorted_labels = labels[order]
    true_pos = np.cumsum(sorted_labels)
    false_pos = np.cumsum(1 - sorted_labels)
    scores = np.concatenate([[-np.inf], sorted_sims, [np.inf]])
    tpr = np.concatenate([[0.0], true_pos / pos, [1.0]])
    fpr = np.concatenate([[0.0], false_pos / neg, [1.0]])
    auc = float(np.trapezoid(tpr, fpr))

    eer_idx = int(np.argmin(np.abs(tpr - (1 - fpr))))
    eer = float((1 - tpr[eer_idx] + fpr[eer_idx]) / 2)

    table = []
    for thr in np.arange(0.05, 0.96, 0.025):
        t = float(round(thr, 3))
        predicted = sims >= t
        tp = int((predicted & (labels == 1)).sum())
        fp = int((predicted & (labels == 0)).sum())
        fn = int((~predicted & (labels == 1)).sum())
        tn = int((~predicted & (labels == 0)).sum())
        table.append(
            {
                "threshold": t,
                "accuracy": round((tp + tn) / max(tp + tn + fp + fn, 1), 4),
                "tpr": round(tp / max(pos, 1), 4),
                "fpr": round(fp / max(neg, 1), 5),
                "fnr": round(fn / max(pos, 1), 4),
            }
        )

    j = tpr - (1 - fpr)
    best_j = int(np.where(j >= j.max() - 1e-12)[0][-1])
    # Highest threshold that still keeps false accusations at or below the limit.
    safe = np.where(fpr <= 0.001)[0]
    safe_idx = int(safe[-1]) if len(safe) else None

    return {
        "auc": round(auc, 5),
        "eer": round(eer, 5),
        "positives": pos,
        "negatives": neg,
        "best_threshold_youden": round(float(scores[best_j]), 4),
        "best_youden_tpr": round(float(tpr[best_j]), 4),
        "best_youden_fpr": round(float(fpr[best_j]), 5),
        "threshold_at_fpr_1e-3": (round(float(scores[safe_idx]), 4) if safe_idx is not None else None),
        "threshold_table": table,
    }


def cross_validate(sims: np.ndarray, labels: np.ndarray, folds: np.ndarray, n_folds: int) -> dict:
    """Standard LFW 10-fold protocol: train-free threshold, test per fold."""
    fold_results = []
    for fold in range(n_folds):
        test = folds == fold
        train = ~test
        if not test.any():
            continue
        train_sims = sims[train]
        train_labels = labels[train]
        pos = train_sims[train_labels == 1]
        neg = train_sims[train_labels == 0]
        # Midpoint between the train impostor maximum and genuine median is a
        # conservative, data-derived threshold with no test leakage.
        if pos.size and neg.size:
            thr = (float(np.percentile(neg, 99.9)) + float(np.percentile(pos, 50))) / 2
        elif neg.size:
            thr = float(np.percentile(neg, 99.9))
        else:
            thr = 0.5
        pred = sims[test] >= thr
        correct = int((pred == (labels[test] == 1)).sum())
        fold_results.append(
            {
                "fold": fold,
                "pairs": int(test.sum()),
                "threshold": round(thr, 4),
                "accuracy": round(correct / int(test.sum()), 4),
            }
        )
    accs = [f["accuracy"] for f in fold_results]
    if not accs:
        return {}
    std = float(np.std(accs))
    return {
        "folds": fold_results,
        "mean_accuracy": round(float(np.mean(accs)), 4),
        "std_accuracy": round(std, 4),
        "accuracy_pct": f"{np.mean(accs) * 100:.2f}% +/- {std * 100:.3f}%",
    }


def load_cache(path: Path) -> dict:
    """Load cached embeddings, normalising both the old and new cache shapes."""
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {
        k: (v if isinstance(v, dict) and "embedding" in v else {"embedding": v})
        for k, v in raw.items()
    }


def save_cache(path: Path, cache: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        k: (v if isinstance(v, list) else v["embedding"])
        for k, v in cache.items()
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lfw", default=str(DEFAULT_LFW), help="LFW root (contains pairs.txt)")
    ap.add_argument("--images", default=str(DEFAULT_IMAGES), help="directory holding the per-identity folders")
    ap.add_argument("--pairs-file", default=None, help="defaults to <lfw>/pairs.txt")
    ap.add_argument("--pairs", type=int, default=1200, help="number of pairs to score (0 = all)")
    ap.add_argument("--folds", type=int, default=10, help="folds for cross-validation")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--augment", action="store_true", help="also score degraded copies")
    ap.add_argument("--cache", default=str(DEFAULT_CACHE))
    ap.add_argument("--out", default=None, help="write the full report as JSON")
    args = ap.parse_args()

    lfw_root = Path(args.lfw)
    images_root = Path(args.images)
    pairs_file = Path(args.pairs_file) if args.pairs_file else lfw_root / "pairs.txt"
    if not pairs_file.exists():
        print(f"pairs file not found: {pairs_file}")
        return 2

    pairs = parse_pairs(pairs_file)
    random.Random(args.seed).shuffle(pairs)
    if args.pairs:
        # Keep the same/different balance of the official protocol.
        same = [p for p in pairs if p[2] == 1]
        diff = [p for p in pairs if p[2] == 0]
        half = args.pairs // 2
        pairs = same[:half] + diff[: args.pairs - half]

    print(f"scoring {len(pairs)} pairs from {pairs_file.name}")

    detector = FaceDetector()
    embedding = FaceEmbedding()
    print(f"backends: detector={detector.backend_name} embedding={embedding.backend_name}")
    if embedding.backend_name != "insightface":
        print("WARNING: identity backend is not ArcFace; results will not be meaningful.")

    cache_path = Path(args.cache)
    cache = load_cache(cache_path)
    variants = ["clean"] + (["aug"] if args.augment else [])

    needed = sorted({p[0] for p in pairs} | {p[1] for p in pairs})
    print(f"{len(needed)} unique images, cache has {len(cache)}")
    # Embeddings are only comparable within one recognition model, so the pack
    # name is part of every cache key.
    cache_key = lambda rel, variant: f"{FACE_MODEL_PACK}|{rel}|{variant}"  # noqa: E731

    started = time.time()
    missing = [rel for rel in needed if any(cache_key(rel, v) not in cache for v in variants)]
    for i, rel in enumerate(missing, 1):
        file_path = images_root / rel
        if not file_path.exists():
            continue
        img = cv2.imread(str(file_path))
        if img is None:
            continue
        for variant in variants:
            src = img if variant == "clean" else augment_image(img)
            vec, _meta = embed_image(detector, embedding, src)
            if vec is None:
                continue
            cache[cache_key(rel, variant)] = {"embedding": vec.tolist(), "variant": variant}
        if i % 100 == 0 or i == len(missing):
            rate = i / max(time.time() - started, 1e-6)
            print(f"  embedded {i}/{len(missing)} ({rate:.1f} img/s)")

    save_cache(cache_path, cache)

    report: dict = {
        "pairs_file": str(pairs_file),
        "pairs_scored": len(pairs),
        "face_model_pack": FACE_MODEL_PACK,
        "detector_backend": detector.backend_name,
        "embedding_backend": embedding.backend_name,
        "current_threshold": embedding.threshold,
    }

    for variant in variants:
        sims, labels, folds = [], [], []
        skipped = 0
        for a, b, label, fold in pairs:
            va = cache.get(cache_key(a, variant))
            vb = cache.get(cache_key(b, variant))
            if va is None or vb is None:
                skipped += 1
                continue
            sims.append(cosine(np.asarray(va["embedding"]), np.asarray(vb["embedding"])))
            labels.append(label)
            folds.append(fold)
        if not sims:
            print(f"{variant}: no scored pairs")
            continue
        sims_a = np.asarray(sims)
        labels_a = np.asarray(labels)
        folds_a = np.asarray(folds)
        pos = sims_a[labels_a == 1]
        neg = sims_a[labels_a == 0]
        print(f"\n=== variant: {variant} ===")
        print(f"pairs scored {len(sims_a)} (skipped {skipped})")
        if pos.size:
            print(
                "same-identity similarity : mean %.4f  p1 %.4f  p5 %.4f  median %.4f"
                % (pos.mean(), np.percentile(pos, 1), np.percentile(pos, 5), np.median(pos))
            )
        if neg.size:
            print(
                "different-identity similarity: mean %.4f  p99 %.4f  p99.9 %.4f  max %.4f"
                % (neg.mean(), np.percentile(neg, 99), np.percentile(neg, 99.9), neg.max())
            )
        stats = roc_stats(sims_a, labels_a)
        cv = cross_validate(sims_a, labels_a, folds_a, args.folds)
        if cv:
            print("10-fold accuracy: %s" % cv.get("accuracy_pct"))
        if stats:
            print(
                "AUC %.4f  EER %.4f  youden threshold %.3f (tpr %.3f fpr %.4f)"
                % (
                    stats["auc"],
                    stats["eer"],
                    stats["best_threshold_youden"],
                    stats["best_youden_tpr"],
                    stats["best_youden_fpr"],
                )
            )
            print("threshold at FPR<=1e-3: %s" % stats["threshold_at_fpr_1e-3"])
            print("\n thr    acc     tpr     fnr     fpr")
            for row in stats["threshold_table"]:
                print(
                    " %.3f  %.4f  %.4f  %.4f  %.5f"
                    % (row["threshold"], row["accuracy"], row["tpr"], row["fnr"], row["fpr"])
                )
        report[variant] = {"stats": stats, "cross_validation": cv, "skipped": skipped}

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nreport written to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())