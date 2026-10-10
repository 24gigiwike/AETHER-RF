import React from 'react';
import {
  Radio,
  RefreshCw,
  Sliders,
  Layers,
  Sparkles,
  Signal,
  CheckCircle,
  Clock,
  Eye,
} from 'lucide-react';
import { DashboardDataSource, Esp32LinkState, SimulatorEnvironmentProfile } from '../types/wifi';
import { ESP32_LINK_LABEL } from '../services/esp32Api';

interface ScannerControlsProps {
  dataSource: DashboardDataSource;
  onDataSourceChange: (source: DashboardDataSource) => void;
  linkState: Esp32LinkState;
  linkDetail: string;
  currentProfile: SimulatorEnvironmentProfile;
  onProfileChange: (profile: SimulatorEnvironmentProfile) => void;
  onTriggerScan: () => void;
  isScanning: boolean;
  autoScan: boolean;
  onToggleAutoScan: () => void;
  scanIntervalSec: number;
  onIntervalChange: (sec: number) => void;
  scanCount: number;
  lastScanTimeMs: number;
  detectedCount: number;
  activeChannelsCount: number;
  strongestRssi: number | null;
  interferenceSeverity: string;
  congestionScorePct: number;
  recommendedChannel: number;
}

function hardwareBannerDetail(linkState: Esp32LinkState, scanCount: number, elapsedSec: number): string {
  if (linkState === 'waiting') {
    return 'The ESP32 is connected. Waiting for the first measured scan. Simulation data is not being substituted.';
  }
  if (linkState === 'unavailable') {
    return 'FastAPI is not reachable. The last ESP32 scan, if any, stays on screen. Choose Simulation to use the emulator.';
  }
  if (linkState === 'disconnected') {
    return scanCount === 0
      ? 'The serial link is down and no ESP32 scan has been stored. Simulation is available from the data-source control.'
      : `Serial link down. Showing the last measured scan from ${elapsedSec}s ago. This is not a new sweep.`;
  }
  if (linkState === 'stale') {
    return `The ESP32 is connected, but the stored scan is stale (${elapsedSec}s old). No new sweep is being claimed.`;
  }
  return scanCount === 0
    ? 'Polling FastAPI every 4 seconds for a new ESP32 scan.'
    : `Measured scan #${scanCount} • Last hardware scan ${elapsedSec === 0 ? 'just now' : `${elapsedSec}s ago`} • Same scan is not counted twice.`;
}

const ENVIRONMENT_PROFILES: Record<
  SimulatorEnvironmentProfile,
  { label: string; badge: string; description: string; expectedCongestion: string }
> = {
  MODERATE_DENSITY: {
    label: 'Standard Dynamic Environment',
    badge: 'Faculty / Laboratory',
    description: 'Realistic balance of enterprise APs, personal hotspots, and IoT beacons with active RF drift.',
    expectedCongestion: 'Low / Moderate Contention',
  },
  LOW_DENSITY: {
    label: 'Low Activity Scenario',
    badge: 'Clean RF Spectrum',
    description: 'Minimal access points strictly deployed across channels 1, 6, 11 with minimal packet collision.',
    expectedCongestion: 'Optimal / Low Severity',
  },
  HIGH_CONGESTION: {
    label: 'High Activity / Congestion Scenario',
    badge: 'Heavy Contention',
    description: '15+ competing access points concentrated on Channel 6 and Channel 1 causing severe Co-Channel Contention (CCI).',
    expectedCongestion: 'Critical / High Severity',
  },
  ADJACENT_INTERFERENCE: {
    label: 'Adjacent Channel Overlap Scenario',
    badge: 'Spectral Splatter',
    description: 'Misconfigured rogue transmitters on channels 2, 3, 4, 8 bleeding energy into adjacent channels.',
    expectedCongestion: 'Moderate / Severe ACI',
  },
  OFFICE_PEAK: {
    label: 'High-Density Campus Peak',
    badge: 'Multi-SSID Beacon Burst',
    description: 'Multiple virtual SSIDs broadcast from shared radios during peak campus usage hours.',
    expectedCongestion: 'Moderate Contention',
  },
};

export const ScannerControls: React.FC<ScannerControlsProps> = ({
  dataSource,
  onDataSourceChange,
  linkState,
  linkDetail,
  currentProfile,
  onProfileChange,
  onTriggerScan,
  isScanning,
  autoScan,
  onToggleAutoScan,
  scanIntervalSec,
  onIntervalChange,
  scanCount,
  lastScanTimeMs,
  detectedCount,
  activeChannelsCount,
  strongestRssi,
  interferenceSeverity,
  congestionScorePct,
  recommendedChannel,
}) => {
  const hardwareMode = dataSource === 'esp32';
  const profileInfo = ENVIRONMENT_PROFILES[currentProfile] || ENVIRONMENT_PROFILES.MODERATE_DENSITY;
  const hardwareQuiet = hardwareMode && linkState !== 'fresh';
  const statusWord = hardwareMode
    ? ESP32_LINK_LABEL[linkState]
    : isScanning
      ? 'SCANNING'
      : 'ACTIVE';

  // Format relative seconds
  const [elapsedSec, setElapsedSec] = React.useState(0);
  React.useEffect(() => {
    const calc = () => {
      if (!lastScanTimeMs) return 0;
      return Math.max(0, Math.round((Date.now() - lastScanTimeMs) / 1000));
    };
    setElapsedSec(calc());
    const interval = setInterval(() => setElapsedSec(calc()), 1000);
    return () => clearInterval(interval);
  }, [lastScanTimeMs]);

  return (
    <section id="live-scanner-dashboard-panel" className="bg-white border border-[#141414] p-3.5 space-y-3 font-mono">
      <div className="flex flex-col gap-2 border border-[#141414] bg-neutral-50 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider font-bold text-[#141414]">Data source</span>
          <button
            id="btn-source-esp32"
            type="button"
            onClick={() => onDataSourceChange('esp32')}
            className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold border border-[#141414] cursor-pointer ${
              hardwareMode ? 'bg-[#141414] text-white' : 'bg-white text-[#141414] hover:bg-neutral-100'
            }`}
          >
            ESP32 Live
          </button>
          <button
            id="btn-source-simulation"
            type="button"
            onClick={() => onDataSourceChange('simulation')}
            className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold border border-[#141414] cursor-pointer ${
              hardwareMode ? 'bg-white text-[#141414] hover:bg-neutral-100' : 'bg-[#141414] text-white'
            }`}
          >
            Simulation
          </button>
        </div>
        <p id="esp32-link-status" className="text-[10px] uppercase tracking-wide text-[#141414]">
          {hardwareMode ? (
            <>
              <span className="font-bold">{ESP32_LINK_LABEL[linkState]}</span>
              <span className="text-neutral-600"> — {linkDetail}</span>
            </>
          ) : (
            <span className="font-bold">Simulation — local RF emulator, separate from ESP32 history</span>
          )}
        </p>
      </div>

      {/* Dynamic Live Banner with Animated Scanning Radar Indicator */}
      <div className={`p-3 border border-[#141414] transition-all duration-300 ${
        isScanning ? 'bg-amber-50 border-amber-600' : 'bg-neutral-900 text-white border-black'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Visual Radar / Pulse Animation */}
            <div className="relative flex items-center justify-center w-10 h-10 border border-white/20 bg-black/40 shrink-0">
              {isScanning ? (
                <>
                  <span className="absolute inset-0 rounded-full border border-amber-500 animate-ping opacity-75"></span>
                  <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <Signal className="w-5 h-5 text-emerald-400 absolute" />
                </>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 border ${
                  isScanning
                    ? 'bg-amber-600 text-white border-amber-700'
                    : hardwareQuiet
                      ? 'bg-amber-700 text-white border-amber-800'
                      : 'bg-emerald-600 text-white border-emerald-700'
                }`}>
                  {isScanning ? 'SWEEPING SPECTRUM' : hardwareMode ? 'ESP32 LINK' : 'MONITOR ACTIVE'}
                </span>
                <span className={`text-xs font-bold uppercase tracking-tight ${
                  isScanning ? 'text-amber-900' : 'text-neutral-200'
                }`}>
                  {isScanning
                    ? 'Scanning Nearby Wi-Fi Networks...'
                    : hardwareMode
                      ? `${ESP32_LINK_LABEL[linkState]} — ${detectedCount} measured networks`
                      : `Scan Complete — ${detectedCount} Networks Detected`}
                </span>
              </div>
              <p className={`text-[11px] mt-0.5 ${isScanning ? 'text-amber-800' : 'text-neutral-400'}`}>
                {isScanning
                  ? 'Listening for IEEE 802.11 beacon frames across 2.4 GHz channels 1–13...'
                  : hardwareMode
                    ? hardwareBannerDetail(linkState, scanCount, elapsedSec)
                    : `Cycle #${scanCount} finished • Next automated sweep queued in ~${scanIntervalSec}s • Last scan: ${elapsedSec === 0 ? 'just now' : `${elapsedSec}s ago`}`}
              </p>
            </div>
          </div>

          {/* Quick Real-Time Telemetry Pills */}
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <div className={`px-2.5 py-1 border ${
              isScanning ? 'bg-white border-amber-400 text-amber-900' : 'bg-white/10 border-white/20 text-neutral-200'
            }`}>
              <span className="opacity-60">STATUS: </span>
              <span className="font-bold">{statusWord}</span>
            </div>
            <div className={`px-2.5 py-1 border ${
              isScanning ? 'bg-white border-amber-400 text-amber-900' : 'bg-white/10 border-white/20 text-neutral-200'
            }`}>
              <span className="opacity-60">APs: </span>
              <span className="font-bold">{detectedCount}</span>
            </div>
            <div className={`px-2.5 py-1 border ${
              isScanning ? 'bg-white border-amber-400 text-amber-900' : 'bg-white/10 border-white/20 text-neutral-200'
            }`}>
              <span className="opacity-60">CHANNELS: </span>
              <span className="font-bold">{activeChannelsCount} Active</span>
            </div>
            <div className={`px-2.5 py-1 border ${
              isScanning ? 'bg-white border-amber-400 text-amber-900' : 'bg-white/10 border-white/20 text-neutral-200'
            }`}>
              <span className="opacity-60">PEAK RSSI: </span>
              <span className="font-bold text-emerald-400">{strongestRssi == null ? '—' : `${strongestRssi} dBm`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Grid: Scan Mode, Interval, Scenario Preset */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-1">
        {/* Environment / Scenario Switcher (Low Activity vs High Activity etc.) */}
        <div className="md:col-span-6 space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="select-env-scenario" className="text-[11px] uppercase tracking-wider font-bold text-[#141414]">
              RF Environment Scenario:
            </label>
            <span className="text-[10px] text-neutral-500 font-bold">
              {profileInfo.badge}
            </span>
          </div>
          <select
            id="select-env-scenario"
            value={currentProfile}
            disabled={hardwareMode}
            onChange={(e) => onProfileChange(e.target.value as SimulatorEnvironmentProfile)}
            className="w-full text-xs bg-white hover:bg-neutral-50 border border-[#141414] px-2.5 py-1.5 text-[#141414] focus:outline-none focus:ring-1 focus:ring-[#141414] cursor-pointer disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            {Object.entries(ENVIRONMENT_PROFILES).map(([key, info]) => (
              <option key={key} value={key}>
                {info.label} — [{info.badge}]
              </option>
            ))}
          </select>
          <p className="text-[10px] text-neutral-600 truncate">
            {hardwareMode
              ? 'Scenario presets stay with Simulation and do not alter ESP32 measurements.'
              : profileInfo.description}
          </p>
        </div>

        {/* Cadence Interval */}
        <div className="md:col-span-3 flex items-center gap-2">
          <div className="space-y-1 flex-1">
            <label htmlFor="select-scan-cadence" className="block text-[11px] uppercase tracking-wider font-bold text-[#141414]">
              Cycle Cadence:
            </label>
            <select
              id="select-scan-cadence"
              value={hardwareMode ? 4 : scanIntervalSec}
              disabled={hardwareMode}
              onChange={(e) => onIntervalChange(Number(e.target.value))}
              className="w-full text-xs bg-white border border-[#141414] px-2 py-1.5 text-[#141414] cursor-pointer disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
            >
              <option value={3}>3 Seconds (Fast)</option>
              <option value={4}>4 Seconds (Standard)</option>
              <option value={6}>6 Seconds (Conserve)</option>
            </select>
          </div>

          {/* Auto Scan Toggle */}
          <div className="space-y-1">
            <span className="block text-[11px] uppercase tracking-wider font-bold text-[#141414]">Auto Scan</span>
            <button
              id="btn-toggle-auto-scan"
              onClick={onToggleAutoScan}
              disabled={hardwareMode}
              className={`h-[31px] px-3 text-[10px] uppercase font-bold tracking-wider border border-[#141414] flex items-center gap-1.5 cursor-pointer transition-colors disabled:cursor-not-allowed ${
                hardwareMode
                  ? 'bg-emerald-700 text-white'
                  : autoScan
                    ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                    : 'bg-white text-[#141414] hover:bg-neutral-100'
              }`}
              title={hardwareMode ? 'ESP32 live mode polls FastAPI every 4 seconds' : autoScan ? 'Click to Pause Continuous Scanning' : 'Click to Enable Continuous Auto-Scanning'}
            >
              <RefreshCw className={`w-3 h-3 ${!hardwareMode && autoScan ? 'animate-spin' : ''}`} />
              <span>{hardwareMode ? '4s Poll' : autoScan ? 'Active' : 'Paused'}</span>
            </button>
          </div>
        </div>

        {/* Immediate Scan Trigger */}
        <div className="md:col-span-3 flex justify-end">
          <button
            id="btn-trigger-hardware-sweep"
            onClick={onTriggerScan}
            disabled={isScanning}
            className="w-full h-[31px] flex items-center justify-center gap-2 px-3 text-[10px] uppercase tracking-widest font-bold bg-[#141414] hover:bg-[#2c2c2c] disabled:bg-neutral-300 disabled:text-neutral-500 text-white transition-colors cursor-pointer disabled:cursor-not-allowed border border-[#141414]"
          >
            <Signal className={`w-3.5 h-3.5 ${isScanning ? 'animate-bounce text-amber-400' : 'text-emerald-400'}`} />
            <span>{isScanning ? 'Scanning...' : hardwareMode ? 'Refresh' : 'Scan Now'}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
