"""Fine-tune a one-class YOLO face detector using the local 300W-LP annotations.

The dataset's 68 2D landmarks are converted into padded face boxes. Source
images are split by their original image ID so pose variants cannot leak across
the train and validation sets.

Usage:
    python AIML/face_detection/training/train_300w_lp_detector.py
"""

import argparse
import hashlib
import json
import os
import random
import re
import shutil
import tempfile
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from scipy.io import loadmat

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATASET = ROOT / "AIML" / "Datasets" / "300W_LP"
DEFAULT_PRETRAINED = ROOT / "AIML" / "models" / "yolov8n.pt"
DEFAULT_OUTPUT = ROOT / "AIML" / "models" / "face_detection" / "yolov8n-face-300w-lp.pt"
SOURCE_FOLDERS = (
    "AFW",
    "AFW_Flip",
    "HELEN",
    "HELEN_Flip",
    "IBUG",
    "IBUG_Flip",
    "LFPW",
    "LFPW_Flip",
)
SOURCE_ID_SUFFIX = re.compile(r"_\d+_\d+$")
FACE_PADDING = 0.18


def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune a face detector on 300W-LP")
    parser.add_argument("--dataset-dir", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--pretrained", type=Path, default=DEFAULT_PRETRAINED)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--img-size", type=int, default=320)
    parser.add_argument("--max-images", type=int, default=6000, help="Maximum sampled images across train and validation")
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def discover_groups(dataset_dir: Path) -> dict[str, list[Path]]:
    groups = defaultdict(list)
    for folder in SOURCE_FOLDERS:
        folder_path = dataset_dir / folder
        if not folder_path.is_dir():
            continue
        for image_path in folder_path.glob("*.jpg"):
            if image_path.with_suffix(".mat").is_file():
                source_id = SOURCE_ID_SUFFIX.sub("", image_path.stem)
                groups[source_id].append(image_path)
    return dict(groups)


def split_source_ids(source_ids: list[str], seed: int) -> tuple[list[str], list[str]]:
    train_ids = []
    validation_ids = []
    for source_id in source_ids:
        digest = hashlib.sha1(f"{seed}:{source_id}".encode("utf-8")).hexdigest()
        (validation_ids if int(digest[:8], 16) % 100 < 15 else train_ids).append(source_id)
    return train_ids, validation_ids


def choose_images(groups: dict[str, list[Path]], source_ids: list[str], limit: int, per_source: int, rng: random.Random) -> list[Path]:
    rng.shuffle(source_ids)
    chosen = []
    for source_id in source_ids:
        candidates = groups[source_id][:]
        rng.shuffle(candidates)
        chosen.extend(candidates[:per_source])
        if limit and len(chosen) >= limit:
            return chosen[:limit]
    return chosen


def face_box(annotation_path: Path, image_width: int, image_height: int) -> tuple[float, float, float, float]:
    annotation = loadmat(annotation_path, squeeze_me=True)
    points = np.asarray(annotation["pt2d"], dtype=np.float32)
    if points.ndim != 2:
        raise ValueError(f"Unexpected landmark dimensions in {annotation_path}")
    if points.shape[0] != 2 and points.shape[1] == 2:
        points = points.T
    if points.shape[0] != 2 or points.shape[1] < 10 or not np.isfinite(points).all():
        raise ValueError(f"Invalid 2D landmarks in {annotation_path}")

    x_min, y_min = points.min(axis=1)
    x_max, y_max = points.max(axis=1)
    width = max(float(x_max - x_min), 1.0)
    height = max(float(y_max - y_min), 1.0)
    x_min -= width * FACE_PADDING
    x_max += width * FACE_PADDING
    y_min -= height * FACE_PADDING
    y_max += height * FACE_PADDING

    x_min = max(0.0, min(float(image_width), float(x_min)))
    y_min = max(0.0, min(float(image_height), float(y_min)))
    x_max = max(0.0, min(float(image_width), float(x_max)))
    y_max = max(0.0, min(float(image_height), float(y_max)))
    if x_max <= x_min or y_max <= y_min:
        raise ValueError(f"Landmarks produced an empty face box in {annotation_path}")
    return x_min, y_min, x_max, y_max


def link_or_copy(source: Path, destination: Path) -> None:
    try:
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)


def materialize_split(image_paths: list[Path], root: Path, split: str) -> int:
    image_dir = root / "images" / split
    label_dir = root / "labels" / split
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)
    written = 0

    for source in image_paths:
        frame = cv2.imread(str(source))
        if frame is None:
            continue
        height, width = frame.shape[:2]
        try:
            x1, y1, x2, y2 = face_box(source.with_suffix(".mat"), width, height)
        except (KeyError, OSError, ValueError) as error:
            print(f"Skipping {source.name}: {error}")
            continue

        name = f"{source.parent.name}_{source.name}"
        output_image = image_dir / name
        output_label = label_dir / f"{Path(name).stem}.txt"
        center_x = ((x1 + x2) / 2) / width
        center_y = ((y1 + y2) / 2) / height
        box_width = (x2 - x1) / width
        box_height = (y2 - y1) / height
        output_label.write_text(
            f"0 {center_x:.6f} {center_y:.6f} {box_width:.6f} {box_height:.6f}\n",
            encoding="utf-8",
        )
        link_or_copy(source, output_image)
        written += 1

    return written


def main() -> int:
    args = parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.img_size < 64:
        raise ValueError("epochs, batch size, and image size must be positive")
    if args.max_images < 0:
        raise ValueError("max-images cannot be negative")
    if not args.pretrained.is_file():
        raise FileNotFoundError(f"Pretrained YOLO weights not found: {args.pretrained}")

    groups = discover_groups(args.dataset_dir)
    if not groups:
        raise FileNotFoundError(f"No paired .jpg/.mat 300W-LP samples found under {args.dataset_dir}")
    train_ids, validation_ids = split_source_ids(list(groups), args.seed)
    if not train_ids or not validation_ids:
        raise ValueError("A source-grouped train/validation split could not be created")

    max_images = args.max_images
    validation_limit = max(1, round(max_images * 0.15)) if max_images else 0
    train_limit = max_images - validation_limit if max_images else 0
    train_paths = choose_images(groups, train_ids, train_limit, 4, random.Random(args.seed))
    validation_paths = choose_images(groups, validation_ids, validation_limit, 2, random.Random(args.seed + 1))
    if not train_paths or not validation_paths:
        raise ValueError("Not enough paired 300W-LP samples for both splits")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    work_parent = args.output.parent
    with tempfile.TemporaryDirectory(prefix="300w-lp-yolo-", dir=work_parent) as temp_path:
        dataset_root = Path(temp_path) / "dataset"
        train_count = materialize_split(train_paths, dataset_root, "train")
        validation_count = materialize_split(validation_paths, dataset_root, "val")
        if not train_count or not validation_count:
            raise ValueError("No valid face annotations were produced for both train and validation")

        dataset_yaml = Path(temp_path) / "dataset.yaml"
        dataset_yaml.write_text(
            "\n".join(
                (
                    f"path: '{dataset_root.as_posix()}'",
                    "train: images/train",
                    "val: images/val",
                    "names:",
                    "  0: face",
                    "",
                )
            ),
            encoding="utf-8",
        )

        import torch
        from ultralytics import YOLO

        device = 0 if torch.cuda.is_available() else "cpu"
        print(f"Training on {device}; source-grouped samples: {train_count} train, {validation_count} validation")
        model = YOLO(str(args.pretrained))
        model.train(
            data=str(dataset_yaml),
            epochs=args.epochs,
            batch=args.batch_size,
            imgsz=args.img_size,
            device=device,
            workers=0 if os.name == "nt" else min(4, os.cpu_count() or 1),
            project=str(Path(temp_path) / "runs"),
            name="300w-lp-face",
            exist_ok=True,
            seed=args.seed,
            deterministic=True,
            cache=False,
            plots=False,
            verbose=True,
        )

        best_weights = Path(model.trainer.best)
        if not best_weights.is_file():
            raise FileNotFoundError(f"Training completed without a best checkpoint: {best_weights}")
        shutil.copy2(best_weights, args.output)
        metrics = {
            "dataset": "300W-LP",
            "train_images": train_count,
            "validation_images": validation_count,
            "source_grouped_split": True,
            "epochs": args.epochs,
            "image_size": args.img_size,
            "device": str(device),
            "metrics": {
                key: float(value)
                for key, value in (model.trainer.metrics or {}).items()
                if isinstance(value, (int, float, np.number))
            },
        }
        args.output.with_suffix(".metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print(f"Best checkpoint: {args.output}")
    print(f"Training metrics: {args.output.with_suffix('.metrics.json')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
