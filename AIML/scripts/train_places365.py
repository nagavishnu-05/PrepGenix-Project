#!/usr/bin/env python3
"""Train a scene-classification model on a Places365 subset using transfer learning.

Fixes a pretrained backbone (default MobileNetV2, ImageNet weights) and fine-tunes
it on the balanced Places365 subset downloaded by `download_places365_subset.py`.
Two-stage training is supported: first the new classifier head (backbone frozen),
then (optionally) unfreeze the top layers and fine-tune at a lower learning rate.

Expected layout (easyformat, as produced by the downloader):

    <data>/train/<class>/*.jpg
    <data>/val/<class>/*.jpg
    <data>/labels.json

Usage:
  python train_places365.py [--data ../data/places365] [--out ../models/places365] [--epochs 8]

Prints a JSON summary (metrics + artifact paths) to stdout.
"""

import argparse
import json
import os
import sys
import time

import numpy as np
import tensorflow as tf
from tensorflow import keras

BACKBONES = {
    "mobilenetv2": (keras.applications.MobileNetV2, 224),
    "resnet50v2": (keras.applications.ResNet50V2, 224),
    "efficientnetb0": (keras.applications.EfficientNetB0, 224),
}

IMG_SIZE = 224
AUTOTUNE = tf.data.AUTOTUNE


def log(msg):
    print(msg, file=sys.stderr)


def set_seed(seed):
    tf.keras.utils.set_random_seed(seed)
    np.random.seed(seed)


def build_model(num_classes, backbone_name):
    factory, size = BACKBONES[backbone_name]
    base = factory(
        weights="imagenet",
        include_top=False,
        input_shape=(size, size, 3),
        pooling="avg",
    )
    base.trainable = False

    inputs = keras.Input(shape=(size, size, 3))
    x = keras.layers.Rescaling(scale=1.0 / 127.5, offset=-1.0)(inputs)
    x = base(x, training=False)
    x = keras.layers.Dropout(0.2)(x)
    outputs = keras.layers.Dense(num_classes, activation="softmax")(x)
    model = keras.Model(inputs, outputs)
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss=keras.losses.SparseCategoricalCrossentropy(from_logits=False),
        metrics=["accuracy"],
    )
    return model, base, size


def make_datasets(data_dir, size, batch_size):
    train_ds = keras.utils.image_dataset_from_directory(
        os.path.join(data_dir, "train"),
        validation_split=None,
        image_size=(size, size),
        batch_size=batch_size,
        shuffle=True,
        seed=42,
        label_mode="int",
    )
    val_ds = keras.utils.image_dataset_from_directory(
        os.path.join(data_dir, "val"),
        image_size=(size, size),
        batch_size=batch_size,
        shuffle=False,
        label_mode="int",
    )
    class_names = train_ds.class_names

    aug = keras.Sequential(
        [
            keras.layers.RandomFlip("horizontal"),
            keras.layers.RandomRotation(0.1),
            keras.layers.RandomZoom(0.15),
            keras.layers.RandomContrast(0.1),
        ]
    )
    train_ds = train_ds.map(lambda x, y: (aug(x, training=True), y), num_parallel_calls=AUTOTUNE)
    train_ds = train_ds.prefetch(AUTOTUNE)
    val_ds = val_ds.prefetch(AUTOTUNE)
    return train_ds, val_ds, class_names


def stage(model, base, lr, trainable_layers=0):
    base.trainable = False
    if trainable_layers > 0:
        for layer in base.layers[-trainable_layers:]:
            layer.trainable = True
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=lr),
        loss=keras.losses.SparseCategoricalCrossentropy(from_logits=False),
        metrics=["accuracy"],
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=os.path.join(os.path.dirname(__file__), "..", "data", "places365"))
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "models", "places365"))
    parser.add_argument("--backbone", default="mobilenetv2", choices=sorted(BACKBONES))
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--fine-tune", action="store_true", help="unfreeze top layers and fine-tune after head training")
    parser.add_argument("--finetune-epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--finetune-lr", type=float, default=1e-5)
    parser.add_argument("--patience", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--skip-head", action="store_true", help="skip head-only stage (model must already exist)")
    args = parser.parse_args()

    if not os.path.isdir(os.path.join(args.data, "train")):
        log(f"Data not found at {args.data}. Run download_places365_subset.py first.")
        sys.exit(1)

    set_seed(args.seed)
    os.makedirs(args.out, exist_ok=True)

    log(f"Backbone: {args.backbone} (ImageNet weights)")
    train_ds, val_ds, class_names = make_datasets(args.data, IMG_SIZE, args.batch_size)
    num_classes = len(class_names)
    log(f"Classes ({num_classes}): {class_names}")
    log(f"Train batches: {train_ds.cardinality().numpy()}, Val batches: {val_ds.cardinality().numpy()}")

    model, base, _ = build_model(num_classes, args.backbone)

    callbacks = [
        keras.callbacks.ModelCheckpoint(
            os.path.join(args.out, "best.keras"), monitor="val_accuracy", save_best_only=True, verbose=0
        ),
        keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=args.patience, restore_best_weights=True, verbose=1),
        keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=2, min_lr=1e-6, verbose=1),
        keras.callbacks.CSVLogger(os.path.join(args.out, "history.csv"), append=False),
    ]

    history = {}
    if not args.skip_head:
        stage(model, base, args.lr)
        log(f"Stage 1: training head only for up to {args.epochs} epochs (lr={args.lr})")
        h1 = model.fit(train_ds, validation_data=val_ds, epochs=args.epochs, callbacks=callbacks, verbose=2)
        history["head"] = {k: [float(v) for v in vals] for k, vals in h1.history.items()}

    if args.fine_tune:
        model.load_weights(os.path.join(args.out, "best.keras"))
        stage(model, base, args.finetune_lr, trainable_layers=30)
        log(f"Stage 2: fine-tuning top layers for up to {args.finetune_epochs} epochs (lr={args.finetune_lr})")
        h2 = model.fit(train_ds, validation_data=val_ds, epochs=args.finetune_epochs, callbacks=callbacks, verbose=2)
        history["finetune"] = {k: [float(v) for v in vals] for k, vals in h2.history.items()}

    model.load_weights(os.path.join(args.out, "best.keras"))
    model.save(os.path.join(args.out, "model.keras"))

    val_metrics = model.evaluate(val_ds, verbose=0)
    val_loss, val_acc = val_metrics[0], val_metrics[1]

    with open(os.path.join(args.out, "labels.json"), "w", encoding="utf-8") as f:
        json.dump({"classes": class_names}, f, indent=2)
    with open(os.path.join(args.out, "history.json"), "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)

    summary = {
        "outDir": args.out,
        "backbone": args.backbone,
        "classes": class_names,
        "numClasses": num_classes,
        "epochs": args.epochs,
        "fineTuned": args.fine_tune,
        "valLoss": round(val_loss, 4),
        "valAccuracy": round(val_acc, 4),
        "artifacts": {
            "model": os.path.join(args.out, "model.keras"),
            "bestWeights": os.path.join(args.out, "best.keras"),
            "labels": os.path.join(args.out, "labels.json"),
            "history": os.path.join(args.out, "history.json"),
        },
    }
    sys.stdout.write(json.dumps(summary))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
