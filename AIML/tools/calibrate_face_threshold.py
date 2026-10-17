"""Calibrate the face-match threshold on your own data.

The default threshold (``FACE_MATCH_THRESHOLD``) is a sensible starting point,
but it can only be tuned properly against representative data: the cameras,
lighting, glasses and webcam quality you actually see. This script measures
false-accept and false-reject rates across a threshold sweep and reports the
Equal Error Rate (EER), so you can pick a threshold instead of guessing.

Dataset layout - one folder per person, several images each:

    dataset/
      alice/  img1.jpg img2.jpg ...
      bob/    img1.jpg img2.jpg ...
      ...

Usage:
    python tools/calibrate_face_threshold.py path/to/dataset
    python tools/calibrate_face_threshold.py path/to/dataset --target-far 0.001
    python tools/calibrate_face_threshold.py path/to/dataset --plot calibration.png

Run from the AIML directory so the face_detection package is importable.
"""

import argparse
import itertools
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def collect_embeddings(dataset_dir: Path, embedding, max_per_person: int = 0):
    """Return {person: [embedding, ...]} for every readable image."""
    import cv2

    people: dict[str, list] = {}
    skipped = 0
    for person_dir in sorted(p for p in dataset_dir.iterdir() if p.is_dir()):
        embeddings = []
        images = [p for p in sorted(person_dir.iterdir()) if p.suffix.lower() in IMAGE_EXTS]
        if max_per_person:
            images = images[:max_per_person]
        for img_path in images:
            frame = cv2.imread(str(img_path))
            if frame is None:
                skipped += 1
                continue
            emb = embedding.generate_embedding(frame)
            if emb is None:
                skipped += 1
                continue
            embeddings.append(emb)
        if embeddings:
            people[person_dir.name] = embeddings
    return people, skipped


def build_pairs(people: dict):
    genuine = []
    impostor = []
    names = list(people.keys())
    for name in names:
        embs = people[name]
        for a, b in itertools.combinations(embs, 2):
            genuine.append((a, b))
    for i, j in itertools.permutations(range(len(names)), 2):
        for a in people[names[i]][:1]:
            for b in people[names[j]][:1]:
                impostor.append((a, b))
    return genuine, impostor


def scores(embedding, pairs):
    result = []
    for a, b in pairs:
        sim = embedding.compare(a, b).get("similarity")
        if sim is not None:
            result.append(sim)
    return result


def sweep(genuine_scores, impostor_scores, thresholds):
    rows = []
    for thr in thresholds:
        far = sum(1 for s in impostor_scores if s >= thr) / max(1, len(impostor_scores))
        frr = sum(1 for s in genuine_scores if s < thr) / max(1, len(genuine_scores))
        rows.append((thr, far, frr))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Calibrate the face-match threshold.")
    parser.add_argument("dataset", type=Path, help="Directory with one subfolder per person")
    parser.add_argument("--target-far", type=float, default=0.001,
                        help="False-accept rate to aim for when recommending a threshold")
    parser.add_argument("--plot", type=Path, default=None, help="Optional PNG path for the sweep plot")
    parser.add_argument("--max-per-person", type=int, default=0, help="Cap images per person (0 = all)")
    args = parser.parse_args()

    if not args.dataset.is_dir():
        print(f"error: {args.dataset} is not a directory")
        return 2

    from face_detection.inference.face_embedding import FaceEmbedding

    embedding = FaceEmbedding()
    print(f"Embedding backend: {embedding.backend_name}")
    if embedding.backend_name not in ("insightface", "onnx_arcface"):
        print("error: no identity-capable backend is loaded, so scores would be meaningless.")
        print("       install insightface (pip install insightface) or provide arcface_r100.onnx.")
        return 2

    people, skipped = collect_embeddings(args.dataset, embedding, args.max_per_person)
    print(f"People: {len(people)}   Skipped images: {skipped}")
    if len(people) < 2:
        print("error: need at least two people to measure impostor scores.")
        return 2

    genuine_pairs, impostor_pairs = build_pairs(people)
    genuine_scores = scores(embedding, genuine_pairs)
    impostor_scores = scores(embedding, impostor_pairs)
    print(f"Genuine scores: {len(genuine_scores)}   Impostor scores: {len(impostor_scores)}")
    if not genuine_scores or not impostor_scores:
        print("error: not enough usable pairs.")
        return 2

    thresholds = [round(0.05 + 0.025 * i, 4) for i in range(37)]  # 0.05 .. 0.95
    rows = sweep(genuine_scores, impostor_scores, thresholds)

    eer_row = min(rows, key=lambda r: abs(r[1] - r[2]))
    eer_thr = eer_row[0]
    eer = (eer_row[1] + eer_row[2]) / 2

    print("\n  threshold    FAR      FRR")
    for thr, far, frr in rows:
        marker = "  <- EER" if abs(thr - eer_thr) < 1e-9 else ""
        print(f"  {thr:8.4f}  {far:6.4f}  {frr:6.4f}{marker}")

    within_target = [r for r in rows if r[1] <= args.target_far]
    recommended = max(within_target, key=lambda r: r[0])[0] if within_target else None

    print(f"\nEqual Error Rate: ~{eer:.4f} at threshold ~{eer_thr:.4f}")
    if recommended is not None:
        row = next(r for r in rows if abs(r[0] - recommended) < 1e-9)
        print(f"Recommended threshold for target FAR {args.target_far}: {recommended:.4f} "
              f"(FAR {row[1]:.4f}, FRR {row[2]:.4f})")
        print(f"Set FACE_MATCH_THRESHOLD={recommended:.4f}")
    else:
        print(f"No threshold reached FAR <= {args.target_far}; collect more impostor data.")

    if args.plot:
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt

            fars = [r[1] for r in rows]
            frrs = [r[2] for r in rows]
            plt.plot(thresholds, fars, label="FAR")
            plt.plot(thresholds, frrs, label="FRR")
            plt.xlabel("Threshold")
            plt.ylabel("Rate")
            plt.title("Face-match threshold sweep")
            plt.legend()
            plt.grid(True, alpha=0.3)
            plt.savefig(args.plot, dpi=120)
            print(f"Saved plot: {args.plot}")
        except Exception as exc:  # noqa: BLE001
            print(f"Could not write plot: {exc}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
