"""Download face datasets (WIDER FACE, LFW) for training/evaluation.

Usage:
  python AIML/scripts/download_face_datasets.py

Downloads to:
  AIML/face_detection/datasets/widerface/
  AIML/face_detection/datasets/lfw/
"""

import os
import sys
import zipfile
import urllib.request
import ssl
from pathlib import Path

AIML_ROOT = Path(__file__).resolve().parent.parent
DATASETS_DIR = AIML_ROOT / "face_detection" / "datasets"


def download_file(url: str, dest: Path, desc: str = "") -> bool:
    if dest.exists():
        print(f"  [skip] {desc or dest.name} already exists ({dest.stat().st_size / 1024 / 1024:.1f} MB)")
        return True
    print(f"  [download] {desc or dest.name} ...")
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        dest.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, str(dest))
        print(f"  [done] {desc or dest.name} ({dest.stat().st_size / 1024 / 1024:.1f} MB)")
        return True
    except Exception as e:
        print(f"  [error] Failed: {e}")
        if dest.exists():
            dest.unlink()
        return False


def extract_zip(zip_path: Path, dest_dir: Path):
    print(f"  [extract] {zip_path.name} -> {dest_dir}")
    with zipfile.ZipFile(str(zip_path), "r") as zf:
        zf.extractall(str(dest_dir))
    print(f"  [done] Extracted")


def main():
    print("=" * 60)
    print("Face Dataset Downloader")
    print("=" * 60)

    wider_dir = DATASETS_DIR / "widerface"
    lfw_dir = DATASETS_DIR / "lfw"

    wider_dir.mkdir(parents=True, exist_ok=True)
    lfw_dir.mkdir(parents=True, exist_ok=True)

    print("\n--- WIDER FACE (Detection) ---")
    wider_zip = DATASETS_DIR / "widerface" / "wider_face_split.zip"
    download_file(
        "http://shuoyang1213.me/WIDERDataset/WIDER_train.zip",
        wider_dir / "WIDER_train.zip",
        "WIDER FACE training set"
    )
    download_file(
        "http://shuoyang1213.me/WIDERDataset/WIDER_val.zip",
        wider_dir / "WIDER_val.zip",
        "WIDER FACE validation set"
    )
    download_file(
        "http://shuoyang1213.me/WIDERDataset/wider_face_split.zip",
        wider_zip,
        "WIDER FACE annotations"
    )

    print("\n--- LFW (Verification) ---")
    lfw_zip = DATASETS_DIR / "lfw" / "lfw.tgz"
    download_file(
        "http://vis-www.cs.umass.edu/lfw/lfw.tgz",
        lfw_zip,
        "LFW dataset"
    )

    print("\n" + "=" * 60)
    print("Dataset download complete!")
    print("Note: Large datasets (several GB). Manual download may be needed")
    print("if automatic download fails. See README.md for instructions.")
    print("=" * 60)


if __name__ == "__main__":
    main()
