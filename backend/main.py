"""Local FastAPI service for real ESP32 Wi-Fi scans.

Run one process, without reload, so a single thread owns COM4:

    .\\.venv\\Scripts\\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from congestion_model import (
    MODEL_NAME,
    PREDICTION_SOURCE,
    model_is_available,
    predict_features,
    scan_features_from_networks,
)
from dataset_recorder import linear_power_mean_dbm
from serial_reader import get_reader


def _configure_local_logging() -> None:
    """Show reader and dataset messages under Uvicorn, which does not configure these loggers."""
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
    for name in ("aether.esp32", "aether.dataset", "aether.model"):
        local_logger = logging.getLogger(name)
        if local_logger.handlers:
            continue
        local_logger.addHandler(handler)
        local_logger.setLevel(logging.INFO)
        local_logger.propagate = False


_configure_local_logging()

# A scan older than this, or any scan while the serial link is down, is stale.
FRESH_WINDOW_SECONDS = 30
WIFI_CHANNELS = range(1, 14)

# Vite's default dev server is 5173. `npm run dev` serves the existing
# dashboard through server.ts on port 3000.
LOCAL_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

ObservationState = Literal["fresh", "stale", "waiting"]
PayloadStatus = Literal["ok", "waiting"]


class StatusResponse(BaseModel):
    esp32Connected: bool
    comPort: str
    baudRate: int
    lastSuccessfulScanTimestamp: str | None
    lastScanId: int | str | None
    dataSource: Literal["esp32"]
    observationState: ObservationState
    observationsFresh: bool
    freshWindowSeconds: int
    detail: str


class NetworkObservation(BaseModel):
    ssid: str
    bssid: str
    rssi: int
    channel: int
    securityType: str


class ObservationsResponse(BaseModel):
    status: PayloadStatus
    observationState: ObservationState
    dataSource: Literal["esp32"]
    message: str | None
    scanId: int | str | None
    timestamp: str | None
    networkCount: int
    networks: list[NetworkObservation]


class ChannelStat(BaseModel):
    channel: int
    accessPointCount: int
    averageRssi: float | None
    strongestRssi: int | None


class PredictionResponse(BaseModel):
    status: Literal["ok", "unavailable"]
    scanId: int | str | None
    timestamp: str | None
    predictedClass: Literal["LOW", "MEDIUM", "HIGH"] | None
    modelName: Literal["Random Forest"]
    predictionSource: Literal["heuristic-trained demonstration model"]
    modelStatus: str


class ChannelsResponse(BaseModel):
    status: PayloadStatus
    observationState: ObservationState
    dataSource: Literal["esp32"]
    message: str | None
    scanId: int | str | None
    timestamp: str | None
    averageRssiMethod: Literal["linear_power"]
    channels: list[ChannelStat]


def observation_state(snapshot: dict[str, Any], now: datetime | None = None) -> ObservationState:
    latest = snapshot.get("latest")
    received_at = snapshot.get("lastSuccessfulAt")
    if latest is None or not isinstance(received_at, datetime):
        return "waiting"

    current = now or datetime.now(timezone.utc)
    age_seconds = (current - received_at).total_seconds()
    if snapshot.get("connected") and age_seconds <= FRESH_WINDOW_SECONDS:
        return "fresh"
    return "stale"


def _freshness_message(state: ObservationState) -> str | None:
    if state == "waiting":
        return (
            "No successful ESP32 scan has been received yet. "
            "These are not simulated measurements."
        )
    if state == "stale":
        return (
            "Showing the last successful ESP32 scan. "
            "It is stale because the serial link is down or the scan is older than "
            f"{FRESH_WINDOW_SECONDS} seconds."
        )
    return None


def build_status(snapshot: dict[str, Any], now: datetime | None = None) -> StatusResponse:
    state = observation_state(snapshot, now)
    latest = snapshot.get("latest") or {}
    return StatusResponse(
        esp32Connected=bool(snapshot.get("connected")),
        comPort=str(snapshot.get("port")),
        baudRate=int(snapshot.get("baudRate")),
        lastSuccessfulScanTimestamp=latest.get("timestamp"),
        lastScanId=latest.get("scanId"),
        dataSource="esp32",
        observationState=state,
        observationsFresh=state == "fresh",
        freshWindowSeconds=FRESH_WINDOW_SECONDS,
        detail=str(snapshot.get("detail") or ""),
    )


def build_observations(
    snapshot: dict[str, Any],
    now: datetime | None = None,
) -> ObservationsResponse:
    state = observation_state(snapshot, now)
    latest = snapshot.get("latest")
    if latest is None:
        return ObservationsResponse(
            status="waiting",
            observationState="waiting",
            dataSource="esp32",
            message=_freshness_message("waiting"),
            scanId=None,
            timestamp=None,
            networkCount=0,
            networks=[],
        )

    return ObservationsResponse(
        status="ok",
        observationState=state,
        dataSource="esp32",
        message=_freshness_message(state),
        scanId=latest.get("scanId"),
        timestamp=latest.get("timestamp"),
        networkCount=int(latest.get("networkCount", 0)),
        networks=latest.get("networks", []),
    )


def build_channels(
    snapshot: dict[str, Any],
    now: datetime | None = None,
) -> ChannelsResponse:
    state = observation_state(snapshot, now)
    latest = snapshot.get("latest")
    networks = [] if latest is None else latest.get("networks", [])
    return ChannelsResponse(
        status="waiting" if latest is None else "ok",
        observationState=state,
        dataSource="esp32",
        message=_freshness_message(state),
        scanId=None if latest is None else latest.get("scanId"),
        timestamp=None if latest is None else latest.get("timestamp"),
        averageRssiMethod="linear_power",
        channels=channel_statistics(networks),
    )


def channel_statistics(networks: list[dict[str, Any]]) -> list[ChannelStat]:
    grouped: dict[int, list[int]] = {channel: [] for channel in WIFI_CHANNELS}
    for network in networks:
        channel = network.get("channel")
        rssi = network.get("rssi")
        if isinstance(channel, int) and channel in grouped and isinstance(rssi, int):
            grouped[channel].append(rssi)

    stats: list[ChannelStat] = []
    for channel in WIFI_CHANNELS:
        readings = grouped[channel]
        if not readings:
            stats.append(
                ChannelStat(
                    channel=channel,
                    accessPointCount=0,
                    averageRssi=None,
                    strongestRssi=None,
                )
            )
            continue
        stats.append(
            ChannelStat(
                channel=channel,
                accessPointCount=len(readings),
                averageRssi=_linear_power_average_dbm(readings),
                strongestRssi=max(readings),
            )
        )
    return stats


def build_prediction(snapshot: dict[str, Any], now: datetime | None = None) -> PredictionResponse:
    """Classify the latest fresh scan. Does not train and does not open the serial port."""
    state = observation_state(snapshot, now)
    latest = snapshot.get("latest")
    scan_id = None if latest is None else latest.get("scanId")
    timestamp = None if latest is None else latest.get("timestamp")
    if not model_is_available():
        return _prediction_unavailable("model_missing", scan_id, timestamp)
    if state != "fresh" or latest is None:
        reason = "no_fresh_scan" if state == "waiting" else "stale_scan"
        return _prediction_unavailable(reason, scan_id, timestamp)
    try:
        features = scan_features_from_networks(latest.get("networks", []))
        predicted = predict_features(features)
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        logger = logging.getLogger("aether.model")
        logger.error("Random Forest prediction failed: %s", error)
        return _prediction_unavailable("prediction_failed", scan_id, timestamp)
    return PredictionResponse(
        status="ok",
        scanId=scan_id,
        timestamp=timestamp,
        predictedClass=predicted,
        modelName=MODEL_NAME,
        predictionSource=PREDICTION_SOURCE,
        modelStatus="ready",
    )


def _prediction_unavailable(
    model_status: str,
    scan_id: int | str | None,
    timestamp: str | None,
) -> PredictionResponse:
    return PredictionResponse(
        status="unavailable",
        scanId=scan_id,
        timestamp=timestamp,
        predictedClass=None,
        modelName=MODEL_NAME,
        predictionSource=PREDICTION_SOURCE,
        modelStatus=model_status,
    )


def _linear_power_average_dbm(readings: list[int]) -> float:
    average = linear_power_mean_dbm(readings)
    return -100.0 if average is None else average


@asynccontextmanager
async def lifespan(app: FastAPI):
    reader = get_reader()
    reader.start()
    try:
        yield
    finally:
        reader.stop()


app = FastAPI(
    title="AETHER-RF ESP32 Wi-Fi Ingestion",
    summary="Serves the latest real ESP32 Wi-Fi scan read from USB serial.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)


@app.get("/api/status", response_model=StatusResponse)
def read_status() -> StatusResponse:
    return build_status(get_reader().snapshot())


@app.get("/api/observations", response_model=ObservationsResponse)
def read_observations() -> ObservationsResponse:
    return build_observations(get_reader().snapshot())


@app.get("/api/channels", response_model=ChannelsResponse)
def read_channels() -> ChannelsResponse:
    return build_channels(get_reader().snapshot())


@app.get("/api/prediction", response_model=PredictionResponse)
def read_prediction() -> PredictionResponse:
    return build_prediction(get_reader().snapshot())
