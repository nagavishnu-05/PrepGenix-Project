#!/usr/bin/env python3
"""Download a small balanced Places365 subset for scene classification.

The full Places365 dataset has ~1.8M images across 365 classes, which is not
practical to download on a laptop. This script streams a curated Hugging Face
mirror of Places365 (the 10 largest scene classes, 256x256 images):

  * train split (default): class blocks are streamed in order and the first
    `--images-per-class` images of each class are kept (~8-10 min for 300/class).
  * val split: the official validation images, 100 per class (~5 s).

Images are then split deterministically into train/val directories in the
easyformat layout expected by `train_places365.py`:

    <out>/train/<class>/<n>.jpg
    <out>/val/<class>/<n>.jpg
    <out>/labels.json

Usage:
  python download_places365_subset.py [--out ../data/places365]
  python download_places365_subset.py --split val --images-per-class 100

Prints a JSON summary to stdout.
"""

import argparse
import json
import os
import random
import sys
import time

DEFAULT_DATASET = "dimzhead/places365-10largest-256"


def sanitize(name):
    """'/a/amusement_park' -> 'amusement_park', '/a/athletic_field/outdoor' -> 'athletic_field_outdoor'."""
    parts = name.strip("/").split("/")
    if len(parts) > 1 and len(parts[0]) == 1:
        parts = parts[1:]
    return "_".join(parts)


def log(msg):
    print(msg, file=sys.stderr)


def retry_next_stream(iterable):
    """The HF streaming iterator occasionally drops the socket on Windows; retry."""
    while True:
        try:
            yield next(iterable)
        except StopIteration:
            return
        except Exception as e:  # pragma: no cover - network flake
            log(f"  retrying after streaming error: {e}")
            time.sleep(2)


def collect(iterable, display_names, per_class):
    counts = {name: 0 for name in display_names}
    images = {name: [] for name in display_names}
    scanned = 0
    for row in retry_next_stream(iterable):
        scanned += 1
        label = int(row["label"])
        name = display_names[label]
        if counts[name] < per_class:
            images[name].append(row["image"].convert("RGB"))
            counts[name] += 1
        if scanned % 25000 == 0:
            log(f"  scanned {scanned} rows, collected {sum(counts.values())}/{len(display_names) * per_class}")
        if sum(counts.values()) >= len(display_names) * per_class:
            break
    return images


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data", "places365"))
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--split", default="train", choices=["train", "val"])
    parser.add_argument("--images-per-class", type=int, default=300)
    parser.add_argument("--val-fraction", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not 0 < args.val_fraction < 1:
        log("--val-fraction must be between 0 and 1")
        sys.exit(1)

    from datasets import load_dataset

    log(f"Streaming dataset: {args.dataset} ({args.split} split)")
    ds = load_dataset(args.dataset, streaming=True)
    names = [str(n) for n in ds["train"].features["label"].names]
    display_names = [sanitize(n) for n in names]
    if args.split == "val":
        args.images_per_class = min(args.images_per_class, 100)

    log(f"Collecting up to {args.images_per_class} images per class ({len(display_names)} classes)...")
    images = collect(iter(ds[args.split]), display_names, args.images_per_class)
    missing = [n for n in display_names if not images[n]]
    if missing:
        log(f"Could not collect all classes: missing {missing}")
        sys.exit(1)

    rng = random.Random(args.seed)
    train_dir = os.path.join(args.out, "train")
    val_dir = os.path.join(args.out, "val")
    per_class_split = {}
    for name in display_names:
        imgs = images[name]
        rng.shuffle(imgs)
        n_val = int(round(args.val_fraction * len(imgs)))
        for dst_dir, split_imgs in ((train_dir, imgs[n_val:]), (val_dir, imgs[:n_val])):
            folder = os.path.join(dst_dir, name)
            os.makedirs(folder, exist_ok=True)
            for i, img in enumerate(split_imgs, 1):
                img.save(os.path.join(folder, f"{i:05d}.jpg"), format="JPEG", quality=92)
        per_class_split[name] = {"train": len(imgs) - n_val, "val": n_val}

    labels = {"classes": display_names, "places365": {d: o for d, o in zip(display_names, names)}}
    with open(os.path.join(args.out, "labels.json"), "w", encoding="utf-8") as f:
        json.dump(labels, f, indent=2, ensure_ascii=False)

    summary = {
        "dataset": args.dataset,
        "sourceSplit": args.split,
        "outDir": args.out,
        "classes": display_names,
        "perClass": per_class_split,
        "trainImages": sum(v["train"] for v in per_class_split.values()),
        "valImages": sum(v["val"] for v in per_class_split.values()),
    }
    sys.stdout.write(json.dumps(summary))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
