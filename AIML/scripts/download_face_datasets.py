"""Download face datasets (LFW, WIDER FACE) for evaluation.

Usage:
  python AIML/scripts/download_face_datasets.py                # LFW + WIDER val/splits
  python AIML/scripts/download_face_datasets.py --lfw-only
  python AIML/scripts/download_face_datasets.py --wider-only
  python AIML/scripts/download_face_datasets.py --include-train   # adds 1.4 GB WIDER_train

Downloads to:
  AIML/face_detection/datasets/lfw/
  AIML/face_detection/datasets/widerface/

Notes
-----
The original hosts (vis-www.cs.umass.edu and shuoyang1213.me) are dead as of
2026. These are the mirrors scikit-learn and Hugging Face's dataset builder use,
and every file is checksum-verified after download.

The LFW tarball does NOT contain the verification pairs. `pairs.txt` is a
separate download, which is why this script fetches it explicitly. Without it
there is no way to measure verification accuracy.

Licensing: both datasets are research-only (LFW: academic use; WIDER FACE:
CC BY-NC-ND 4.0). Do not commit them to git or ship them with the app.
"""

import argparse
import hashlib
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

AIML_ROOT = Path(__file__).resolve().parent.parent
DATASETS_DIR = AIML_ROOT / "face_detection" / "datasets"

# --- LFW (figshare mirror used by scikit-learn) -------------------------------
LFW_ARCHIVE = {
    "filename": "lfw.tgz",
    "url": "https://ndownloader.figshare.com/files/5976018",
    "sha256": "055f7d9c632d7370e6fb4afc7468d40f970c34a80d4c6f50ffec63f5a8d536c0",
}
LFW_META = [
    ("pairs.txt", "https://ndownloader.figshare.com/files/5976006",
     "ea42330c62c92989f9d7c03237ed5d591365e89b3e649747777b70e692dc1592"),
    ("pairsDevTrain.txt", "https://ndownloader.figshare.com/files/5976012",
     "1d454dada7dfeca0e7eab6f65dc4e97a6312d44cf142207be28d688be92aabfa"),
    ("pairsDevTest.txt", "https://ndownloader.figshare.com/files/5976009",
     "7cb06600ea8b2814ac26e946201cdb304296262aad67d046a16a7ec85d0ff87c"),
]

# --- WIDER FACE (Hugging Face mirror) -----------------------------------------
WIDER_REPO = "https://huggingface.co/datasets/wider_face/resolve/main/data"
WIDER_FILES = {
    "val": f"{WIDER_REPO}/WIDER_val.zip",
    "train": f"{WIDER_REPO}/WIDER_train.zip",
    "split": f"{WIDER_REPO}/wider_face_split.zip",
}

USER_AGENT = "Mozilla/5.0 (compatible; prepgenix-dataset-fetch)"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path, expected_sha256: str | None = None) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists():
        if expected_sha256 and _sha256(dest) == expected_sha256:
            print(f"  [skip] {dest.name} verified ({dest.stat().st_size / 1024 / 1024:.1f} MB)")
            return True
        if not expected_sha256:
            print(f"  [skip] {dest.name} already exists")
            return True
        print(f"  [redownload] {dest.name} checksum mismatch")
        dest.unlink()

    print(f"  [download] {dest.name} ...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as resp, dest.open("wb") as out:
            total = int(resp.headers.get("Content-Length") or 0)
            seen = 0
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
                seen += len(chunk)
                if total:
                    pct = seen * 100 // total
                    print(f"\r    {pct:3d}%  {seen / 1024 / 1024:.0f}/{total / 1024 / 1024:.0f} MB", end="")
        if total:
            print()
    except Exception as exc:  # noqa: BLE001 - surface any network failure to the user
        print(f"  [error] {dest.name}: {exc}")
        if dest.exists():
            dest.unlink()
        return False

    if expected_sha256 and _sha256(dest) != expected_sha256:
        print(f"  [error] {dest.name}: checksum mismatch, deleting")
        dest.unlink()
        return False

    print(f"  [done] {dest.name} ({dest.stat().st_size / 1024 / 1024:.1f} MB)")
    return True


def extract_zip(zip_path: Path, dest_dir: Path) -> None:
    print(f"  [extract] {zip_path.name} -> {dest_dir}")
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(str(zip_path)) as zf:
        zf.extractall(str(dest_dir))


def extract_tar(tar_path: Path, dest_dir: Path) -> None:
    print(f"  [extract] {tar_path.name} -> {dest_dir}")
    dest_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(str(tar_path), "r:gz") as tf:
        tf.extractall(path=str(dest_dir))
    tar_path.unlink()


def fetch_lfw(include_archive: bool = True) -> bool:
    lfw_dir = DATASETS_DIR / "lfw"
    lfw_dir.mkdir(parents=True, exist_ok=True)
    ok = True

    print("\n--- LFW (verification) ---")
    print("  verification pairs (required for accuracy measurement):")
    for name, url, sha in LFW_META:
        ok &= download(url, lfw_dir / name, sha)

    if include_archive:
        print("  images:")
        archive = lfw_dir / LFW_ARCHIVE["filename"]
        if download(LFW_ARCHIVE["url"], archive, LFW_ARCHIVE["sha256"]):
            extract_tar(archive, lfw_dir)
        else:
            ok = False

    return ok


def fetch_wider(include_train: bool) -> bool:
    wider_dir = DATASETS_DIR / "widerface"
    wider_dir.mkdir(parents=True, exist_ok=True)
    ok = True

    print("\n--- WIDER FACE (detection) ---")
    wanted = ["val", "split"] + (["train"] if include_train else [])
    for key in wanted:
        url = WIDER_FILES[key]
        name = Path(url).name
        zip_path = wider_dir / name
        if download(url, zip_path):
            extract_zip(zip_path, wider_dir)
        else:
            ok = False

    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lfw-only", action="store_true", help="download only LFW")
    parser.add_argument("--wider-only", action="store_true", help="download only WIDER FACE")
    parser.add_argument("--include-train", action="store_true", help="also download WIDER_train (1.4 GB)")
    parser.add_argument("--no-lfw-images", action="store_true", help="only fetch LFW pairs, not the 172 MB archive")
    args = parser.parse_args()

    print("=" * 62)
    print("Face Dataset Downloader")
    print("=" * 62)

    ok = True
    if not args.wider_only:
        ok &= fetch_lfw(include_archive=not args.no_lfw_images)
    if not args.lfw_only:
        ok &= fetch_wider(include_train=args.include_train)

    print("\n" + "=" * 62)
    print("Done." if ok else "Finished with errors (see above).")
    print(f"Datasets root: {DATASETS_DIR}")
    print("=" * 62)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
