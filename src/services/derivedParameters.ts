/**
 * Telecommunications Engineering Calculation Engine:
 * Derived Parameter Processing & Spectral Analysis
 * 
 * Computes:
 * 1. Channel Density (AP counts per channel)
 * 2. Average RSSI (Linear power average & arithmetic mean in dBm)
 * 3. Strongest and Weakest RSSI per channel
 * 4. Co-Channel Interference (CCI) and Adjacent Channel Interference (ACI)
 * 5. Composite Channel Congestion Score (0.0 - 1.0)
 * 6. Deterministic Baseline Interference Severity (NORMAL, LOW, MEDIUM, HIGH)
 * 
 * NOTE: This is the transparent baseline analytical engine. In future project phases,
 * an empirical scikit-learn ML classifier will augment/validate these derived scores.
 */

import {
  RawWiFiObservation,
  ChannelMetrics,
  DerivedAnalysis,
  InterferenceSeverity,
} from '../types/wifi';

/**
 * 2.4 GHz Wi-Fi Channel Center Frequencies (MHz)
 * 802.11b/g/n standard carrier frequencies
 */
export const CHANNEL_CENTER_FREQS: Record<number, number> = {
  1: 2412,
  2: 2417,
  3: 2422,
  4: 2427,
  5: 2432,
  6: 2437,
  7: 2442,
  8: 2447,
  9: 2452,
  10: 2457,
  11: 2462,
  12: 2467,
  13: 2472,
  14: 2484,
};

/**
 * 802.11 20 MHz Spectral Overlap Matrix
 * For 2.4 GHz channels with 5 MHz separation and 20 MHz spectral mask:
 * |Δchannel| = 0: 1.00 (Co-channel)
 * |Δchannel| = 1: 0.82 (Adjacent channel heavy overlap)
 * |Δchannel| = 2: 0.58
 * |Δchannel| = 3: 0.32
 * |Δchannel| = 4: 0.12
 * |Δchannel| >= 5: 0.00 (Orthogonal / non-overlapping)
 */
export function getSpectralOverlapFactor(chA: number, chB: number): number {
  if (chA === 14 || chB === 14) {
    // Channel 14 has special 12 MHz separation from 13
    return chA === chB ? 1.0 : 0.0;
  }
  const delta = Math.abs(chA - chB);
  switch (delta) {
    case 0: return 1.0;
    case 1: return 0.82;
    case 2: return 0.58;
    case 3: return 0.32;
    case 4: return 0.12;
    default: return 0.0;
  }
}

/**
 * Convert dBm to linear power in milliwatts (mW)
 */
export function dbmToMw(dbm: number): number {
  return Math.pow(10, dbm / 10);
}

/**
 * Convert linear power in milliwatts (mW) back to dBm
 */
export function mwToDbm(mw: number): number {
  if (mw <= 0) return -100;
  return 10 * Math.log10(mw);
}

/**
 * Calculate RF linear average RSSI for a list of dBm readings
 */
export function calculateAverageRssi(rssiList: number[]): number {
  if (rssiList.length === 0) return -100;
  const totalMw = rssiList.reduce((sum, val) => sum + dbmToMw(val), 0);
  const avgMw = totalMw / rssiList.length;
  return Math.round(mwToDbm(avgMw) * 10) / 10;
}

/**
 * Normalize an RSSI reading to a 0.0 - 1.0 scale
 * -100 dBm (noise floor) -> 0.0
 * -30 dBm (very strong proximity) -> 1.0
 */
export function normalizeRssi(rssi: number): number {
  const minRssi = -100;
  const maxRssi = -30;
  const clamped = Math.max(minRssi, Math.min(maxRssi, rssi));
  return (clamped - minRssi) / (maxRssi - minRssi);
}

/**
 * Core Processing Function:
 * Transforms a raw observation array into complete derived parameters
 */
export function processRawObservations(
  observations: RawWiFiObservation[],
  batchId: string,
  timestamp: number
): DerivedAnalysis {
  // 1. Group observations by channel (Channels 1 through 13)
  const channelBuckets: Record<number, RawWiFiObservation[]> = {};
  for (let ch = 1; ch <= 13; ch++) {
    channelBuckets[ch] = [];
  }

  for (const obs of observations) {
    if (obs.channel >= 1 && obs.channel <= 13) {
      channelBuckets[obs.channel].push(obs);
    }
  }

  // 2. Compute per-channel primary metrics
  const channelMetricsMap: Record<number, ChannelMetrics> = {};

  for (let ch = 1; ch <= 13; ch++) {
    const apList = channelBuckets[ch];
    const apCount = apList.length;
    const rssiValues = apList.map((o) => o.rssi);

    let avgRssi = -100;
    let strongestRssi = -100;
    let weakestRssi = -100;

    if (apCount > 0) {
      avgRssi = calculateAverageRssi(rssiValues);
      strongestRssi = Math.max(...rssiValues);
      weakestRssi = Math.min(...rssiValues);
    }

    // Co-channel interference index calculation:
    // Combines count of contending APs with normalized power of the strongest/average AP
    // Weight = count / 10 + normalized RSSI * 0.5
    const normalizedPower = apCount > 0 ? normalizeRssi(avgRssi) : 0;
    const densityFactor = Math.min(1.0, apCount / 6.0);
    const coChannelScore = Math.min(1.0, 0.5 * densityFactor + 0.5 * normalizedPower);

    channelMetricsMap[ch] = {
      channel: ch,
      centerFrequencyMhz: CHANNEL_CENTER_FREQS[ch] || 2400 + ch * 5,
      apCount,
      averageRssi: avgRssi,
      strongestRssi,
      weakestRssi,
      coChannelScore: Math.round(coChannelScore * 100) / 100,
      adjacentChannelScore: 0, // Will compute in spectral bleed pass
      congestionScore: 0,      // Will combine co-channel and adjacent
      ssids: apList.map((o) => o.ssid || '<Hidden SSID>'),
    };
  }

  // 3. Spectral Bleed Pass: Calculate Adjacent Channel Interference (ACI)
  for (let targetCh = 1; targetCh <= 13; targetCh++) {
    let adjacentBleedSum = 0;
    for (let otherCh = 1; otherCh <= 13; otherCh++) {
      if (targetCh !== otherCh) {
        const overlap = getSpectralOverlapFactor(targetCh, otherCh);
        if (overlap > 0) {
          const otherCoScore = channelMetricsMap[otherCh].coChannelScore;
          adjacentBleedSum += otherCoScore * overlap * 0.45;
        }
      }
    }

    const aciScore = Math.min(1.0, adjacentBleedSum);
    channelMetricsMap[targetCh].adjacentChannelScore = Math.round(aciScore * 100) / 100;

    // Composite Congestion Score: 70% Co-channel + 30% Adjacent spectral bleed
    const composite = 
      channelMetricsMap[targetCh].coChannelScore * 0.70 + 
      channelMetricsMap[targetCh].adjacentChannelScore * 0.30;

    channelMetricsMap[targetCh].congestionScore = Math.min(1.0, Math.round(composite * 100) / 100);
  }

  // 4. Determine Worst and Recommended Channels
  // Standard 2.4 GHz non-overlapping channels are 1, 6, 11
  const standardChannels = [1, 6, 11];
  let recommendedChannel = 1;
  let lowestScore = Infinity;

  for (const ch of standardChannels) {
    const score = channelMetricsMap[ch].congestionScore;
    if (score < lowestScore) {
      lowestScore = score;
      recommendedChannel = ch;
    }
  }

  // Find worst channel across all 1-13
  let worstChannel = 1;
  let highestScore = -1;
  let overallScoreSum = 0;

  for (let ch = 1; ch <= 13; ch++) {
    const score = channelMetricsMap[ch].congestionScore;
    overallScoreSum += score;
    if (score > highestScore) {
      highestScore = score;
      worstChannel = ch;
    }
  }

  const overallCongestionScore = Math.min(1.0, Math.round((overallScoreSum / 13) * 1.8 * 100) / 100);

  // 5. Environmental Severity Classification
  let overallSeverity: InterferenceSeverity = 'NORMAL';
  const rationale: string[] = [];

  if (highestScore >= 0.75 || observations.length >= 18) {
    overallSeverity = 'HIGH';
    rationale.push(`Critical congestion detected: Channel ${worstChannel} score is ${(highestScore * 100).toFixed(0)}%.`);
    rationale.push(`High network density with ${observations.length} competing APs detected in vicinity.`);
  } else if (highestScore >= 0.50 || observations.length >= 10) {
    overallSeverity = 'MEDIUM';
    rationale.push(`Moderate channel utilization with peak congestion on Channel ${worstChannel}.`);
    rationale.push(`${observations.length} active BSSIDs detected across the 2.4 GHz spectrum.`);
  } else if (highestScore >= 0.25 || observations.length >= 4) {
    overallSeverity = 'LOW';
    rationale.push(`Low-density environment with minimal co-channel contention.`);
    rationale.push(`Clean spectrum headroom observed on recommended Channel ${recommendedChannel}.`);
  } else {
    overallSeverity = 'NORMAL';
    rationale.push(`Clean RF environment with minimal detected AP interference.`);
    rationale.push(`Ideal propagation conditions across primary channels.`);
  }

  return {
    batchId,
    timestamp,
    totalAPsDetected: observations.length,
    channels: channelMetricsMap,
    worstChannel,
    recommendedChannel,
    overallCongestionScore,
    overallSeverity,
    classificationRationale: rationale,
  };
}
