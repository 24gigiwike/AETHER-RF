/**
 * Unified API Client for Ingested Scans and Simulator Interop
 */

import {
  RawScanBatch,
  DerivedAnalysis,
  SimulatorEnvironmentProfile,
} from '../types/wifi';
import { generateSimulatedScan } from './simulator';
import { processRawObservations } from './derivedParameters';

export interface ScanResponse {
  batch: RawScanBatch;
  derived: DerivedAnalysis;
}

export async function fetchLatestScan(): Promise<ScanResponse> {
  try {
    const res = await fetch('/api/scan/latest');
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fallback to local evaluation if server endpoint is inaccessible
  }

  // Local fallback
  const batch = generateSimulatedScan('MODERATE_DENSITY');
  const derived = processRawObservations(batch.observations, batch.batchId, batch.timestamp);
  return { batch, derived };
}

export async function triggerScan(
  profile: SimulatorEnvironmentProfile
): Promise<ScanResponse> {
  try {
    const res = await fetch('/api/simulator/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Local fallback
  }

  const batch = generateSimulatedScan(profile);
  const derived = processRawObservations(batch.observations, batch.batchId, batch.timestamp);
  return { batch, derived };
}

export async function fetchScanHistory(limit = 10): Promise<ScanResponse[]> {
  try {
    const res = await fetch(`/api/scan/history?limit=${limit}`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Local fallback
  }
  return [];
}
