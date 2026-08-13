"""Proctoring analysis: face detection on webcam frames + voice detection on audio.

Usage:
  python analyze_proctor.py --image <jpg/png> [--audio <wav>]

Prints a single JSON object to stdout.
  image: { faces, facePresent, multipleFaces, note }
  audio: { voiceDetected, voicedRatio, rms, note }
"""

import argparse
import base64
import json
import math
import struct
import sys
import wave


def analyze_image(path):
    try:
        import cv2
    except Exception as e:  # pragma: no cover
        return {"error": f"opencv-python not available: {e}"}

    img = cv2.imread(path)
    if img is None:
        return {"error": "Could not read image file"}
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(60, 60),
    )
    count = int(len(faces))
    return {
        "faces": count,
        "facePresent": count >= 1,
        "multipleFaces": count > 1,
        "note": "" if count <= 1 else f"{count} faces detected in frame",
    }


def analyze_audio(path):
    try:
        with wave.open(path, "rb") as w:
            params = w.getparams()
            nch, sampwidth, framerate, nframes = (
                params.nchannels,
                params.sampwidth,
                params.framerate,
                params.nframes,
            )
            if sampwidth not in (1, 2):
                return {"error": f"Unsupported sample width {sampwidth}"}
            raw = w.readframes(nframes)
    except Exception as e:
        return {"error": f"Could not read audio: {e}"}

    if sampwidth == 2:
        samples = struct.unpack(f"<{len(raw) // 2}h", raw[: (len(raw) // 2) * 2])
    else:
        samples = [b - 128 for b in raw]

    if nch > 1:
        samples = samples[:: nch]

    if not samples:
        return {"error": "Empty audio"}

    frame_len = max(1, int(framerate * 0.02))  # 20ms frames
    voiced_frames = 0
    total_frames = 0
    peak = 0.0
    for start in range(0, len(samples) - frame_len + 1, frame_len):
        frame = samples[start : start + frame_len]
        rms = math.sqrt(sum(s * s for s in frame) / len(frame)) if frame else 0.0
        peak = max(peak, rms)
        if rms > 500:
            voiced_frames += 1
        total_frames += 1

    voiced_ratio = (voiced_frames / total_frames) if total_frames else 0.0
    voice_detected = voiced_ratio > 0.15 and peak > 800
    return {
        "voiceDetected": voice_detected,
        "voicedRatio": round(voiced_ratio, 3),
        "rms": round(peak, 1),
        "note": "Speech-like energy detected" if voice_detected else "",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image")
    parser.add_argument("--audio")
    args = parser.parse_args()

    out = {}
    if args.image:
        out["image"] = analyze_image(args.image)
    if args.audio:
        out["audio"] = analyze_audio(args.audio)

    sys.stdout.write(json.dumps(out))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
