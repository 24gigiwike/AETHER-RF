/**
 * Unified API Client for Ingested Scans and Simulator Interop
 */

import {
  RawScanBatch,
  DerivedAnalysis,
  SimulatorEnvironmentProfile,
} from '../types/wifi';
import { liveScanner } from './wifiDataSource';

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
    // Fallback to local scanner
  }

  return liveScanner.getLatestScan();
}

export async function triggerScan(
  profile?: SimulatorEnvironmentProfile
): Promise<ScanResponse> {
  if (profile) {
    liveScanner.setScenario(profile);
  }

  try {
    const res = await fetch('/api/simulator/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: profile || liveScanner.getScenario() }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Local fallback
  }

  return liveScanner.sweepScan();
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

