#!/usr/bin/env python3
"""Scene classification inference using a Places365 fine-tuned model.

Usage:
  python classify_scene.py --image <path-to-image> [--model ../models/places365] [--top 5]

Prints a JSON object to stdout: { predictions: [{label, confidence}], top: label }
"""

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
from tensorflow import keras

DEFAULT_MODEL = os.path.join(os.path.dirname(__file__), "..", "models", "places365")


def load_labels(model_dir):
    path = os.path.join(model_dir, "labels.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)["classes"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--top", type=int, default=5)
    args = parser.parse_args()

    model_path = os.path.join(args.model, "model.keras")
    if not os.path.isfile(model_path):
        print(json.dumps({"error": f"Model not found at {model_path}. Run train_places365.py first."}))
        sys.exit(1)

    model = keras.models.load_model(model_path)
    size = model.inputs[0].shape[1]
    classes = load_labels(args.model)

    img = Image.open(args.image).convert("RGB").resize((size, size))
    batch = np.expand_dims(np.array(img), 0).astype("float32")
    probs = model.predict(batch, verbose=0)[0]

    order = np.argsort(probs)[::-1][: args.top]
    predictions = [{"label": classes[int(i)], "confidence": round(float(probs[i]), 4)} for i in order]

    sys.stdout.write(json.dumps({"top": predictions[0]["label"], "predictions": predictions}))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
