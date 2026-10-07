import React from 'react';
import { Radio, Cpu, Layers, BookOpen, Activity } from 'lucide-react';
import { DataSourceOrigin } from '../types/wifi';

interface HeaderProps {
  source: DataSourceOrigin;
  batchId: string;
  timestamp: number;
  scanDurationMs: number;
  isScanning: boolean;
  onOpenArchitecture: () => void;
  onOpenEsp32Modal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  source,
  batchId,
  timestamp,
  scanDurationMs,
  isScanning,
  onOpenArchitecture,
  onOpenEsp32Modal,
}) => {
  const isHardware = source === 'ESP32_HARDWARE';

  return (
    <header id="main-header" className="header-gradient text-white border-b border-black sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Title and Identity (Removed [University Telecommunications Engineering Project]) */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-black border border-white/20 text-white flex items-center justify-center shrink-0">
            <Radio className={`w-5 h-5 ${isScanning ? 'text-emerald-400 animate-pulse' : 'text-orange-400'}`} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-mono flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block"></span>
              RF Telemetry Monitor &bull; Intelligent Wi-Fi Scanning
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <h1 className="text-base sm:text-lg font-bold italic tracking-tight text-white">
                AI-Powered Wi-Fi Interference &amp; Adaptive Mitigation Platform
              </h1>
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-bold">
                Live Scanner
              </span>
            </div>
          </div>
        </div>

        {/* Status Indicators & Action Tools */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Active Data Source Badge */}
          <div
            id="data-source-status-badge"
            className="flex items-center gap-2 bg-white/10 px-3 py-1.5 border border-white/20"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isScanning ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'
              }`}
            />
            <span className="text-[10px] uppercase font-bold tracking-tight font-mono">
              {isScanning ? 'Scanning RF Spectrum...' : isHardware ? 'ESP32 Receiver Active' : 'Wi-Fi Scanner: Active'}
            </span>
          </div>

          {/* Hardware Target Readout */}
          <div className="hidden sm:block text-right font-mono border-r border-white/20 pr-3">
            <p className="text-[9px] uppercase opacity-60">Hardware Receiver</p>
            <p className="text-xs font-bold text-white tracking-tight">ESP32-S3 Radio PHY</p>
          </div>

          {/* Sweep Duration */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 border border-white/20 text-[10px] font-mono text-white/80">
            <Activity className="w-3 h-3 text-orange-400" />
            <span>Cycle: {scanDurationMs}ms</span>
          </div>

          {/* Quick Action: ESP32 Hardware Integration Spec */}
          <button
            id="btn-open-esp32-spec"
            onClick={onOpenEsp32Modal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/20 cursor-pointer font-mono"
          >
            <Cpu className="w-3.5 h-3.5 text-orange-400" />
            <span>ESP32 / FastAPI Ingest</span>
          </button>

          {/* Quick Action: System Architecture Spec */}
          <button
            id="btn-open-architecture"
            onClick={onOpenArchitecture}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold bg-white hover:bg-neutral-200 text-[#141414] transition-colors border border-white cursor-pointer font-mono"
          >
            <Layers className="w-3.5 h-3.5 text-[#141414]" />
            <span>Architecture &amp; Data Flow</span>
          </button>
        </div>
      </div>
    </header>
  );
};
