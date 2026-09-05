/**
 * Telecommunications Engineering Project:
 * "AI-Powered Wi-Fi Interference Detection and Adaptive Mitigation Platform Using Intelligent Wi-Fi Scanning"
 * 
 * CORE DATA CONTRACTS & INTERFACES
 * 
 * Strict architectural separation:
 * 1. RAW MEASUREMENTS: Directly obtainable from ESP32 802.11 hardware scan sweeps.
 * 2. DERIVED PARAMETERS: Mathematically calculated from raw observations.
 * 3. FUTURE PERFORMANCE PARAMETERS: Placeholders for experimental phase (packet loss, latency, throughput).
 */

/**
 * Supported 802.11 Wi-Fi Security Cipher Suites (obtained via ESP32 wifi_auth_mode_t)
 */
export type WiFiSecurityType = 
  | 'OPEN' 
  | 'WEP' 
  | 'WPA_PSK' 
  | 'WPA2_PSK' 
  | 'WPA_WPA2_PSK' 
  | 'WPA3_PSK'
  | 'WPA2_WPA3_PSK'
  | 'UNKNOWN';

/**
 * Sensor source origin flag
 */
export type DataSourceOrigin = 'SIMULATED' | 'ESP32_HARDWARE';

/**
 * SECTION 1: RAW MEASUREMENTS
 * Parameters collected directly by the physical sensor (ESP32) or the isolated simulator.
 * No calculated or fabricated values belong in this interface.
 */
export interface RawWiFiObservation {
  /** Unique observation UUID generated at ingestion */
  id: string;

  /** Timestamp in Unix Epoch milliseconds when the AP frame was captured */
  timestamp: number;

  /** Service Set Identifier (network name), can be hidden/empty string */
  ssid: string;

  /** Basic Service Set Identifier (AP MAC address, format: "XX:XX:XX:XX:XX:XX") */
  bssid: string;

  /** Received Signal Strength Indicator in decibel-milliwatts (dBm, typically -100 to -25) */
  rssi: number;

  /** Primary operating channel (Channels 1-14 in 2.4 GHz ISM band) */
  channel: number;

  /** Wi-Fi encryption authentication mode */
  securityType: WiFiSecurityType;

  /** Channel bandwidth if reported by radio PHY layer (optional raw parameter) */
  bandwidthMhz?: 20 | 40;

  /** Explicit provenance of the measurement */
  source: DataSourceOrigin;
}

/**
 * Raw Scan Batch
 * Represents one complete channel sweep across the spectrum by the sensor.
 */
export interface RawScanBatch {
  /** Unique batch identifier */
  batchId: string;

  /** Epoch timestamp of batch completion */
  timestamp: number;

  /** Duration of the channel sweep in milliseconds */
  scanDurationMs: number;

  /** Sensor identifier or MAC */
  sensorId: string;

  /** Array of raw AP observations recorded in this sweep */
  observations: RawWiFiObservation[];

  /** Provenance */
  source: DataSourceOrigin;
}

/**
 * SECTION 2: DERIVED PARAMETERS
 * Calculated mathematically by the application processing pipeline from raw observations.
 */

/**
 * Environmental Interference Severity Classification
 * Defined as: NORMAL | LOW | MEDIUM | HIGH
 */
export type InterferenceSeverity = 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Per-channel derived metrics
 */
export interface ChannelMetrics {
  channel: number;
  centerFrequencyMhz: number;

  /** Channel density: Total count of access points observed on this channel */
  apCount: number;

  /** Average RSSI (arithmetic or linear power average) of APs on this channel (dBm) */
  averageRssi: number;

  /** Strongest detected RSSI on this channel (dBm) */
  strongestRssi: number;

  /** Weakest detected RSSI on this channel (dBm) */
  weakestRssi: number;

  /** Co-Channel Interference (CCI) weight index (0.0 to 1.0) */
  coChannelScore: number;

  /** Adjacent Channel Interference (ACI) bleed from neighboring channels (0.0 to 1.0) */
  adjacentChannelScore: number;

  /** Composite congestion score for this channel (0.0 to 1.0) */
  congestionScore: number;

  /** Observed SSIDs on this channel */
  ssids: string[];
}

/**
 * Complete Derived Analysis for a scan batch
 */
export interface DerivedAnalysis {
  batchId: string;
  timestamp: number;
  totalAPsDetected: number;

  /** Per-channel breakdown for all standard 2.4 GHz channels (1-14) */
  channels: Record<number, ChannelMetrics>;

  /** Channel with highest congestion score */
  worstChannel: number;

  /** Channel with lowest congestion score (among non-overlapping channels 1, 6, 11) */
  recommendedChannel: number;

  /** Overall environment congestion index (0.0 to 1.0) */
  overallCongestionScore: number;

  /** Derived classification based on measurable metrics */
  overallSeverity: InterferenceSeverity;

  /** Explainable breakdown of factors leading to the classification */
  classificationRationale: string[];
}

/**
 * SECTION 3: FUTURE NETWORK PERFORMANCE PARAMETERS
 * Contract for experimental validation stage.
 * Defined in architecture but explicitly flagged as pending experimental implementation.
 */
export interface NetworkPerformanceMetrics {
  /** Packet loss percentage (0 - 100%) */
  packetLossPercent: number | null;

  /** Round-trip time latency in milliseconds */
  latencyMs: number | null;

  /** Measured transmission throughput in Megabits per second */
  throughputMbps: number | null;

  /** Flag indicating these are not active in Stage 1 */
  isImplemented: false;

  /** Note explaining future integration */
  statusNote: string;
}

/**
 * Simulator Environmental Profile Configuration
 */
export type SimulatorEnvironmentProfile = 
  | 'LOW_DENSITY' 
  | 'MODERATE_DENSITY' 
  | 'HIGH_CONGESTION' 
  | 'ADJACENT_INTERFERENCE' 
  | 'OFFICE_PEAK';

export interface SimulatorConfig {
  profile: SimulatorEnvironmentProfile;
  autoScanIntervalMs: number;
  isAutoScanning: boolean;
  rssiNoiseStdDev: number; // Small variance in dBm between scans
}
