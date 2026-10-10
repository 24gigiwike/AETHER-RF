"""Train the local Random Forest demonstration model.

Real ESP32 feature rows are read from the recording directory and labeled with
the documented heuristic. Those labels are written under data/model/, not into
the raw recording files.

The recorded scans available when this project was first trained are one quiet
session. They do not contain MEDIUM or HIGH conditions. A separate synthetic
feature set is therefore used so the demonstration classifier can show all
three classes. Synthetic rows are generated in software. They are not ESP32
measurements and are not a real-world accuracy test.

Run from the backend directory:

    .\\.venv\\Scripts\\python.exe train_model.py
"""

from __future__ import annotations

import csv
import json
import random
from collections import Counter
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split

from congestion_model import (
    CLASSES,
    LABEL_RULE,
    MODEL_FEATURES,
    MODEL_NAME,
    PREDICTION_SOURCE,
    RANDOM_SEED,
    heuristic_label,
    metadata_path,
    model_directory,
    model_path,
    scan_features_from_channel_rows,
    scan_features_from_networks,
)
from dataset_recorder import default_dataset_dir

RECORDING_FILES = (
    "sessions.csv",
    "scans.csv",
    "access_points.csv",
    "channel_features.csv",
)


def main() -> None:
    recording_dir = default_dataset_dir()
    before = _snapshot(recording_dir)
    real_rows = _real_examples(recording_dir)
    synthetic_rows = _synthetic_examples()
    _require_all_classes(synthetic_rows, "synthetic demonstration set")

    output_dir = model_directory()
    output_dir.mkdir(parents=True, exist_ok=True)
    _write_rows(output_dir / "real_heuristic_labels.csv", real_rows)
    _write_rows(output_dir / "synthetic_demonstration.csv", synthetic_rows)

    synthetic_frame = pd.DataFrame(synthetic_rows)
    real_frame = pd.DataFrame(real_rows)
    train_synthetic, test_synthetic = train_test_split(
        synthetic_frame,
        test_size=0.30,
        random_state=RANDOM_SEED,
        stratify=synthetic_frame["heuristic_label"],
    )
    training = (
        pd.concat([train_synthetic, real_frame], ignore_index=True)
        if not real_frame.empty
        else train_synthetic
    )
    classifier = RandomForestClassifier(
        n_estimators=80,
        max_depth=6,
        random_state=RANDOM_SEED,
        class_weight="balanced",
    )
    classifier.fit(training.loc[:, MODEL_FEATURES], training["heuristic_label"])
    predictions = classifier.predict(test_synthetic.loc[:, MODEL_FEATURES])
    labels = list(CLASSES)
    precision, recall, f1, support = precision_recall_fscore_support(
        test_synthetic["heuristic_label"],
        predictions,
        labels=labels,
        zero_division=0,
    )
    matrix = confusion_matrix(
        test_synthetic["heuristic_label"],
        predictions,
        labels=labels,
    ).tolist()
    real_sessions = sorted({row["session_id"] for row in real_rows})
    real_counts = Counter(row["heuristic_label"] for row in real_rows)
    metadata = {
        "modelName": MODEL_NAME,
        "predictionSource": PREDICTION_SOURCE,
        "randomSeed": RANDOM_SEED,
        "features": list(MODEL_FEATURES),
        "labelRule": LABEL_RULE,
        "labelsAreMeasuredInterference": False,
        "realRecordedScans": len(real_rows),
        "realSessionCount": len(real_sessions),
        "realHeuristicLabelCounts": dict(real_counts),
        "syntheticExampleCounts": dict(Counter(row["heuristic_label"] for row in synthetic_rows)),
        "trainingRows": int(len(training)),
        "evaluation": {
            "reliableInterferenceEvaluation": False,
            "reason": (
                "Only one recorded scan session is available, and its heuristic "
                "labels are a single class. Session-separated evaluation cannot "
                "estimate interference detection. The scores below measure how "
                "well the forest imitates the heuristic on synthetic feature "
                "vectors held out from training."
            ),
            "split": "30 percent of synthetic rows, stratified, seed 42. Recorded rows were added only to training.",
            "accuracy": round(float(accuracy_score(test_synthetic["heuristic_label"], predictions)), 4),
            "precision": {label: round(float(value), 4) for label, value in zip(labels, precision)},
            "recall": {label: round(float(value), 4) for label, value in zip(labels, recall)},
            "f1": {label: round(float(value), 4) for label, value in zip(labels, f1)},
            "support": {label: int(value) for label, value in zip(labels, support)},
            "confusionMatrixLabels": labels,
            "confusionMatrix": matrix,
        },
    }
    joblib.dump(
        {
            "estimator": classifier,
            "feature_names": MODEL_FEATURES,
            "classes": labels,
        },
        model_path(),
    )
    metadata_path().write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    after = _snapshot(recording_dir)
    if before != after:
        raise SystemExit("Training changed the recording files.")
    print(json.dumps(metadata, indent=2))


def _real_examples(recording_dir: Path) -> list[dict[str, object]]:
    feature_path = recording_dir / "channel_features.csv"
    if not feature_path.exists():
        return []
    grouped: dict[tuple[str, str, str], list[dict[str, str]]] = {}
    with feature_path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            key = (row["session_id"], row["scan_id"], row["received_at_utc"])
            grouped.setdefault(key, []).append(row)
    examples = []
    for (session_id, scan_id, received_at), rows in grouped.items():
        features = scan_features_from_channel_rows(rows)
        label, risk = heuristic_label(features)
        examples.append(
            {
                "example_origin": "esp32_recording",
                "session_id": session_id,
                "scan_id": scan_id,
                "received_at_utc": received_at,
                **features,
                "heuristic_risk": risk,
                "heuristic_label": label,
            }
        )
    return examples


def _synthetic_examples() -> list[dict[str, object]]:
    """Invent AP placements until the heuristic assigns each class 48 times.

    Rows that do not land in the requested class are discarded. Nothing here is
    an ESP32 capture.
    """
    rng = random.Random(RANDOM_SEED)
    builders = {
        "LOW": lambda sequence: _invent_networks(rng, sequence, (0, 2), (-95, -78), False),
        "MEDIUM": lambda sequence: _invent_networks(rng, sequence, (5, 7), (-70, -58), False),
        "HIGH": lambda sequence: _invent_networks(rng, sequence, (11, 14), (-52, -35), True),
    }
    rows: list[dict[str, object]] = []
    sequence = 0
    for label, builder in builders.items():
        kept = 0
        attempts = 0
        while kept < 48 and attempts < 2000:
            attempts += 1
            sequence += 1
            features = scan_features_from_networks(builder(sequence))
            assigned, risk = heuristic_label(features)
            if assigned != label:
                continue
            kept += 1
            rows.append(
                {
                    "example_origin": "synthetic_demonstration",
                    "scenario": label.lower(),
                    **features,
                    "heuristic_risk": risk,
                    "heuristic_label": assigned,
                }
            )
        if kept < 48:
            raise SystemExit(f"Could not draw 48 synthetic {label} examples in {attempts} attempts")
    return rows


def _invent_networks(
    rng: random.Random,
    sequence: int,
    ap_range: tuple[int, int],
    rssi_range: tuple[int, int],
    clustered: bool,
) -> list[dict[str, object]]:
    ap_count = rng.randint(*ap_range)
    if ap_count == 0:
        return []
    if clustered:
        center = rng.randint(4, 9)
        channels = [channel for channel in range(center - 1, center + 2) if 1 <= channel <= 13]
    else:
        channels = [1, 6, 11][: rng.randint(1, 3)]
    networks = []
    for index in range(ap_count):
        networks.append(
            {
                "ssid": "",
                "bssid": f"02:00:00:{sequence % 256:02X}:{index:02X}:00",
                "rssi": rng.randint(*rssi_range),
                "channel": rng.choice(channels),
                "securityType": "UNKNOWN",
            }
        )
    return networks


def _require_all_classes(rows: list[dict[str, object]], name: str) -> None:
    counts = Counter(str(row["heuristic_label"]) for row in rows)
    missing = [label for label in CLASSES if counts[label] < 8]
    if missing:
        raise SystemExit(f"{name} did not produce enough {missing} examples: {dict(counts)}")


def _write_rows(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        return
    fieldnames = list(rows[0])
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def _snapshot(recording_dir: Path) -> dict[str, bytes]:
    snapshot = {}
    for name in RECORDING_FILES:
        path = recording_dir / name
        snapshot[name] = path.read_bytes() if path.exists() else b""
    return snapshot


if __name__ == "__main__":
    main()
