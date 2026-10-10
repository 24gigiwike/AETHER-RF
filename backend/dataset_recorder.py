"""Local CSV recording for ESP32 scans.

Recording is off unless ``AETHER_RECORD_SCANS`` is set to 1, true, yes, or on.
The serial reader calls :meth:`ScanRecorder.record_scan` once per newly received
successful scan. HTTP polling does not write rows.

Raw measurements and derived channel features are separate files. Feature
columns are occupancy, RSSI, and spectral-overlap measurements. They are not
ground-truth interference labels, and the dashboard heuristic congestion score
is not stored as a training target.

SSIDs and BSSIDs can identify a place or a person. The recording directory is
local. ``python dataset_recorder.py export --pseudonymize`` writes a separate
export with stable pseudonyms and does not copy the salt.

Start a named session::

    $env:AETHER_RECORD_SCANS = "1"
    $env:AETHER_SESSION_NAME = "home_morning_01"
    $env:AETHER_SESSION_ENVIRONMENT = "home"
    $env:AETHER_SESSION_SCENARIO = "morning"
    $env:AETHER_SESSION_NOTES = "Laptop near the router"
    .\\.venv\\Scripts\\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000

The UUID ``session_id`` remains the link between files. The four session
variables are optional labels stored only in ``sessions.csv``.

Stop that session by stopping the process. Start the API again without
``AETHER_RECORD_SCANS`` to serve scans without writing new rows. Existing CSV
files are appended to, not replaced.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import logging
import math
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("aether.dataset")

WIFI_CHANNELS = range(1, 14)
_OVERLAP_BY_DELTA = {0: 1.0, 1: 0.82, 2: 0.58, 3: 0.32, 4: 0.12}

# Metadata columns were added after the first recordings. An older sessions.csv
# has only the first two columns; those rows are kept and the new cells are blank.
LEGACY_SESSION_COLUMNS = ["session_id", "started_at_utc"]
_METADATA_FIELDS = (
    ("session_name", "AETHER_SESSION_NAME", 64),
    ("session_environment", "AETHER_SESSION_ENVIRONMENT", 64),
    ("session_scenario", "AETHER_SESSION_SCENARIO", 64),
    ("session_notes", "AETHER_SESSION_NOTES", 500),
)
_METADATA_LIMITS = {field: limit for field, _env_name, limit in _METADATA_FIELDS}
SESSION_COLUMNS = [*LEGACY_SESSION_COLUMNS, *_METADATA_LIMITS]
SCAN_COLUMNS = [
    "session_id",
    "scan_id",
    "received_at_utc",
    "network_count",
    "scan_success",
]
ACCESS_POINT_COLUMNS = [
    "session_id",
    "scan_id",
    "received_at_utc",
    "ssid",
    "bssid",
    "rssi",
    "channel",
    "security_type",
]
FEATURE_COLUMNS = [
    "session_id",
    "scan_id",
    "received_at_utc",
    "channel",
    "ap_count",
    "mean_rssi_dbm",
    "strongest_rssi_dbm",
    "adjacent_ap_count",
    "overlap_weighted_ap_count",
]

_TRUE_VALUES = {"1", "true", "yes", "on"}


def recording_enabled_from_environment() -> bool:
    return os.environ.get("AETHER_RECORD_SCANS", "").strip().lower() in _TRUE_VALUES


def session_metadata_from_environment() -> dict[str, str]:
    """Read optional session labels. Missing variables become empty strings."""
    return {
        field: _clean_metadata(os.environ.get(env_name, ""), limit)
        for field, env_name, limit in _METADATA_FIELDS
    }


def default_dataset_dir() -> Path:
    configured = os.environ.get("AETHER_DATASET_DIR", "").strip()
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent / "data" / "recordings"


def linear_power_mean_dbm(readings: list[int]) -> float | None:
    """Same linear-power mean used by the API channel summary."""
    if not readings:
        return None
    mean_milliwatts = sum(10 ** (rssi / 10) for rssi in readings) / len(readings)
    if mean_milliwatts <= 0:
        return None
    return round(10 * math.log10(mean_milliwatts), 1)


def spectral_overlap(channel_a: int, channel_b: int) -> float:
    """2.4 GHz overlap factors used by the existing dashboard engine."""
    if channel_a == 14 or channel_b == 14:
        return 1.0 if channel_a == channel_b else 0.0
    return _OVERLAP_BY_DELTA.get(abs(channel_a - channel_b), 0.0)


def recorder_from_environment() -> ScanRecorder | None:
    """Return a recorder only when recording is explicitly enabled."""
    if not recording_enabled_from_environment():
        logger.info("ESP32 dataset recording is disabled.")
        return None
    recorder = ScanRecorder(default_dataset_dir())
    logger.info(
        "ESP32 dataset recording is enabled. Session %s (%s) writes to %s",
        recorder.session_id,
        recorder.metadata["session_name"] or "unnamed",
        recorder.directory,
    )
    return recorder


class ScanRecorder:
    def __init__(
        self,
        directory: Path,
        *,
        enabled: bool = True,
        metadata: dict[str, str] | None = None,
    ) -> None:
        self.directory = Path(directory)
        self.enabled = enabled
        self.session_id = uuid.uuid4().hex
        self.metadata = _normalize_metadata(metadata)
        self._lock = threading.Lock()
        self._recorded_keys: set[tuple[str, str]] = set()
        self._write_failed = False
        if not self.enabled:
            return
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            self._recorded_keys = _load_recorded_keys(self.directory / "scans.csv")
            self._append_session()
        except (OSError, csv.Error) as error:
            self._write_failed = True
            logger.error("Dataset directory is not writable (%s): %s", self.directory, error)

    def record_scan(self, scan: dict[str, Any]) -> bool:
        """Append one successful scan. Returns False when nothing new is written."""
        if not self.enabled or self._write_failed:
            return False
        try:
            rows = _prepare_rows(scan, self.session_id)
        except ValueError as error:
            logger.warning("Skipping dataset row: %s", error)
            return False
        if rows is None:
            return False

        key = (rows["scan_id"], rows["received_at"])
        with self._lock:
            if key in self._recorded_keys:
                logger.info("Skipping duplicate dataset scan %s at %s", key[0], key[1])
                return False
            try:
                _append_csv(self.directory / "scans.csv", SCAN_COLUMNS, [rows["scan"]])
            except (OSError, csv.Error) as error:
                logger.error("Failed to append dataset scan %s: %s", key[0], error)
                return False
            self._recorded_keys.add(key)
            try:
                _append_csv(
                    self.directory / "access_points.csv",
                    ACCESS_POINT_COLUMNS,
                    rows["access_points"],
                )
                _append_csv(
                    self.directory / "channel_features.csv",
                    FEATURE_COLUMNS,
                    rows["features"],
                )
            except (OSError, csv.Error) as error:
                logger.error(
                    "Scan %s was recorded, but access-point or feature rows failed: %s",
                    key[0],
                    error,
                )
                return False
        return True

    def _append_session(self) -> None:
        path = self.directory / "sessions.csv"
        _ensure_sessions_schema(path)
        started_at = datetime.now(timezone.utc).isoformat()
        _append_csv(
            path,
            SESSION_COLUMNS,
            [
                {
                    "session_id": self.session_id,
                    "started_at_utc": started_at,
                    **self.metadata,
                }
            ],
        )


def _prepare_rows(scan: dict[str, Any], session_id: str) -> dict[str, Any] | None:
    if not isinstance(scan, dict):
        raise ValueError("scan is not an object")
    received_at = scan.get("timestamp")
    if not isinstance(received_at, str) or not received_at.strip():
        raise ValueError("scan has no received timestamp")
    scan_id = "" if scan.get("scanId") is None else str(scan.get("scanId"))
    networks = scan.get("networks", [])
    if not isinstance(networks, list):
        raise ValueError("networks is not a list")

    access_points: list[dict[str, Any]] = []
    for network in networks:
        row = _access_point_row(network, session_id, scan_id, received_at)
        if row is None:
            logger.warning("Dropped an invalid access point while recording scan %s", scan_id)
            continue
        access_points.append(row)

    return {
        "scan_id": scan_id,
        "received_at": received_at,
        "scan": {
            "session_id": session_id,
            "scan_id": scan_id,
            "received_at_utc": received_at,
            "network_count": len(access_points),
            "scan_success": "true",
        },
        "access_points": access_points,
        "features": _feature_rows(access_points, session_id, scan_id, received_at),
    }


def _access_point_row(
    network: Any,
    session_id: str,
    scan_id: str,
    received_at: str,
) -> dict[str, Any] | None:
    if not isinstance(network, dict):
        return None
    rssi = network.get("rssi")
    channel = network.get("channel")
    bssid = network.get("bssid")
    if isinstance(rssi, bool) or not isinstance(rssi, int):
        return None
    if isinstance(channel, bool) or not isinstance(channel, int):
        return None
    if not isinstance(bssid, str) or not bssid.strip():
        return None
    ssid = network.get("ssid", "")
    if ssid is None:
        ssid = ""
    if not isinstance(ssid, str):
        return None
    security = network.get("securityType", "UNKNOWN")
    if not isinstance(security, str) or not security.strip():
        security = "UNKNOWN"
    return {
        "session_id": session_id,
        "scan_id": scan_id,
        "received_at_utc": received_at,
        "ssid": ssid,
        "bssid": bssid.strip().upper(),
        "rssi": rssi,
        "channel": channel,
        "security_type": security.strip(),
    }


def channel_feature_rows(networks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return channels 1–13 using the same feature calculations as recording."""
    access_points = []
    for network in networks:
        row = _access_point_row(network, "", "", "")
        if row is not None:
            access_points.append(row)
    return _feature_rows(access_points, "", "", "")


def _feature_rows(
    access_points: list[dict[str, Any]],
    session_id: str,
    scan_id: str,
    received_at: str,
) -> list[dict[str, Any]]:
    grouped: dict[int, list[int]] = {channel: [] for channel in WIFI_CHANNELS}
    for access_point in access_points:
        channel = access_point["channel"]
        if channel in grouped:
            grouped[channel].append(access_point["rssi"])

    counts = {channel: len(values) for channel, values in grouped.items()}
    rows: list[dict[str, Any]] = []
    for channel in WIFI_CHANNELS:
        readings = grouped[channel]
        mean_rssi = linear_power_mean_dbm(readings)
        strongest = max(readings) if readings else None
        adjacent = 0
        weighted = 0.0
        for other in WIFI_CHANNELS:
            if other == channel:
                continue
            overlap = spectral_overlap(channel, other)
            if overlap <= 0:
                continue
            adjacent += counts[other]
            weighted += counts[other] * overlap
        rows.append(
            {
                "session_id": session_id,
                "scan_id": scan_id,
                "received_at_utc": received_at,
                "channel": channel,
                "ap_count": counts[channel],
                "mean_rssi_dbm": "" if mean_rssi is None else mean_rssi,
                "strongest_rssi_dbm": "" if strongest is None else strongest,
                "adjacent_ap_count": adjacent,
                "overlap_weighted_ap_count": round(weighted, 2),
            }
        )
    return rows


def _normalize_metadata(metadata: dict[str, str] | None) -> dict[str, str]:
    source = session_metadata_from_environment() if metadata is None else metadata
    return {
        field: _clean_metadata(source.get(field, ""), limit)
        for field, limit in _METADATA_LIMITS.items()
    }


def _clean_metadata(value: Any, limit: int) -> str:
    """Keep one CSV field: no line breaks or other control characters, bounded length."""
    if not isinstance(value, str):
        return ""
    cleaned = []
    changed = False
    for char in value:
        if ord(char) < 32 or char == "\x7f" or char in "\u2028\u2029":
            cleaned.append(" ")
            changed = True
        else:
            cleaned.append(char)
    text = " ".join("".join(cleaned).split())
    if len(text) > limit:
        logger.warning("Session metadata was shortened to %s characters", limit)
        text = text[:limit].rstrip()
    elif changed:
        logger.info("Session metadata control characters were replaced with spaces")
    return text


def _ensure_sessions_schema(path: Path) -> None:
    """Add metadata columns to an older sessions.csv without dropping rows."""
    if not path.exists() or path.stat().st_size == 0:
        return
    with path.open(newline="", encoding="utf-8") as handle:
        header = next(csv.reader(handle), [])
    if header == SESSION_COLUMNS:
        return
    if header != LEGACY_SESSION_COLUMNS:
        raise csv.Error(f"{path.name} header does not match the dataset schema")
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != LEGACY_SESSION_COLUMNS:
            raise csv.Error(f"{path.name} header does not match the dataset schema")
        rows = []
        for row in reader:
            migrated = {column: "" for column in SESSION_COLUMNS}
            for column in LEGACY_SESSION_COLUMNS:
                migrated[column] = row.get(column) or ""
            rows.append(migrated)
    temporary = path.with_name(f"{path.name}.tmp")
    try:
        with temporary.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=SESSION_COLUMNS, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    logger.info("Added session metadata columns to %s and kept %s existing rows", path.name, len(rows))


def _append_csv(path: Path, columns: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not path.exists() or path.stat().st_size == 0
    if path.exists() and path.stat().st_size > 0:
        with path.open(newline="", encoding="utf-8") as handle:
            header = next(csv.reader(handle), [])
        if header != columns:
            raise csv.Error(f"{path.name} header does not match the dataset schema")

    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
        if write_header:
            writer.writeheader()
        writer.writerows(rows)
        handle.flush()
        os.fsync(handle.fileno())


def _load_recorded_keys(path: Path) -> set[tuple[str, str]]:
    if not path.exists() or path.stat().st_size == 0:
        return set()
    keys: set[tuple[str, str]] = set()
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != SCAN_COLUMNS:
            raise csv.Error(f"{path.name} header does not match the dataset schema")
        for row in reader:
            scan_id = row.get("scan_id", "")
            received_at = row.get("received_at_utc", "")
            if received_at:
                keys.add((scan_id, received_at))
    return keys


def export_pseudonymized(source_dir: Path, dest_dir: Path | None = None) -> Path:
    """Write a copy whose SSID and BSSID values are stable pseudonyms.

    The salt stays in the local recording directory and is not copied.
    """
    source_dir = Path(source_dir)
    if dest_dir is None:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        dest_dir = source_dir.parent / "exports" / stamp
    dest_dir.mkdir(parents=True, exist_ok=True)
    salt = _load_or_create_salt(source_dir / ".pseudonym_salt")

    _copy_csv(
        source_dir / "sessions.csv",
        dest_dir / "sessions.csv",
        SESSION_COLUMNS,
        salt,
        legacy_headers=(tuple(LEGACY_SESSION_COLUMNS),),
    )
    _copy_csv(source_dir / "scans.csv", dest_dir / "scans.csv", SCAN_COLUMNS, salt)
    _copy_csv(
        source_dir / "access_points.csv",
        dest_dir / "access_points.csv",
        ACCESS_POINT_COLUMNS,
        salt,
        pseudonymize=True,
    )
    _copy_csv(
        source_dir / "channel_features.csv",
        dest_dir / "channel_features.csv",
        FEATURE_COLUMNS,
        salt,
    )
    note = dest_dir / "EXPORT_NOTE.txt"
    note.write_text(
        "SSID and BSSID values in access_points.csv are pseudonyms.\n"
        "The salt used to create them was not copied into this export.\n"
        "Channel features are derived measurements, not interference labels.\n",
        encoding="utf-8",
    )
    return dest_dir


def _load_or_create_salt(path: Path) -> bytes:
    if path.exists():
        salt = path.read_bytes()
        if salt:
            return salt
    path.parent.mkdir(parents=True, exist_ok=True)
    salt = os.urandom(32)
    path.write_bytes(salt)
    return salt


def _copy_csv(
    source: Path,
    dest: Path,
    columns: list[str],
    salt: bytes,
    *,
    pseudonymize: bool = False,
    legacy_headers: tuple[tuple[str, ...], ...] = (),
) -> None:
    if not source.exists():
        return
    with source.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fieldnames = tuple(reader.fieldnames or [])
        if fieldnames != tuple(columns) and fieldnames not in legacy_headers:
            raise csv.Error(f"{source.name} header does not match the dataset schema")
        rows = []
        for row in reader:
            normalized = {column: row.get(column) or "" for column in columns}
            if pseudonymize:
                ssid = normalized.get("ssid", "")
                normalized["ssid"] = "" if ssid == "" else _pseudonym("ssid", ssid, salt)
                normalized["bssid"] = _pseudonym("bssid", normalized.get("bssid", ""), salt)
            rows.append(normalized)
    with dest.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def _pseudonym(kind: str, value: str, salt: bytes) -> str:
    digest = hashlib.sha256(salt + b"|" + kind.encode("utf-8") + b"|" + value.encode("utf-8"))
    return f"{kind}_{digest.hexdigest()[:16]}"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export a local ESP32 dataset.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    export_parser = subparsers.add_parser(
        "export",
        help="Write a pseudonymized copy of the local recordings.",
    )
    export_parser.add_argument(
        "--pseudonymize",
        action="store_true",
        required=True,
        help="Replace SSID and BSSID with stable pseudonyms.",
    )
    export_parser.add_argument("--source", type=Path, default=None)
    export_parser.add_argument("--dest", type=Path, default=None)
    return parser


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    args = _build_parser().parse_args()
    if args.command == "export":
        source = args.source or default_dataset_dir()
        destination = export_pseudonymized(source, args.dest)
        logger.info("Pseudonymized export written to %s", destination)


if __name__ == "__main__":
    main()
