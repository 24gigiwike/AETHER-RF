import React from 'react';
import { Play, RefreshCw, AlertTriangle, Sliders, Info, Zap } from 'lucide-react';
import { SimulatorEnvironmentProfile } from '../types/wifi';

interface SimulatorControlsProps {
  currentProfile: SimulatorEnvironmentProfile;
  onProfileChange: (profile: SimulatorEnvironmentProfile) => void;
  onTriggerScan: () => void;
  isScanning: boolean;
  autoScan: boolean;
  onToggleAutoScan: () => void;
  scanIntervalSec: number;
  onIntervalChange: (sec: number) => void;
}

const PROFILE_DESCRIPTIONS: Record<
  SimulatorEnvironmentProfile,
  { label: string; tag: string; description: string; expectedCongestion: string }
> = {
  LOW_DENSITY: {
    label: 'Low Network Density',
    tag: 'Rural / Dedicated RF Lab',
    description: '3 APs strictly separated on non-overlapping channels (1, 6, 11). Minimal interference and clean carrier sensing.',
    expectedCongestion: 'Normal / Low Severity',
  },
  MODERATE_DENSITY: {
    label: 'Moderate Density',
    tag: 'Standard Office / Faculty Floor',
    description: '9 APs distributed across channels 1, 6, 11 with varying signal strengths (-48 dBm to -83 dBm).',
    expectedCongestion: 'Low / Medium Severity',
  },
  HIGH_CONGESTION: {
    label: 'High Network Density & Congestion',
    tag: 'University Dorm / Crowded Auditorium',
    description: '16+ APs competing heavily on Channel 6 (-42 dBm to -77 dBm) and Channel 1, causing intense Co-Channel Contention (CCI).',
    expectedCongestion: 'High Severity',
  },
  ADJACENT_INTERFERENCE: {
    label: 'Adjacent Channel Interference (ACI)',
    tag: 'Misconfigured Non-Standard APs',
    description: 'Uncoordinated access points positioned on channels 2, 3, 4, 7, 8 causing severe spectral splatter into channels 1 & 6.',
    expectedCongestion: 'Medium / High Severity',
  },
  OFFICE_PEAK: {
    label: 'Enterprise Multi-SSID Peak',
    tag: 'High-Throughput Campus Center',
    description: 'Multiple BSSIDs broadcast from the same physical access points with high beacon traffic density.',
    expectedCongestion: 'Medium Severity',
  },
};

export const SimulatorControls: React.FC<SimulatorControlsProps> = ({
  currentProfile,
  onProfileChange,
  onTriggerScan,
  isScanning,
  autoScan,
  onToggleAutoScan,
  scanIntervalSec,
  onIntervalChange,
}) => {
  const profileInfo = PROFILE_DESCRIPTIONS[currentProfile];

  return (
    <section id="simulator-test-bench" className="bg-white border border-[#141414] p-3.5 space-y-3">
      {/* Explicit Simulator Identification Banner */}
      <div className="flex items-start gap-2.5 p-2.5 bg-neutral-100 border border-[#141414] text-[#141414] text-xs">
        <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold tracking-tight text-[11px] uppercase font-mono">
            DEVELOPMENT HARNESS: ISOLATED WI-FI SCANNER SIMULATOR ACTIVE
          </p>
          <p className="text-neutral-700 leading-relaxed text-[11px]">
            Data generated in this view is simulated according to the exact IEEE 802.11 schema expected from physical ESP32 hardware.
            No physical RF spectrum hardware is presently connected to this session.
          </p>
        </div>
      </div>

      {/* Control Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        {/* Environment Profile Selector */}
        <div className="md:col-span-6 space-y-1">
          <label htmlFor="select-sim-profile" className="block text-[11px] uppercase tracking-wider font-bold text-[#141414] font-mono">
            Simulation Environmental Profile:
          </label>
          <div className="relative">
            <select
              id="select-sim-profile"
              value={currentProfile}
              onChange={(e) => onProfileChange(e.target.value as SimulatorEnvironmentProfile)}
              className="w-full text-xs font-mono bg-white hover:bg-neutral-50 border border-[#141414] px-2.5 py-1.5 text-[#141414] focus:outline-none focus:ring-1 focus:ring-[#141414] cursor-pointer"
            >
              {Object.entries(PROFILE_DESCRIPTIONS).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label} — ({info.tag})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-neutral-600 font-mono">
            <Info className="w-3 h-3 text-neutral-500 shrink-0" />
            <span>{profileInfo.description}</span>
          </div>
        </div>

        {/* Auto-Scan Controls */}
        <div className="md:col-span-3 flex items-center gap-2">
          <div className="space-y-1 flex-1">
            <label htmlFor="select-scan-interval" className="block text-[11px] uppercase tracking-wider font-bold text-[#141414] font-mono">
              Cadence:
            </label>
            <select
              id="select-scan-interval"
              value={scanIntervalSec}
              onChange={(e) => onIntervalChange(Number(e.target.value))}
              disabled={autoScan}
              className="w-full text-xs font-mono bg-white border border-[#141414] px-2 py-1.5 text-[#141414] disabled:opacity-50"
            >
              <option value={2}>2s Interval</option>
              <option value={4}>4s Interval</option>
              <option value={8}>8s Interval</option>
            </select>
          </div>

          <div className="space-y-1">
            <span className="block text-[11px] uppercase tracking-wider font-bold text-[#141414] font-mono">Auto Sweep</span>
            <button
              id="btn-toggle-auto-scan"
              onClick={onToggleAutoScan}
              className={`h-[31px] px-3 text-[10px] uppercase font-bold tracking-wider border border-[#141414] flex items-center gap-1.5 cursor-pointer transition-colors font-mono ${
                autoScan
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-white text-[#141414] hover:bg-neutral-100'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${autoScan ? 'animate-spin' : ''}`} />
              <span>{autoScan ? 'Running' : 'Paused'}</span>
            </button>
          </div>
        </div>

        {/* Manual Trigger Button */}
        <div className="md:col-span-3 flex justify-end">
          <button
            id="btn-trigger-hardware-sweep"
            onClick={onTriggerScan}
            disabled={isScanning || autoScan}
            className="w-full h-[31px] flex items-center justify-center gap-2 px-3 text-[10px] uppercase tracking-widest font-bold bg-[#141414] hover:bg-[#2c2c2c] disabled:bg-neutral-300 disabled:text-neutral-500 text-white transition-colors cursor-pointer disabled:cursor-not-allowed border border-[#141414] font-mono"
          >
            <Zap className="w-3.5 h-3.5 text-orange-400" />
            <span>{isScanning ? 'Sweeping Channels...' : 'Execute Scan Sweep'}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
