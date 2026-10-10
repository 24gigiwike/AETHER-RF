"""ESP32 USB serial ingestion.

One reader thread owns COM4. FastAPI and the command-line printer both use
this module so the port is never opened once per HTTP request.
"""

from __future__ import annotations

import json
import logging
import math
import threading
import time
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

import serial

PORT = "COM4"
BAUD_RATE = 115200
READ_TIMEOUT_SECONDS = 1
POST_OPEN_DELAY_SECONDS = 2
RECONNECT_INTERVAL_SECONDS = 5

logger = logging.getLogger("aether.esp32")

KNOWN_SECURITY_TYPES = {
    "OPEN",
    "WEP",
    "WPA_PSK",
    "WPA2_PSK",
    "WPA_WPA2_PSK",
    "WPA3_PSK",
    "WPA2_WPA3_PSK",
    "UNKNOWN",
}

# ESP-IDF wifi_auth_mode_t values that match the dashboard security names.
_AUTH_MODE_INT = {
    0: "OPEN",
    1: "WEP",
    2: "WPA_PSK",
    3: "WPA2_PSK",
    4: "WPA_WPA2_PSK",
    6: "WPA3_PSK",
    7: "WPA2_WPA3_PSK",
}

_SECURITY_ALIASES = {
    "WPA": "WPA_PSK",
    "WPA2": "WPA2_PSK",
    "WPA3": "WPA3_PSK",
    "WPA_WPA2": "WPA_WPA2_PSK",
    "WPA2_WPA3": "WPA2_WPA3_PSK",
    "WIFI_AUTH_OPEN": "OPEN",
    "WIFI_AUTH_WEP": "WEP",
    "WIFI_AUTH_WPA_PSK": "WPA_PSK",
    "WIFI_AUTH_WPA2_PSK": "WPA2_PSK",
    "WIFI_AUTH_WPA_WPA2_PSK": "WPA_WPA2_PSK",
    "WIFI_AUTH_WPA3_PSK": "WPA3_PSK",
    "WIFI_AUTH_WPA2_WPA3_PSK": "WPA2_WPA3_PSK",
}

_SECURITY_KEYS = ("securityType", "security", "authMode", "encryption", "auth")


def parse_serial_line(raw_line: str) -> tuple[str, dict[str, Any] | None]:
    """Classify one serial line.

    Returns ``("malformed", info)``, ``("failed", info)``, or
    ``("success", scan)``. A successful scan may contain zero networks.
    A failed scan is a well-formed object whose ``scanSuccess`` flag is false.
    """
    text = raw_line.replace("\x00", "").strip()
    if not text:
        return "malformed", {"reason": "empty"}

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return "malformed", {"reason": "json"}

    if not isinstance(payload, dict):
        return "malformed", {"reason": "not_object"}

    networks = payload.get("networks")
    if not isinstance(networks, list):
        return "malformed", {"reason": "networks"}

    scan_success = payload.get("scanSuccess", None)
    scan_id = _scan_id(payload)
    if scan_success is False or scan_success is None:
        return "failed", {"scanId": scan_id}

    if scan_success is not True:
        return "malformed", {"reason": "scan_success"}

    parsed_networks: list[dict[str, Any]] = []
    dropped = 0
    for item in networks:
        network = _parse_network(item)
        if network is None:
            dropped += 1
            continue
        parsed_networks.append(network)

    if dropped:
        logger.warning("Dropped %s invalid network entries from scan %s", dropped, scan_id)

    return "success", {"scanId": scan_id, "networks": parsed_networks}


def _scan_id(payload: dict[str, Any]) -> int | str | None:
    value = payload.get("scanId", payload.get("scan_id"))
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _parse_network(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None

    rssi = _finite_int(item.get("rssi"))
    channel = _finite_int(item.get("channel"))
    bssid = item.get("bssid")
    if rssi is None or channel is None or not isinstance(bssid, str):
        return None
    if not -120 <= rssi <= 0 or not 1 <= channel <= 14:
        return None

    bssid = bssid.strip().upper()
    if not bssid:
        return None

    ssid = item.get("ssid", "")
    if ssid is None:
        ssid = ""
    elif not isinstance(ssid, str):
        return None

    return {
        "ssid": ssid,
        "bssid": bssid,
        "rssi": rssi,
        "channel": channel,
        "securityType": _security_type(item),
    }


def _finite_int(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, float) and not value.is_integer():
        return None
    return int(value)


def _security_type(network: dict[str, Any]) -> str:
    raw = None
    for key in _SECURITY_KEYS:
        if key in network:
            raw = network[key]
            break
    return _normalize_security(raw)


def _normalize_security(value: Any) -> str:
    if isinstance(value, bool) or value is None:
        return "UNKNOWN"
    if isinstance(value, int):
        return _AUTH_MODE_INT.get(value, "UNKNOWN")
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return _AUTH_MODE_INT.get(int(value), "UNKNOWN")
    if not isinstance(value, str):
        return "UNKNOWN"

    token = value.strip().upper().replace("-", "_").replace("/", "_").replace(" ", "_")
    while "__" in token:
        token = token.replace("__", "_")
    if token in KNOWN_SECURITY_TYPES:
        return token
    aliased = _SECURITY_ALIASES.get(token)
    if aliased is not None:
        return aliased
    # Preserve compact firmware labels such as "SECURED" instead of
    # replacing a reported value with UNKNOWN.
    if token and len(token) <= 32 and token.replace("_", "").isalnum():
        return token
    return "UNKNOWN"


class Esp32SerialReader:
    """Background owner of the ESP32 serial port.

    ``start`` is safe to call more than once in the same process. The latest
    successful scan is kept when the cable is unplugged; nothing is invented
    to fill the gap.
    """

    def __init__(
        self,
        port: str = PORT,
        baud_rate: int = BAUD_RATE,
        reconnect_interval: float = RECONNECT_INTERVAL_SECONDS,
        on_successful_scan: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self.port = port
        self.baud_rate = baud_rate
        self.reconnect_interval = reconnect_interval
        self._on_successful_scan = on_successful_scan
        self._recorder = None
        self._stop = threading.Event()
        self._lifecycle_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._connected = False
        self._detail = "Serial reader has not started."
        self._latest: dict[str, Any] | None = None
        self._last_successful_at: datetime | None = None

    def start(self) -> None:
        with self._lifecycle_lock:
            if self._thread is not None and self._thread.is_alive():
                logger.info("ESP32 serial reader is already running on %s", self.port)
                return
            self._stop.clear()
            self._thread = threading.Thread(
                target=self._run,
                name="esp32-serial-reader",
                daemon=True,
            )
            self._thread.start()

    def stop(self) -> None:
        with self._lifecycle_lock:
            self._stop.set()
            thread = self._thread
            if thread is not None and thread is not threading.current_thread():
                thread.join(timeout=5)
                if thread.is_alive():
                    logger.warning("ESP32 serial reader did not stop within 5 seconds")

    def snapshot(self) -> dict[str, Any]:
        with self._state_lock:
            latest = _copy_scan(self._latest)
            return {
                "connected": self._connected,
                "port": self.port,
                "baudRate": self.baud_rate,
                "detail": self._detail,
                "latest": latest,
                "lastSuccessfulAt": self._last_successful_at,
            }

    def _run(self) -> None:
        logger.info("Connecting to ESP32 on %s...", self.port)
        while not self._stop.is_set():
            try:
                self._open_and_read()
            except serial.SerialException as error:
                self._mark_disconnected(
                    "Serial connection error: "
                    f"{error}. Check {self.port} and close Arduino Serial Monitor."
                )
            except OSError as error:
                self._mark_disconnected(
                    f"Serial connection error: {error}. Check {self.port}."
                )

            if self._stop.is_set():
                break

            logger.info(
                "Retrying %s in %.0f seconds",
                self.port,
                self.reconnect_interval,
            )
            self._stop.wait(self.reconnect_interval)

        self._mark_disconnected("ESP32 serial reader stopped.")

    def _open_and_read(self) -> None:
        with serial.Serial(
            port=self.port,
            baudrate=self.baud_rate,
            timeout=READ_TIMEOUT_SECONDS,
        ) as esp32:
            self._mark_connected(
                "ESP32 connected successfully. Waiting for real Wi-Fi scans."
            )
            if self._stop.wait(POST_OPEN_DELAY_SECONDS):
                return

            while not self._stop.is_set():
                raw_line = esp32.readline()
                if not raw_line:
                    continue
                text = raw_line.decode("utf-8", errors="replace").replace("\x00", "").strip()
                if text:
                    self._handle_line(text)

    def _handle_line(self, text: str) -> None:
        kind, parsed = parse_serial_line(text)
        if kind == "malformed" or parsed is None:
            reason = (parsed or {}).get("reason", "malformed")
            if reason == "json":
                logger.info("Skipping non-JSON serial output")
            else:
                logger.info("Skipping malformed scan payload (%s)", reason)
            return

        if kind == "failed":
            logger.info("ESP32 reported a failed scan (scanId=%s)", parsed.get("scanId"))
            return

        received_at = datetime.now(timezone.utc)
        scan = {
            "scanId": parsed.get("scanId"),
            "timestamp": received_at.isoformat(),
            "networkCount": len(parsed["networks"]),
            "networks": parsed["networks"],
        }
        with self._state_lock:
            self._latest = scan
            self._last_successful_at = received_at

        logger.info(
            "Stored successful scan %s (%s networks)",
            scan["scanId"],
            scan["networkCount"],
        )
        self._record_scan(scan)
        if self._on_successful_scan is None:
            return
        try:
            self._on_successful_scan(_copy_scan(scan))
        except Exception:
            logger.exception("Scan callback failed")

    def attach_recorder(self, recorder: Any) -> None:
        """Attach the optional CSV recorder. It does not open the serial port."""
        self._recorder = recorder

    def _record_scan(self, scan: dict[str, Any]) -> None:
        recorder = self._recorder
        if recorder is None:
            return
        try:
            recorder.record_scan(_copy_scan(scan))
        except Exception:
            logger.exception("Dataset recording failed")

    def _mark_connected(self, detail: str) -> None:
        with self._state_lock:
            self._connected = True
            self._detail = detail
        logger.info(detail)

    def _mark_disconnected(self, detail: str) -> None:
        with self._state_lock:
            self._connected = False
            self._detail = detail
        logger.warning(detail)


def _copy_scan(scan: dict[str, Any] | None) -> dict[str, Any] | None:
    if scan is None:
        return None
    return {
        "scanId": scan.get("scanId"),
        "timestamp": scan.get("timestamp"),
        "networkCount": scan.get("networkCount", 0),
        "networks": [dict(network) for network in scan.get("networks", [])],
    }


_reader: Esp32SerialReader | None = None
_reader_lock = threading.Lock()


def get_reader() -> Esp32SerialReader:
    """Return the process-wide reader. Does not open the serial port."""
    global _reader
    with _reader_lock:
        if _reader is None:
            from dataset_recorder import recorder_from_environment

            _reader = Esp32SerialReader()
            _reader.attach_recorder(recorder_from_environment())
        return _reader


def _print_scan(scan: dict[str, Any]) -> None:
    print("=" * 45)
    print(f"SCAN #{scan.get('scanId')}")
    print(f"Timestamp: {scan.get('timestamp')}")
    print(f"Networks detected: {scan.get('networkCount', 0)}")
    print("=" * 45)

    for network in scan.get("networks", []):
        ssid = network.get("ssid") or "<Hidden Network>"
        print(f"SSID: {ssid}")
        print(f"BSSID: {network.get('bssid', 'N/A')}")
        print(f"RSSI: {network.get('rssi', 'N/A')} dBm")
        print(f"Channel: {network.get('channel', 'N/A')}")
        print(f"Security: {network.get('securityType', 'UNKNOWN')}")
        print("-" * 30)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    from dataset_recorder import recorder_from_environment

    reader = Esp32SerialReader(on_successful_scan=_print_scan)
    reader.attach_recorder(recorder_from_environment())
    reader.start()
    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nESP32 serial reader stopped.")
        reader.stop()


if __name__ == "__main__":
    main()
