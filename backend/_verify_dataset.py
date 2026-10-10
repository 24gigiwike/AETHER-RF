"""Temporary checks for dataset recording. Not part of the application."""

from __future__ import annotations

import csv
import os
from pathlib import Path

from dataset_recorder import (
    FEATURE_COLUMNS,
    LEGACY_SESSION_COLUMNS,
    SESSION_COLUMNS,
    ScanRecorder,
    export_pseudonymized,
    linear_power_mean_dbm,
    recorder_from_environment,
    session_metadata_from_environment,
)
from serial_reader import Esp32SerialReader


def check(condition: bool, label: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {label}")
    print(f"PASS: {label}")


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def test_recording(tmp: Path) -> None:
    recorder = ScanRecorder(tmp)
    scan = {
        "scanId": 7,
        "timestamp": "2026-10-10T18:00:00+00:00",
        "networkCount": 2,
        "networks": [
            {
                "ssid": "Lab",
                "bssid": "aa:bb:cc:dd:ee:ff",
                "rssi": -40,
                "channel": 6,
                "securityType": "WPA2_PSK",
            },
            {
                "ssid": "",
                "bssid": "10:20:30:40:50:60",
                "rssi": -50,
                "channel": 6,
                "securityType": "SECURED",
            },
        ],
    }
    check(recorder.record_scan(scan) is True, "first scan is recorded")
    check(recorder.record_scan(scan) is False, "the same scan is not recorded twice")

    scans = read_csv(tmp / "scans.csv")
    points = read_csv(tmp / "access_points.csv")
    features = read_csv(tmp / "channel_features.csv")
    check(len(scans) == 1 and scans[0]["scan_id"] == "7", "scan metadata is stored once")
    check(scans[0]["network_count"] == "2", "network count matches stored access points")
    check(scans[0]["received_at_utc"] == scan["timestamp"], "timestamp is the scan timestamp")
    check(len(points) == 2 and points[0]["bssid"] == "AA:BB:CC:DD:EE:FF", "access points keep BSSID, RSSI, channel, and security")
    check(points[0]["rssi"] == "-40" and points[0]["channel"] == "6", "RSSI and channel match the measurement")
    check(points[1]["ssid"] == "" and points[1]["security_type"] == "SECURED", "empty SSID and reported security are preserved")
    check(len(features) == 13, "features cover channels 1-13")
    channel_6 = next(row for row in features if row["channel"] == "6")
    check(channel_6["ap_count"] == "2", "channel occupancy counts access points")
    check(channel_6["strongest_rssi_dbm"] == "-40", "strongest RSSI is the measured maximum")
    check(
        float(channel_6["mean_rssi_dbm"]) == linear_power_mean_dbm([-40, -50]),
        "mean RSSI is the linear power mean",
    )
    check("congestion_score" not in FEATURE_COLUMNS and "label" not in FEATURE_COLUMNS, "features do not include a training label")
    empty = next(row for row in features if row["channel"] == "1")
    check(empty["ap_count"] == "0" and empty["mean_rssi_dbm"] == "", "empty channels do not invent RSSI")

    empty_scan = {
        "scanId": 8,
        "timestamp": "2026-10-10T18:05:00+00:00",
        "networkCount": 0,
        "networks": [],
    }
    check(recorder.record_scan(empty_scan) is True, "zero-network scan is retained")
    scans = read_csv(tmp / "scans.csv")
    zero = next(row for row in scans if row["scan_id"] == "8")
    check(zero["network_count"] == "0" and zero["scan_success"] == "true", "zero-network scan row is successful")
    points = read_csv(tmp / "access_points.csv")
    check(not any(row["scan_id"] == "8" for row in points), "zero-network scan has no access-point rows")

    restarted = ScanRecorder(tmp)
    check(restarted.record_scan(scan) is False, "restart does not duplicate an existing scan")
    check(len(read_csv(tmp / "scans.csv")) == 2, "restart appends and does not overwrite")
    check(len(read_csv(tmp / "sessions.csv")) == 2, "a new session id is recorded")

    disabled_dir = tmp / "disabled"
    disabled = ScanRecorder(disabled_dir, enabled=False)
    check(disabled.record_scan(scan) is False, "disabled recorder writes nothing")
    check(not disabled_dir.exists(), "disabled mode creates no dataset directory")

    os.environ.pop("AETHER_RECORD_SCANS", None)
    check(recorder_from_environment() is None, "recording stays off without explicit configuration")


def test_reader_hook(tmp: Path) -> None:
    recorder = ScanRecorder(tmp)
    reader = Esp32SerialReader(port="COM_UNUSED")
    reader.attach_recorder(recorder)
    reader._handle_line('{"scanSuccess": true, "scanId": 3, "networks": []}')
    reader._handle_line('not json')
    reader._handle_line('{"scanSuccess": false, "scanId": 4, "networks": []}')
    scans = read_csv(tmp / "scans.csv")
    check(len(scans) == 1 and scans[0]["scan_id"] == "3", "only a successful serial scan is recorded")
    check(scans[0]["network_count"] == "0", "serial zero-network scan is retained")


def test_export(tmp: Path) -> None:
    recorder = ScanRecorder(tmp)
    recorder.record_scan(
        {
            "scanId": 9,
            "timestamp": "2026-10-10T19:00:00+00:00",
            "networks": [
                {
                    "ssid": "Home",
                    "bssid": "AA:BB:CC:DD:EE:01",
                    "rssi": -55,
                    "channel": 1,
                    "securityType": "SECURED",
                }
            ],
        }
    )
    exported = export_pseudonymized(tmp, tmp / "export")
    points = read_csv(exported / "access_points.csv")
    check(points[0]["ssid"].startswith("ssid_"), "exported SSID is pseudonymized")
    check(points[0]["bssid"].startswith("bssid_"), "exported BSSID is pseudonymized")
    check("Home" not in points[0]["ssid"] and "AA:BB:CC:DD:EE:01" not in points[0]["bssid"], "raw identifiers are absent from the export")
    check(not (exported / ".pseudonym_salt").exists(), "the salt is not copied into the export")
    again = export_pseudonymized(tmp, tmp / "export-again")
    check(
        read_csv(again / "access_points.csv")[0]["bssid"] == points[0]["bssid"],
        "pseudonyms stay stable for the same local salt",
    )


def test_metadata(tmp: Path) -> None:
    saved = {name: os.environ.get(name) for name in _SESSION_ENV}
    try:
        for name in _SESSION_ENV:
            os.environ.pop(name, None)
        plain = ScanRecorder(tmp / "plain")
        plain.record_scan(_sample_scan(1, "2026-10-10T20:00:00+00:00"))
        session = read_csv(tmp / "plain" / "sessions.csv")[0]
        check(session["session_id"] == plain.session_id, "blank metadata keeps the generated session id")
        check(len(plain.session_id) == 32 and plain.session_id != "home_morning_01", "session id is a UUID, not the label")
        check(
            all(session[field] == "" for field in ("session_name", "session_environment", "session_scenario", "session_notes")),
            "missing metadata is stored blank",
        )
        check(_same_session_id(tmp / "plain", plain.session_id), "one session id links scans, access points, and features")

        os.environ["AETHER_RECORD_SCANS"] = "1"
        os.environ["AETHER_DATASET_DIR"] = str(tmp / "named")
        os.environ["AETHER_SESSION_NAME"] = "home_morning_01"
        os.environ["AETHER_SESSION_ENVIRONMENT"] = "home"
        os.environ["AETHER_SESSION_SCENARIO"] = "morning"
        os.environ["AETHER_SESSION_NOTES"] = "Laptop near the router,\nupstairs"
        labels = session_metadata_from_environment()
        check(labels["session_notes"] == "Laptop near the router, upstairs", "notes stay one CSV field")
        named = recorder_from_environment()
        assert named is not None
        named.record_scan(_sample_scan(2, "2026-10-10T20:05:00+00:00"))
        named_session = read_csv(tmp / "named" / "sessions.csv")[0]
        check(named_session["session_id"] == named.session_id, "named session keeps its UUID")
        check(named_session["session_name"] == "home_morning_01", "session name is recorded")
        check(named_session["session_environment"] == "home", "session environment is recorded")
        check(named_session["session_scenario"] == "morning", "session scenario is recorded")
        check(named_session["session_notes"] == "Laptop near the router, upstairs", "session notes are recorded")
        check(named_session["session_id"] != named_session["session_name"], "the name does not replace the UUID")
        check(_same_session_id(tmp / "named", named.session_id), "named session id links every dataset")

        long_name = "n" * 80
        limited = ScanRecorder(tmp / "limited", metadata={"session_name": long_name, "session_notes": "a\x00b"})
        limited.record_scan(_sample_scan(3, "2026-10-10T20:06:00+00:00"))
        limited_session = read_csv(tmp / "limited" / "sessions.csv")[0]
        check(limited_session["session_name"] == "n" * 64, "overlong session name is shortened to 64 characters")
        check(limited_session["session_notes"] == "a b", "control characters do not break the session row")
    finally:
        for name, value in saved.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


def test_legacy_sessions(tmp: Path) -> None:
    real_dir = Path(__file__).resolve().parent / "data" / "recordings"
    real_sessions = real_dir / "sessions.csv"
    real_scans = real_dir / "scans.csv"
    before_sessions = real_sessions.read_bytes()
    before_scans = real_scans.read_bytes()
    before_points = (real_dir / "access_points.csv").read_bytes()
    before_features = (real_dir / "channel_features.csv").read_bytes()

    legacy = tmp / "legacy"
    legacy.mkdir(parents=True)
    legacy_text = "session_id,started_at_utc\nabc123,2026-10-10T19:15:36.275238+00:00\n"
    (legacy / "sessions.csv").write_text(legacy_text, encoding="utf-8")
    (legacy / "scans.csv").write_bytes(before_scans)
    original_rows = read_csv(legacy / "sessions.csv")
    check(list(original_rows[0]) == LEGACY_SESSION_COLUMNS, "a pre-metadata sessions file has the original header")

    raw_export = tmp / "raw-export-src"
    raw_export.mkdir(parents=True)
    (raw_export / "sessions.csv").write_text(legacy_text, encoding="utf-8")
    raw_bytes = (raw_export / "sessions.csv").read_bytes()
    exported_raw = export_pseudonymized(raw_export, tmp / "raw-export")
    check((raw_export / "sessions.csv").read_bytes() == raw_bytes, "export leaves an old sessions file unchanged")
    exported_old = read_csv(exported_raw / "sessions.csv")
    check(list(exported_old[0]) == SESSION_COLUMNS, "an old sessions export gains blank metadata columns")
    check(exported_old[0]["session_id"] == original_rows[0]["session_id"], "an old sessions export keeps the session id")
    check(exported_old[0]["session_name"] == "", "an old sessions export leaves the name blank")

    recorder = ScanRecorder(
        legacy,
        metadata={
            "session_name": "home_morning_01",
            "session_environment": "home",
            "session_scenario": "morning",
            "session_notes": "added after the first recording",
        },
    )
    migrated = read_csv(legacy / "sessions.csv")
    check(list(migrated[0]) == SESSION_COLUMNS, "migrated sessions file has the metadata columns")
    check(len(migrated) == len(original_rows) + 1, "migration keeps every old session and appends one")
    for old, new in zip(original_rows, migrated):
        check(new["session_id"] == old["session_id"], "old session id is unchanged")
        check(new["started_at_utc"] == old["started_at_utc"], "old session timestamp is unchanged")
        check(all(new[field] == "" for field in SESSION_COLUMNS if field not in LEGACY_SESSION_COLUMNS), "old session metadata is blank")
    check((legacy / "scans.csv").read_bytes() == before_scans, "migration does not rewrite scan rows")
    check(migrated[-1]["session_id"] == recorder.session_id, "the new session uses a new UUID")
    check(migrated[-1]["session_name"] == "home_morning_01", "only the new session carries the name")
    second = ScanRecorder(legacy, metadata={"session_name": "second_session"})
    reopened = read_csv(legacy / "sessions.csv")
    check(reopened[0]["session_id"] == original_rows[0]["session_id"], "a later start keeps the original session")
    check(reopened[1]["session_name"] == "home_morning_01", "a later start leaves the named session unchanged")
    check(
        reopened[-1]["session_name"] == "second_session" and reopened[-1]["session_id"] == second.session_id,
        "a later start appends a separate session id",
    )

    recorder.record_scan(_sample_scan(4, "2026-10-10T20:10:00+00:00"))
    scans = read_csv(legacy / "scans.csv")
    check(scans[0]["scan_id"] == read_csv_bytes_first_scan(before_scans), "the first recorded scan row is unchanged")
    check(scans[-1]["session_id"] == recorder.session_id, "the new scan uses the new session id")

    source_bytes = (legacy / "sessions.csv").read_bytes()
    exported = export_pseudonymized(legacy, legacy / "export")
    check((legacy / "sessions.csv").read_bytes() == source_bytes, "export does not change the migrated sessions file")
    exported_sessions = read_csv(exported / "sessions.csv")
    check(exported_sessions[0]["session_id"] == original_rows[0]["session_id"], "export keeps the original session id")

    untouched = tmp / "untouched"
    untouched.mkdir(parents=True)
    (untouched / "sessions.csv").write_text(
        "session_id,started_at_utc\nabc,2026-10-10T00:00:00+00:00\n",
        encoding="utf-8",
    )
    frozen = (untouched / "sessions.csv").read_bytes()
    previous_name = os.environ.get("AETHER_SESSION_NAME")
    os.environ["AETHER_SESSION_NAME"] = "should-not-write"
    try:
        disabled = ScanRecorder(untouched, enabled=False, metadata={"session_name": "should-not-write"})
        check(disabled.record_scan(_sample_scan(5, "2026-10-10T20:11:00+00:00")) is False, "disabled mode writes no session metadata")
    finally:
        if previous_name is None:
            os.environ.pop("AETHER_SESSION_NAME", None)
        else:
            os.environ["AETHER_SESSION_NAME"] = previous_name
    check((untouched / "sessions.csv").read_bytes() == frozen, "disabled mode leaves the old sessions file unchanged")
    check(not (untouched / "scans.csv").exists(), "disabled mode creates no scan file")

    check(real_sessions.read_bytes() == before_sessions, "the live sessions file was not modified")
    check(real_scans.read_bytes() == before_scans, "the live scans file was not modified")
    check((real_dir / "access_points.csv").read_bytes() == before_points, "the live access-point file was not modified")
    check((real_dir / "channel_features.csv").read_bytes() == before_features, "the live feature file was not modified")


def _sample_scan(scan_id: int, timestamp: str) -> dict:
    return {
        "scanId": scan_id,
        "timestamp": timestamp,
        "networks": [
            {
                "ssid": "Lab",
                "bssid": "AA:BB:CC:DD:EE:10",
                "rssi": -40,
                "channel": 6,
                "securityType": "SECURED",
            }
        ],
    }


def _same_session_id(directory: Path, session_id: str) -> bool:
    scans = read_csv(directory / "scans.csv")
    points = read_csv(directory / "access_points.csv")
    features = read_csv(directory / "channel_features.csv")
    return (
        scans[-1]["session_id"] == session_id
        and points[-1]["session_id"] == session_id
        and features[-1]["session_id"] == session_id
        and len({row["session_id"] for row in features}) == 1
    )


def read_csv_bytes_first_scan(payload: bytes) -> str:
    import io
    rows = list(csv.DictReader(io.StringIO(payload.decode("utf-8"))))
    return rows[0]["scan_id"]


_SESSION_ENV = (
    "AETHER_RECORD_SCANS",
    "AETHER_DATASET_DIR",
    "AETHER_SESSION_NAME",
    "AETHER_SESSION_ENVIRONMENT",
    "AETHER_SESSION_SCENARIO",
    "AETHER_SESSION_NOTES",
)


if __name__ == "__main__":
    import tempfile
    root = Path(tempfile.mkdtemp(prefix="aether-dataset-"))
    test_recording(root / "main")
    test_reader_hook(root / "hook")
    test_export(root / "export-src")
    test_metadata(root / "metadata")
    test_legacy_sessions(root / "legacy-parent")
    print("ALL DATASET CHECKS PASSED")
