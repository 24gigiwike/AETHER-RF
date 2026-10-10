/**
 * Reads the local FastAPI ESP32 service and maps it onto the dashboard contract.
 * Measurements come only from the API. Simulation data is never filled in here.
 */

import { processRawObservations } from './derivedParameters';
import {
  DerivedAnalysis,
  Esp32LinkState,
  RawScanBatch,
  RawWiFiObservation,
  WiFiSecurityType,
} from '../types/wifi';

export const ESP32_POLL_INTERVAL_MS = 4000;

const KNOWN_SECURITY = new Set<WiFiSecurityType>([
  'OPEN',
  'WEP',
  'WPA_PSK',
  'WPA2_PSK',
  'WPA_WPA2_PSK',
  'WPA3_PSK',
  'WPA2_WPA3_PSK',
  'SECURED',
  'UNKNOWN',
]);

export const ESP32_LINK_LABEL: Record<Esp32LinkState, string> = {
  fresh: 'Connected / Fresh',
  stale: 'Connected / Stale',
  disconnected: 'Disconnected',
  waiting: 'Waiting for first scan',
  unavailable: 'API unavailable',
};

interface StatusResponse {
  esp32Connected: boolean;
  comPort: string;
  lastSuccessfulScanTimestamp: string | null;
  lastScanId: number | string | null;
  dataSource: 'esp32';
  observationState: 'fresh' | 'stale' | 'waiting';
  observationsFresh: boolean;
  detail: string;
}

interface NetworkObservation {
  ssid: string;
  bssid: string;
  rssi: number;
  channel: number;
  securityType: string;
}

interface ObservationsResponse {
  status: 'ok' | 'waiting';
  observationState: 'fresh' | 'stale' | 'waiting';
  dataSource: 'esp32';
  message: string | null;
  scanId: number | string | null;
  timestamp: string | null;
  networkCount: number;
  networks: NetworkObservation[];
}

interface ChannelsResponse {
  status: 'ok' | 'waiting';
  observationState: 'fresh' | 'stale' | 'waiting';
  message: string | null;
  scanId: number | string | null;
  channels: Array<{
    channel: number;
    accessPointCount: number;
    averageRssi: number | null;
    strongestRssi: number | null;
  }>;
}

export interface Esp32ScanSnapshot {
  key: string;
  batch: RawScanBatch;
  derived: DerivedAnalysis;
}

export interface CongestionPrediction {
  status: 'ok' | 'unavailable';
  scanId: number | string | null;
  timestamp: string | null;
  predictedClass: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  modelName: string;
  predictionSource: string;
  modelStatus: string;
}

export const PREDICTION_UNAVAILABLE: CongestionPrediction = {
  status: 'unavailable',
  scanId: null,
  timestamp: null,
  predictedClass: null,
  modelName: 'Random Forest',
  predictionSource: 'heuristic-trained demonstration model',
  modelStatus: 'api_unavailable',
};

export type Esp32PollResult =
  | {
      ok: false;
      link: 'unavailable';
      detail: string;
      scan: null;
      prediction: CongestionPrediction;
    }
  | {
      ok: true;
      link: Esp32LinkState;
      detail: string;
      scan: Esp32ScanSnapshot | null;
      prediction: CongestionPrediction;
    };

export function esp32ApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  const base = configured || 'http://127.0.0.1:8000';
  return base.replace(/\/$/, '');
}

export async function pollEsp32(signal: AbortSignal): Promise<Esp32PollResult> {
  try {
    const [status, observations, channels, prediction] = await Promise.all([
      fetchJson<StatusResponse>('/api/status', signal),
      fetchJson<ObservationsResponse>('/api/observations', signal),
      fetchJson<ChannelsResponse>('/api/channels', signal),
      fetchPrediction(signal),
    ]);

    const link = mapLinkState(status);
    const detail = status.detail || observations.message || channels.message || ESP32_LINK_LABEL[link];

    if (observations.status !== 'ok' || observations.timestamp == null) {
      return { ok: true, link, detail, scan: null, prediction };
    }

    const scan = mapSuccessfulScan(observations);
    if (!scan) {
      return {
        ok: true,
        link,
        detail: 'The ESP32 response did not include a usable scan timestamp.',
        scan: null,
        prediction,
      };
    }

    return { ok: true, link, detail, scan, prediction };
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    return {
      ok: false,
      link: 'unavailable',
      detail: 'The ESP32 API is not reachable. The last measured scan stays on screen, and simulation is not substituted.',
      scan: null,
      prediction: PREDICTION_UNAVAILABLE,
    };
  }
}

function mapLinkState(status: StatusResponse): Esp32LinkState {
  if (!status.esp32Connected) {
    return 'disconnected';
  }
  if (status.observationState === 'waiting') {
    return 'waiting';
  }
  if (status.observationState === 'fresh') {
    return 'fresh';
  }
  return 'stale';
}

function mapSuccessfulScan(observations: ObservationsResponse): Esp32ScanSnapshot | null {
  const timestamp = Date.parse(observations.timestamp ?? '');
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const scanId = observations.scanId ?? 'unidentified';
  const observationsMapped: RawWiFiObservation[] = [];

  observations.networks.forEach((network, index) => {
    const mapped = mapNetwork(network, scanId, timestamp, index);
    if (mapped) {
      observationsMapped.push(mapped);
    }
  });

  const batch: RawScanBatch = {
    batchId: `esp32-${scanId}`,
    timestamp,
    scanDurationMs: null,
    sensorId: 'ESP32-COM4',
    observations: observationsMapped,
    source: 'ESP32_HARDWARE',
  };

  const derived = processRawObservations(observationsMapped, batch.batchId, timestamp);
  derived.classificationRationale = [
    ...derived.classificationRationale,
    'Channel recommendation is a deterministic heuristic from measured occupancy, RSSI, and 2.4 GHz overlap. It is not a trained or deployed machine-learning model, and it does not control the router.',
  ];

  return {
    key: `${scanId}|${observations.timestamp}`,
    batch,
    derived,
  };
}

function mapNetwork(
  network: NetworkObservation,
  scanId: number | string,
  timestamp: number,
  index: number
): RawWiFiObservation | null {
  if (!Number.isFinite(network.rssi) || !Number.isFinite(network.channel)) {
    return null;
  }
  if (typeof network.bssid !== 'string' || network.bssid.trim() === '') {
    return null;
  }

  const bssid = network.bssid.trim().toUpperCase();
  const ssid = typeof network.ssid === 'string' ? network.ssid : '';
  const bssidKey = bssid.replace(/[^A-Z0-9]/g, '');

  return {
    id: `esp32-${scanId}-${bssidKey}-${index}`,
    timestamp,
    ssid,
    bssid,
    rssi: network.rssi,
    channel: network.channel,
    securityType: normalizeSecurity(network.securityType),
    source: 'ESP32_HARDWARE',
  };
}

function normalizeSecurity(value: string): WiFiSecurityType {
  const token = value.trim().toUpperCase().replace(/[\s/-]+/g, '_').replace(/_+/g, '_');
  if (KNOWN_SECURITY.has(token as WiFiSecurityType)) {
    return token as WiFiSecurityType;
  }
  return 'UNKNOWN';
}

async function fetchPrediction(signal: AbortSignal): Promise<CongestionPrediction> {
  try {
    return await fetchJson<CongestionPrediction>('/api/prediction', signal);
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    return PREDICTION_UNAVAILABLE;
  }
}

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${esp32ApiBaseUrl()}${path}`, {
    method: 'GET',
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}
