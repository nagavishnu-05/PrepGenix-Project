"""Rolling-window temporal confirmation for prohibited devices.

The old rule required a device in *every* one of the last N consecutive cycles.
A phone that is only partly visible - an edge or a corner peeking past a hand -
flickers in and out of the detector and never satisfies "consecutive", so it was
never confirmed. This tracker instead asks whether a device was seen in at
least K of the last M cycles **at a consistent on-screen location**.

Two levels are produced:

  * ``possible`` - something device-like was seen, but the evidence is weak or
    not yet consistent. This is a review signal, never a counted violation.
  * ``confirmed`` - enough consistent hits *and* at least one strong detection
    (confidence at/above ``DEVICE_CONFIRMED_CONFIDENCE``). Only this may become
    a real violation, so an ambiguous edge cannot on its own accuse anyone.
"""

from collections import deque

from .config import (
    DEVICE_WINDOW_MAXLEN,
    DEVICE_WINDOW_MIN_HITS,
    DEVICE_LOCATION_IOU,
    DEVICE_CONFIRMED_CONFIDENCE,
)


def _iou(a: dict, b: dict) -> float:
    x1 = max(a["x1"], b["x1"])
    y1 = max(a["y1"], b["y1"])
    x2 = min(a["x2"], b["x2"])
    y2 = min(a["y2"], b["y2"])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, a["x2"] - a["x1"]) * max(0.0, a["y2"] - a["y1"])
    area_b = max(0.0, b["x2"] - b["x1"]) * max(0.0, b["y2"] - b["y1"])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


class DeviceTracker:
    """Confirms a device from a rolling window of detections."""

    def __init__(
        self,
        window: int = DEVICE_WINDOW_MAXLEN,
        min_hits: int = DEVICE_WINDOW_MIN_HITS,
        min_iou: float = DEVICE_LOCATION_IOU,
        confirmed_confidence: float = DEVICE_CONFIRMED_CONFIDENCE,
    ):
        self.window = max(2, int(window))
        self.min_hits = max(1, int(min_hits))
        self.min_iou = max(0.0, float(min_iou))
        self.confirmed_confidence = float(confirmed_confidence)
        self._hits: deque[dict | None] = deque(maxlen=self.window)
        self._last_state: dict = self._empty_state()

    def update(self, devices: list[dict]) -> dict:
        """Feed one cycle's device detections and return the current state."""
        best = self._select_best(devices)
        self._hits.append(best)

        hits = [h for h in self._hits if h is not None]
        hit_count = len(hits)
        best_confidence = max((h["confidence"] for h in hits), default=0.0)
        consistent = self._max_consistent_cluster(hits) >= self.min_hits if hits else False

        if hit_count >= self.min_hits and consistent and best_confidence >= self.confirmed_confidence:
            level = "confirmed"
        elif hit_count >= 1:
            level = "possible"
        else:
            level = "none"

        labels = sorted({(h.get("label") or "device") for h in hits})
        self._last_state = {
            "level": level,
            "hits": hit_count,
            "window": self.window,
            "min_hits": self.min_hits,
            "location_consistent": consistent,
            "best_confidence": round(best_confidence, 3),
            "labels": labels,
            # The detections from *this* cycle, so a confirmation carries evidence.
            "devices": [d for d in devices if self._is_relevant(d)],
        }
        return self._last_state

    def snapshot(self) -> dict:
        return dict(self._last_state)

    def reset(self) -> None:
        self._hits.clear()
        self._last_state = self._empty_state()

    def _empty_state(self) -> dict:
        return {
            "level": "none",
            "hits": 0,
            "window": self.window,
            "min_hits": self.min_hits,
            "location_consistent": False,
            "best_confidence": 0.0,
            "labels": [],
            "devices": [],
        }

    def _select_best(self, devices: list[dict]) -> dict | None:
        relevant = [d for d in devices if self._is_relevant(d)]
        if not relevant:
            return None
        return max(relevant, key=lambda d: d.get("confidence", 0.0))

    @staticmethod
    def _is_relevant(device: dict) -> bool:
        return bool(device) and isinstance(device.get("box"), dict)

    def _max_consistent_cluster(self, hits: list[dict]) -> int:
        """Size of the largest set of hits that all overlap one reference hit."""
        best = 0
        for ref in hits:
            count = sum(1 for other in hits if _iou(ref["box"], other["box"]) >= self.min_iou)
            best = max(best, count)
        return best
