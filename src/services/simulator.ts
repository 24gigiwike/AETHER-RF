/**
 * Isolated Wi-Fi Scanner Simulator Module
 * 
 * Generates realistic 802.11 scan sweeps conforming strictly to the `RawScanBatch`
 * and `RawWiFiObservation` interfaces.
 * 
 * IMPORTANT:
 * - This module is strictly isolated from core domain logic.
 * - Every observation is explicitly tagged with `source: 'SIMULATED'`.
 * - Models real-world RF physical properties: RSSI multipath fading jitter,
 *   IEEE 802.11 channel distributions, and vendor OUI MAC addresses.
 */

import {
  RawScanBatch,
  RawWiFiObservation,
  SimulatorEnvironmentProfile,
  WiFiSecurityType,
} from '../types/wifi';

interface TemplateAP {
  ssid: string;
  bssid: string;
  baseRssi: number;
  channel: number;
  securityType: WiFiSecurityType;
}

// Preset environment templates representing real university / residential / lab topologies
const SIMULATION_PROFILES: Record<SimulatorEnvironmentProfile, TemplateAP[]> = {
  LOW_DENSITY: [
    { ssid: 'University-Quiet-Lab', bssid: '24:A4:3C:11:42:01', baseRssi: -58, channel: 1, securityType: 'WPA2_PSK' },
    { ssid: 'Campus-Guest', bssid: '24:A4:3C:11:42:02', baseRssi: -64, channel: 6, securityType: 'OPEN' },
    { ssid: 'Research-Annex', bssid: '70:4F:57:89:12:30', baseRssi: -79, channel: 11, securityType: 'WPA3_PSK' },
  ],

  MODERATE_DENSITY: [
    { ssid: 'Department_Main', bssid: '58:D9:D5:20:10:01', baseRssi: -52, channel: 1, securityType: 'WPA2_PSK' },
    { ssid: 'Faculty_5G_Fallback', bssid: '58:D9:D5:20:10:02', baseRssi: -61, channel: 1, securityType: 'WPA2_PSK' },
    { ssid: 'Lab_Workstation_Net', bssid: '00:1A:2B:3C:4D:5E', baseRssi: -72, channel: 1, securityType: 'WPA_PSK' },
    { ssid: 'EDUROAM', bssid: '00:11:22:33:44:55', baseRssi: -48, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'Campus-IoT-Gateway', bssid: '00:11:22:33:44:56', baseRssi: -75, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'Prof_Personal_AP', bssid: '94:10:3B:88:99:AA', baseRssi: -66, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'Auditorium_North', bssid: 'AC:84:C6:12:34:01', baseRssi: -68, channel: 11, securityType: 'WPA2_PSK' },
    { ssid: 'Library_Public', bssid: 'AC:84:C6:12:34:02', baseRssi: -79, channel: 11, securityType: 'OPEN' },
    { ssid: 'Printer_Direct_HP', bssid: '10:BF:48:FA:CE:01', baseRssi: -83, channel: 11, securityType: 'WPA2_PSK' },
  ],

  HIGH_CONGESTION: [
    // Heavy contention on Channel 6 (Dormitory / crowded event center scenario)
    { ssid: 'Dorm_A_Router', bssid: '30:23:03:01:00:10', baseRssi: -42, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'Student_Room_104', bssid: '30:23:03:01:00:11', baseRssi: -49, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'Gamers_Den_2.4G', bssid: 'A0:04:60:FE:ED:01', baseRssi: -53, channel: 6, securityType: 'WPA3_PSK' },
    { ssid: 'TP-Link_Extender_6', bssid: '50:C7:BF:33:11:AA', baseRssi: -58, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'Netgear_Home_9', bssid: 'E0:91:F5:2A:4B:01', baseRssi: -63, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'Smart_TV_LivingRoom', bssid: '20:DF:B9:87:65:43', baseRssi: -71, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'EDUROAM', bssid: '00:11:22:99:88:77', baseRssi: -55, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'Hidden_Security_Cam', bssid: 'B4:EE:2F:10:20:30', baseRssi: -77, channel: 6, securityType: 'WPA_PSK' },
    // Also congestion on Channel 1
    { ssid: 'Campus_Zone_1', bssid: '44:94:FC:11:22:33', baseRssi: -47, channel: 1, securityType: 'WPA2_PSK' },
    { ssid: 'Dorm_West_Hall', bssid: '44:94:FC:11:22:34', baseRssi: -56, channel: 1, securityType: 'WPA2_PSK' },
    { ssid: 'StudyGroup_Hotspot', bssid: 'FC:EC:DA:90:80:70', baseRssi: -69, channel: 1, securityType: 'WPA2_PSK' },
    { ssid: 'Dorm_Printer_Canon', bssid: '08:00:27:54:32:10', baseRssi: -82, channel: 1, securityType: 'WPA2_PSK' },
    // Crowding on Channel 11
    { ssid: 'Campus_Zone_11', bssid: '80:2A:A8:44:55:66', baseRssi: -51, channel: 11, securityType: 'WPA2_PSK' },
    { ssid: 'Admin_Staff_Only', bssid: '80:2A:A8:44:55:67', baseRssi: -60, channel: 11, securityType: 'WPA3_PSK' },
    { ssid: 'Guest_Registration', bssid: '80:2A:A8:44:55:68', baseRssi: -74, channel: 11, securityType: 'OPEN' },
    { ssid: 'VendingMachine_IoT', bssid: '18:66:DA:01:02:03', baseRssi: -85, channel: 11, securityType: 'WPA2_PSK' },
  ],

  ADJACENT_INTERFERENCE: [
    // Non-standard channel configuration (users setting APs to ch 2, 3, 4, 8, 9)
    // Causes destructive spectral overlap with non-overlapping channels 1, 6, 11
    { ssid: 'Misconfigured_AP_Ch2', bssid: 'D8:07:B6:02:02:02', baseRssi: -48, channel: 2, securityType: 'WPA2_PSK' },
    { ssid: 'Unregulated_Bridge_Ch3', bssid: 'D8:07:B6:03:03:03', baseRssi: -54, channel: 3, securityType: 'WPA2_PSK' },
    { ssid: 'Office_Ch4_Rogue', bssid: 'BC:F6:85:04:04:04', baseRssi: -59, channel: 4, securityType: 'WPA2_PSK' },
    { ssid: 'EDUROAM_Primary', bssid: '00:11:22:01:01:01', baseRssi: -51, channel: 1, securityType: 'WPA2_PSK' },
    { ssid: 'Hostel_Hallway_Ch7', bssid: '60:38:E0:07:07:07', baseRssi: -55, channel: 7, securityType: 'WPA2_PSK' },
    { ssid: 'AdHoc_Lab_Ch8', bssid: '60:38:E0:08:08:08', baseRssi: -62, channel: 8, securityType: 'WPA_PSK' },
    { ssid: 'EDUROAM_Branch', bssid: '00:11:22:06:06:06', baseRssi: -56, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'Library_Clean_Ch11', bssid: '74:83:C2:11:11:11', baseRssi: -50, channel: 11, securityType: 'WPA2_PSK' },
  ],

  OFFICE_PEAK: [
    { ssid: 'Corporate-CorpNet', bssid: '00:26:99:A1:00:01', baseRssi: -45, channel: 1, securityType: 'WPA3_PSK' },
    { ssid: 'Corporate-Voice', bssid: '00:26:99:A1:00:02', baseRssi: -46, channel: 1, securityType: 'WPA2_PSK' },
    { ssid: 'Corporate-Guest', bssid: '00:26:99:A1:00:03', baseRssi: -58, channel: 1, securityType: 'OPEN' },
    { ssid: 'Conference_Room_Center', bssid: '40:8D:5C:B2:00:10', baseRssi: -44, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'Engineering_Sensors', bssid: '40:8D:5C:B2:00:11', baseRssi: -67, channel: 6, securityType: 'WPA2_PSK' },
    { ssid: 'Operations_Floor_Ch11', bssid: '88:DE:A9:C3:00:20', baseRssi: -52, channel: 11, securityType: 'WPA2_PSK' },
    { ssid: 'HVAC_Building_Monitor', bssid: '88:DE:A9:C3:00:21', baseRssi: -78, channel: 11, securityType: 'WPA_PSK' },
  ],
};

/**
 * Generate a random Gaussian noise component for realistic RF RSSI fluctuations
 * Box-Muller transform
 */
function randomGaussian(mean = 0, stdev = 1.8): number {
  const u1 = Math.random() || 0.0001;
  const u2 = Math.random() || 0.0001;
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z0 * stdev;
}

let scanSequenceCounter = 1;

/**
 * Generate a complete simulated Wi-Fi scan sweep
 * Conforms precisely to real ESP32 hardware output
 */
export function generateSimulatedScan(
  profile: SimulatorEnvironmentProfile = 'MODERATE_DENSITY'
): RawScanBatch {
  const templates = SIMULATION_PROFILES[profile] || SIMULATION_PROFILES.MODERATE_DENSITY;
  const timestamp = Date.now();
  const batchId = `sim-batch-${Date.now()}-${scanSequenceCounter++}`;

  // Approximate realistic ESP32 passive/active sweep duration (about 1200ms - 2400ms)
  const scanDurationMs = 1500 + Math.floor(Math.random() * 400);

  const observations: RawWiFiObservation[] = templates.map((ap, index) => {
    // Add RF path jitter to RSSI
    const jitter = randomGaussian(0, 1.8);
    const simulatedRssi = Math.round(Math.max(-95, Math.min(-28, ap.baseRssi + jitter)));

    return {
      id: `sim-obs-${timestamp}-${index}`,
      timestamp,
      ssid: ap.ssid,
      bssid: ap.bssid,
      rssi: simulatedRssi,
      channel: ap.channel,
      securityType: ap.securityType,
      bandwidthMhz: 20,
      source: 'SIMULATED',
    };
  });

  return {
    batchId,
    timestamp,
    scanDurationMs,
    sensorId: 'ESP32-SIMULATOR-NODE-01',
    observations,
    source: 'SIMULATED',
  };
}
