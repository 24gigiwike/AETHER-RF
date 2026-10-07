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
import { SimulatorEnvironmentProfile } from '../types/wifi';

interface ScannerControlsProps {
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
  strongestRssi: number;
  interferenceSeverity: string;
  congestionScorePct: number;
  recommendedChannel: number;
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
  const profileInfo = ENVIRONMENT_PROFILES[currentProfile] || ENVIRONMENT_PROFILES.MODERATE_DENSITY;

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
                    : 'bg-emerald-600 text-white border-emerald-700'
                }`}>
                  {isScanning ? 'SWEEPING SPECTRUM' : 'MONITOR ACTIVE'}
                </span>
                <span className={`text-xs font-bold uppercase tracking-tight ${
                  isScanning ? 'text-amber-900' : 'text-neutral-200'
                }`}>
                  {isScanning
                    ? 'Scanning Nearby Wi-Fi Networks...'
                    : `Scan Complete — ${detectedCount} Networks Detected`}
                </span>
              </div>
              <p className={`text-[11px] mt-0.5 ${isScanning ? 'text-amber-800' : 'text-neutral-400'}`}>
                {isScanning 
                  ? 'Listening for IEEE 802.11 beacon frames across 2.4 GHz channels 1–13...'
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
              <span className="font-bold">{isScanning ? 'SCANNING' : 'ACTIVE'}</span>
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
              <span className="font-bold text-emerald-400">{strongestRssi} dBm</span>
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
            onChange={(e) => onProfileChange(e.target.value as SimulatorEnvironmentProfile)}
            className="w-full text-xs bg-white hover:bg-neutral-50 border border-[#141414] px-2.5 py-1.5 text-[#141414] focus:outline-none focus:ring-1 focus:ring-[#141414] cursor-pointer"
          >
            {Object.entries(ENVIRONMENT_PROFILES).map(([key, info]) => (
              <option key={key} value={key}>
                {info.label} — [{info.badge}]
              </option>
            ))}
          </select>
          <p className="text-[10px] text-neutral-600 truncate">
            {profileInfo.description}
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
              value={scanIntervalSec}
              onChange={(e) => onIntervalChange(Number(e.target.value))}
              className="w-full text-xs bg-white border border-[#141414] px-2 py-1.5 text-[#141414] cursor-pointer"
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
              className={`h-[31px] px-3 text-[10px] uppercase font-bold tracking-wider border border-[#141414] flex items-center gap-1.5 cursor-pointer transition-colors ${
                autoScan
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-white text-[#141414] hover:bg-neutral-100'
              }`}
              title={autoScan ? 'Click to Pause Continuous Scanning' : 'Click to Enable Continuous Auto-Scanning'}
            >
              <RefreshCw className={`w-3 h-3 ${autoScan ? 'animate-spin' : ''}`} />
              <span>{autoScan ? 'Active' : 'Paused'}</span>
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
            <span>{isScanning ? 'Scanning...' : 'Scan Now'}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
