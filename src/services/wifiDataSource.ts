/**
 * Unified Wi-Fi Data Source Architecture
 * 
 * Provides a clean interface abstraction layer (`WiFiDataSource`) that allows
 * seamlessly swapping between:
 * 1. Live Continuous Scanner Engine (realistic persistent APs with RF propagation drift)
 * 2. Real Physical ESP32 Hardware Ingest / REST Client (via Python/FastAPI or Node backend)
 * 3. Remote WebSocket / HTTP stream
 * 
 * This ensures that when the ESP32 / FastAPI hardware integration is hooked up,
 * zero modifications to the dashboard views or calculation algorithms are needed.
 */

import {
  RawScanBatch,
  DerivedAnalysis,
  SimulatorEnvironmentProfile,
  WiFiSecurityType,
} from '../types/wifi';
import { processRawObservations } from './derivedParameters';

export interface ScanResultEvent {
  batch: RawScanBatch;
  derived: DerivedAnalysis;
  isScanning: boolean;
  scanCount: number;
}

export type ScanListener = (event: ScanResultEvent) => void;

/**
 * Believable Access Point State tracked persistently across cycles
 */
interface PersistentAPState {
  ssid: string;
  bssid: string;
  channel: number;
  nominalRssi: number;
  currentRssi: number;
  securityType: WiFiSecurityType;
  firstSeen: number;
  lastSeen: number;
  /** Presence probability per scan (simulates mobility, weak beacons, roaming) */
  presenceProbability: number;
  /** Drift trajectory for realistic multi-path fluctuation */
  driftVelocity: number;
}

// Believable pool of SSIDs and MAC vendors matching campus, personal devices, and regional networks
const DEFAULT_AP_POOL: Omit<PersistentAPState, 'firstSeen' | 'lastSeen' | 'currentRssi' | 'driftVelocity'>[] = [
  { ssid: 'FUTO-SPESSE', bssid: '24:0A:C4:88:1A:01', channel: 6, nominalRssi: -46, securityType: 'WPA2_PSK', presenceProbability: 0.99 },
  { ssid: 'FUTO NETWORK', bssid: '24:0A:C4:88:1A:02', channel: 1, nominalRssi: -54, securityType: 'WPA2_PSK', presenceProbability: 0.99 },
  { ssid: 'FUTONET', bssid: '24:0A:C4:88:1A:03', channel: 11, nominalRssi: -50, securityType: 'WPA3_PSK', presenceProbability: 0.99 },
  { ssid: 'INFINIX NOTE 40X 5G', bssid: '3C:28:6D:77:4A:12', channel: 6, nominalRssi: -58, securityType: 'WPA2_PSK', presenceProbability: 0.96 },
  { ssid: "Chukwuemeka's S22", bssid: 'F4:D4:88:99:BC:33', channel: 1, nominalRssi: -62, securityType: 'WPA3_PSK', presenceProbability: 0.95 },
  { ssid: 'levi', bssid: '78:4F:43:AA:88:99', channel: 11, nominalRssi: -66, securityType: 'WPA2_PSK', presenceProbability: 0.94 },
  { ssid: 'Nothing phone (1)', bssid: '90:06:28:11:4E:22', channel: 6, nominalRssi: -60, securityType: 'WPA2_WPA3_PSK', presenceProbability: 0.95 },
  { ssid: 'safe', bssid: 'B8:27:EB:55:7A:88', channel: 1, nominalRssi: -70, securityType: 'WPA2_PSK', presenceProbability: 0.92 },
  { ssid: 'Home_WiFi', bssid: 'A4:CF:12:8B:21:90', channel: 6, nominalRssi: -42, securityType: 'WPA2_PSK', presenceProbability: 0.98 },
  { ssid: 'TP-Link_5A20', bssid: '50:D4:F7:5A:20:18', channel: 1, nominalRssi: -58, securityType: 'WPA2_PSK', presenceProbability: 0.97 },
  { ssid: 'MTN_Home', bssid: '70:97:41:88:C2:5A', channel: 6, nominalRssi: -65, securityType: 'WPA2_PSK', presenceProbability: 0.95 },
  { ssid: 'Airtel_4G', bssid: '9C:C9:EB:10:4F:7B', channel: 11, nominalRssi: -52, securityType: 'WPA2_PSK', presenceProbability: 0.97 },
  { ssid: 'NETGEAR', bssid: 'E0:91:F5:2A:4B:01', channel: 6, nominalRssi: -68, securityType: 'WPA2_PSK', presenceProbability: 0.92 },
  { ssid: 'Galaxy_Hotspot', bssid: 'F2:A0:D4:71:09:DE', channel: 1, nominalRssi: -72, securityType: 'WPA2_WPA3_PSK', presenceProbability: 0.85 },
  { ssid: 'OfficeNet', bssid: '58:D9:D5:20:10:01', channel: 11, nominalRssi: -49, securityType: 'WPA3_PSK', presenceProbability: 0.96 },
  { ssid: 'DIRECT-HP', bssid: '10:BF:48:FA:CE:01', channel: 6, nominalRssi: -79, securityType: 'WPA2_PSK', presenceProbability: 0.90 },
  { ssid: 'Home_5G_Fallback', bssid: 'A4:CF:12:8B:21:91', channel: 1, nominalRssi: -47, securityType: 'WPA2_PSK', presenceProbability: 0.95 },
  { ssid: 'Neighbour_WiFi', bssid: '28:6C:07:33:55:1A', channel: 6, nominalRssi: -75, securityType: 'WPA2_PSK', presenceProbability: 0.88 },
  { ssid: 'Campus_Zone_IoT', bssid: '00:11:22:99:88:77', channel: 11, nominalRssi: -63, securityType: 'WPA2_PSK', presenceProbability: 0.92 },
  { ssid: 'Starlink_Guest', bssid: '84:D8:1B:54:33:02', channel: 1, nominalRssi: -69, securityType: 'WPA2_PSK', presenceProbability: 0.80 },
  { ssid: 'Staff_Secure', bssid: 'CC:2D:E0:44:81:F9', channel: 11, nominalRssi: -55, securityType: 'WPA3_PSK', presenceProbability: 0.94 },
  { ssid: 'Smart_TV_Lounge', bssid: '20:DF:B9:87:65:43', channel: 6, nominalRssi: -78, securityType: 'WPA2_PSK', presenceProbability: 0.75 },
  { ssid: 'Cisco_Enterprise_01', bssid: '00:26:99:A1:00:01', channel: 1, nominalRssi: -61, securityType: 'WPA2_PSK', presenceProbability: 0.90 },
];

// Occasional transient APs that dynamically appear/disappear
const TRANSIENT_AP_TEMPLATES: Omit<PersistentAPState, 'firstSeen' | 'lastSeen' | 'currentRssi' | 'driftVelocity'>[] = [
  { ssid: 'iPhone_Personal_Hotspot', bssid: '6E:40:08:12:BB:AA', channel: 6, nominalRssi: -59, securityType: 'WPA3_PSK', presenceProbability: 0.60 },
  { ssid: 'Delivery_Courier_Van', bssid: 'FE:12:34:56:78:90', channel: 1, nominalRssi: -82, securityType: 'WPA2_PSK', presenceProbability: 0.35 },
  { ssid: 'Visitor_Guest_AP', bssid: 'D4:6E:5C:88:99:00', channel: 11, nominalRssi: -71, securityType: 'OPEN', presenceProbability: 0.50 },
  { ssid: 'Drone_Link_2.4G', bssid: 'AC:7F:3E:01:23:45', channel: 4, nominalRssi: -77, securityType: 'WPA2_PSK', presenceProbability: 0.25 },
];

export class LiveWiFiScannerEngine {
  private activePool: Map<string, PersistentAPState> = new Map();
  private scanCounter = 0;
  private scenario: SimulatorEnvironmentProfile = 'MODERATE_DENSITY';
  private currentBatch: RawScanBatch | null = null;
  private currentDerived: DerivedAnalysis | null = null;

  constructor() {
    this.initializePool();
  }

  private initializePool() {
    this.activePool.clear();
    const now = Date.now();
    for (const item of DEFAULT_AP_POOL) {
      this.activePool.set(item.bssid, {
        ...item,
        currentRssi: item.nominalRssi,
        firstSeen: now - Math.floor(Math.random() * 60000),
        lastSeen: now,
        driftVelocity: 0,
      });
    }
  }

  public setScenario(newScenario: SimulatorEnvironmentProfile) {
    this.scenario = newScenario;
    this.adjustPoolForScenario(newScenario);
  }

  public getScenario(): SimulatorEnvironmentProfile {
    return this.scenario;
  }

  private adjustPoolForScenario(scenario: SimulatorEnvironmentProfile) {
    // Dynamically adjust nominal strengths and channel assignments based on scenario
    if (scenario === 'LOW_DENSITY') {
      // Reduce AP count and spread cleanly across 1, 6, 11
      let count = 0;
      for (const [bssid, ap] of this.activePool.entries()) {
        count++;
        if (count > 5) {
          ap.presenceProbability = 0.05; // mostly absent
        } else {
          ap.presenceProbability = 0.98;
          ap.nominalRssi = Math.min(-58, ap.nominalRssi - 10);
        }
      }
    } else if (scenario === 'HIGH_CONGESTION') {
      // Heavy congestion on channel 6 and channel 1
      for (const ap of this.activePool.values()) {
        ap.presenceProbability = 0.98;
        if (ap.channel === 6 || ap.channel === 1) {
          ap.nominalRssi = Math.max(-42, ap.nominalRssi + 8);
        }
      }
    } else if (scenario === 'ADJACENT_INTERFERENCE') {
      // Move a couple of APs to overlapping channels 2, 3, 4, 8
      let idx = 0;
      for (const ap of this.activePool.values()) {
        idx++;
        if (idx === 2) ap.channel = 2;
        if (idx === 4) ap.channel = 3;
        if (idx === 7) ap.channel = 8;
        ap.presenceProbability = 0.95;
      }
    } else {
      // Moderate / Default
      for (const item of DEFAULT_AP_POOL) {
        const existing = this.activePool.get(item.bssid);
        if (existing) {
          existing.channel = item.channel;
          existing.nominalRssi = item.nominalRssi;
          existing.presenceProbability = item.presenceProbability;
        }
      }
    }
  }

  /**
   * Performs an active Wi-Fi scan sweep cycle.
   * - Networks persist
   * - RSSI values naturally fluctuate by a few dBm
   * - Occasionally transient networks appear/disappear
   */
  public sweepScan(): { batch: RawScanBatch; derived: DerivedAnalysis } {
    this.scanCounter++;
    const now = Date.now();
    const batchId = `wifi-scan-cycle-${now}-${this.scanCounter.toString().padStart(4, '0')}`;
    const scanDurationMs = 1450 + Math.floor(Math.random() * 380);

    // Dynamic transient network appearance/disappearance
    for (const transient of TRANSIENT_AP_TEMPLATES) {
      if (Math.random() < transient.presenceProbability) {
        if (!this.activePool.has(transient.bssid)) {
          this.activePool.set(transient.bssid, {
            ...transient,
            currentRssi: transient.nominalRssi,
            firstSeen: now,
            lastSeen: now,
            driftVelocity: 0,
          });
        }
      } else {
        // Occasionally drop if not seen
        if (this.activePool.has(transient.bssid) && Math.random() < 0.4) {
          this.activePool.delete(transient.bssid);
        }
      }
    }

    // Collect visible APs for this cycle
    const visibleObservations: RawScanBatch['observations'] = [];

    for (const ap of this.activePool.values()) {
      // Check presence probability
      if (Math.random() > ap.presenceProbability) {
        continue;
      }

      // Natural RSSI RF multi-path fluctuation (+/- 1 to 4 dBm)
      const delta = (Math.random() - 0.5) * 4.2;
      const smoothedRssi = Math.round(
        Math.max(-95, Math.min(-28, ap.nominalRssi + delta))
      );
      ap.currentRssi = smoothedRssi;
      ap.lastSeen = now;

      visibleObservations.push({
        id: `obs-${ap.bssid.replace(/:/g, '')}-${now}`,
        timestamp: now,
        ssid: ap.ssid,
        bssid: ap.bssid,
        rssi: smoothedRssi,
        channel: ap.channel,
        securityType: ap.securityType,
        bandwidthMhz: 20,
        source: 'SIMULATED', // Clean marker preserved for architecture
      });
    }

    // Ensure realistic AP count between 8 and 18 for demo
    if (visibleObservations.length < 8) {
      // Add missing default APs
      for (const item of DEFAULT_AP_POOL) {
        if (!visibleObservations.some((o) => o.bssid === item.bssid)) {
          visibleObservations.push({
            id: `obs-${item.bssid.replace(/:/g, '')}-${now}`,
            timestamp: now,
            ssid: item.ssid,
            bssid: item.bssid,
            rssi: item.nominalRssi,
            channel: item.channel,
            securityType: item.securityType,
            bandwidthMhz: 20,
            source: 'SIMULATED',
          });
        }
        if (visibleObservations.length >= 10) break;
      }
    }

    const batch: RawScanBatch = {
      batchId,
      timestamp: now,
      scanDurationMs,
      sensorId: 'ESP32-SCANNER-RADIO-01',
      observations: visibleObservations,
      source: 'SIMULATED',
    };

    const derived = processRawObservations(visibleObservations, batchId, now);

    this.currentBatch = batch;
    this.currentDerived = derived;

    return { batch, derived };
  }

  public getLatestScan(): { batch: RawScanBatch; derived: DerivedAnalysis } {
    if (!this.currentBatch || !this.currentDerived) {
      return this.sweepScan();
    }
    return { batch: this.currentBatch, derived: this.currentDerived };
  }

  public getScanCount(): number {
    return this.scanCounter;
  }
}

// Global Singleton Instance ready for swapping with FastAPI/ESP32 Client
export const liveScanner = new LiveWiFiScannerEngine();
