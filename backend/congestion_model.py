"""Random Forest demonstration model for scan-level congestion risk.

Labels are produced by a fixed heuristic from the same channel features the
recorder stores. They are not measured interference ground truth. Agreement
between the model and those labels shows that the model imitates the heuristic.

The model file is loaded once per process. Prediction does not train it.
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any, Literal

from dataset_recorder import channel_feature_rows

logger = logging.getLogger("aether.model")

MODEL_NAME: Literal["Random Forest"] = "Random Forest"
PREDICTION_SOURCE: Literal["heuristic-trained demonstration model"] = (
    "heuristic-trained demonstration model"
)
RANDOM_SEED = 42
MISSING_RSSI_DBM = -100.0
CLASSES = ("LOW", "MEDIUM", "HIGH")
MODEL_FEATURES = (
    "total_ap_count",
    "occupied_channel_count",
    "max_channel_ap_count",
    "mean_rssi_dbm",
    "strongest_rssi_dbm",
    "max_overlap_weighted_ap_count",
)

# risk = 0.45 * min(total_ap_count / 10, 1)
#      + 0.20 * min(occupied_channel_count / 8, 1)
#      + 0.20 * signal_strength
#      + 0.15 * min(max_overlap_weighted_ap_count / 4, 1)
# signal_strength is 0 when no AP was detected. Otherwise it is
# (strongest_rssi_dbm + 100) / 70, clamped to 0..1.
# LOW: risk < 0.35. MEDIUM: risk < 0.62. HIGH: risk >= 0.62.
LOW_RISK_BELOW = 0.35
MEDIUM_RISK_BELOW = 0.62

LABEL_RULE = (
    "Heuristic demonstration labels, not measured interference. "
    "risk = 0.45*min(AP count/10, 1) + 0.20*min(occupied channels/8, 1) "
    "+ 0.20*clamped strongest-RSSI strength + 0.15*clamped max channel overlap. "
    "LOW below 0.35, MEDIUM below 0.62, otherwise HIGH. "
    "Empty RSSI uses -100 dBm and contributes no signal strength."
)

_bundle: dict[str, Any] | None = None
_load_attempted = False


def model_directory() -> Path:
    return Path(__file__).resolve().parent / "data" / "model"


def model_path() -> Path:
    return model_directory() / "random_forest.joblib"


def metadata_path() -> Path:
    return model_directory() / "model_metadata.json"


def scan_features_from_channel_rows(rows: list[dict[str, Any]]) -> dict[str, float]:
    """Collapse the 13 channel-feature rows for one scan into model inputs."""
    total = 0
    occupied = 0
    max_channel = 0
    max_overlap = 0.0
    weighted_milliwatts = 0.0
    rssi_ap_count = 0
    strongest: float | None = None

    for row in rows:
        count = int(float(row["ap_count"]))
        total += count
        max_channel = max(max_channel, count)
        overlap = float(row["overlap_weighted_ap_count"] or 0)
        max_overlap = max(max_overlap, overlap)
        if count <= 0:
            continue
        occupied += 1
        strongest_text = row.get("strongest_rssi_dbm")
        if strongest_text not in (None, ""):
            value = float(strongest_text)
            strongest = value if strongest is None else max(strongest, value)
        mean_text = row.get("mean_rssi_dbm")
        if mean_text not in (None, ""):
            rssi_ap_count += count
            weighted_milliwatts += count * (10 ** (float(mean_text) / 10))

    if rssi_ap_count > 0 and weighted_milliwatts > 0:
        mean_rssi = round(10 * math.log10(weighted_milliwatts / rssi_ap_count), 1)
    else:
        mean_rssi = MISSING_RSSI_DBM

    return {
        "total_ap_count": float(total),
        "occupied_channel_count": float(occupied),
        "max_channel_ap_count": float(max_channel),
        "mean_rssi_dbm": mean_rssi,
        "strongest_rssi_dbm": MISSING_RSSI_DBM if strongest is None else float(strongest),
        "max_overlap_weighted_ap_count": round(max_overlap, 2),
    }


def scan_features_from_networks(networks: list[dict[str, Any]]) -> dict[str, float]:
    return scan_features_from_channel_rows(channel_feature_rows(networks))


def heuristic_label(features: dict[str, float]) -> tuple[str, float]:
    """Return the demonstration class and the risk value that produced it."""
    density = min(features["total_ap_count"] / 10.0, 1.0)
    occupancy = min(features["occupied_channel_count"] / 8.0, 1.0)
    if features["total_ap_count"] <= 0:
        strength = 0.0
    else:
        strength = (features["strongest_rssi_dbm"] - MISSING_RSSI_DBM) / 70.0
        strength = min(max(strength, 0.0), 1.0)
    overlap = min(max(features["max_overlap_weighted_ap_count"] / 4.0, 0.0), 1.0)
    risk = 0.45 * density + 0.20 * occupancy + 0.20 * strength + 0.15 * overlap
    if risk < LOW_RISK_BELOW:
        label = "LOW"
    elif risk < MEDIUM_RISK_BELOW:
        label = "MEDIUM"
    else:
        label = "HIGH"
    return label, round(risk, 4)


def feature_vector(features: dict[str, float]) -> list[float]:
    return [float(features[name]) for name in MODEL_FEATURES]


def load_model() -> dict[str, Any] | None:
    """Load the saved model once. Missing file returns None and does not train."""
    global _bundle, _load_attempted
    if _load_attempted:
        return _bundle
    _load_attempted = True
    path = model_path()
    if not path.exists():
        logger.warning("Random Forest model file is not present at %s", path)
        return None
    import joblib

    try:
        loaded = joblib.load(path)
    except (OSError, ValueError, EOFError) as error:
        logger.error("Random Forest model file could not be read: %s", error)
        return None
    names = tuple(loaded.get("feature_names", ()))
    if names != MODEL_FEATURES or loaded.get("estimator") is None:
        logger.error("Random Forest model file does not match the current feature set")
        return None
    _bundle = loaded
    logger.info("Loaded Random Forest demonstration model from %s", path)
    return _bundle


def model_is_available() -> bool:
    return load_model() is not None


def predict_features(features: dict[str, float]) -> Literal["LOW", "MEDIUM", "HIGH"]:
    bundle = load_model()
    if bundle is None:
        raise FileNotFoundError("Random Forest model is not available")
    import pandas as pd

    frame = pd.DataFrame([feature_vector(features)], columns=list(MODEL_FEATURES))
    label = bundle["estimator"].predict(frame)[0]
    text = str(label)
    if text not in CLASSES:
        raise ValueError(f"Model returned an unknown class: {text}")
    return text  # type: ignore[return-value]


def read_metadata() -> dict[str, Any]:
    path = metadata_path()
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))
