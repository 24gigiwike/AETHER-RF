import React from 'react';
import { X, Layers, ArrowRight, ShieldCheck, Cpu, Database, BrainCircuit, Activity } from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#141414]/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto font-mono">
      <div className="bg-white max-w-3xl w-full border border-[#141414] shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-3.5 border-b border-[#141414] flex items-center justify-between bg-neutral-100">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#141414]" />
            <div>
              <h2 className="text-xs font-bold text-[#141414] uppercase tracking-wider">
                Telecommunications System Architecture
              </h2>
              <p className="text-[10px] opacity-60 font-mono">
                Progressive Development Strategy &amp; Pipeline Contract
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#141414] hover:bg-neutral-200 border border-black/20 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-[#141414] font-mono">
          {/* Data Flow Pipeline */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#141414] uppercase tracking-wider">1. End-to-End Data Pipeline</h3>
            <div className="p-3 bg-[#141414] text-neutral-200 font-mono border border-black space-y-2 text-[11px]">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <span>[1] Physical ESP32 / Simulator</span>
                <ArrowRight className="w-3 h-3 text-neutral-500" />
                <span>[2] Raw Ingestion (/api/scan/ingest)</span>
              </div>
              <div className="flex items-center gap-2 text-blue-400 pl-4">
                <span>↓ [3] Data Processing &amp; RF Power Averaging</span>
              </div>
              <div className="flex items-center gap-2 text-amber-400 pl-4">
                <span>↓ [4] Derived Parameters (CCI/ACI &amp; Congestion Score)</span>
              </div>
              <div className="flex items-center gap-2 text-purple-400 pl-4">
                <span>↓ [5] Standalone ML Interference Classification (scikit-learn)</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-400 pl-4">
                <span>↓ [6] Adaptive Channel Recommendation &amp; Performance Evaluation</span>
              </div>
            </div>
          </div>

          {/* Strict Separation of Parameters */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#141414] uppercase tracking-wider">2. Strict Architectural Boundaries</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-white border border-[#141414]">
                <div className="font-bold text-[#141414] uppercase text-[10px] tracking-wider mb-1 border-b border-black/10 pb-1">
                  Raw Measurements
                </div>
                <p className="text-[11px] text-neutral-700 leading-snug">
                  Directly obtainable from ESP32 802.11 radio: RSSI (dBm), Channel (1-14), SSID, BSSID, Timestamp, AP count.
                </p>
              </div>

              <div className="p-3 bg-white border border-[#141414]">
                <div className="font-bold text-blue-900 uppercase text-[10px] tracking-wider mb-1 border-b border-black/10 pb-1">
                  Derived Parameters
                </div>
                <p className="text-[11px] text-neutral-700 leading-snug">
                  Calculated mathematically: Channel Density, RF Power Average RSSI (mW linear averaging), Co-Channel score, Adjacent bleed, Severity.
                </p>
              </div>

              <div className="p-3 bg-white border border-[#141414]">
                <div className="font-bold opacity-60 uppercase text-[10px] tracking-wider mb-1 border-b border-black/10 pb-1">
                  Network Performance
                </div>
                <p className="text-[11px] text-neutral-700 leading-snug">
                  Packet loss (%), latency (ms), throughput (Mbps). Reserved strictly for Phase 2 without fabricating mock values.
                </p>
              </div>
            </div>
          </div>

          {/* AI/ML Separation Principles */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#141414] uppercase tracking-wider">3. AI/ML Engineering Strategy</h3>
            <div className="p-3 bg-neutral-100 border border-[#141414] space-y-1.5 text-[11px] text-neutral-800">
              <p>
                <strong>Decoupled Model Architecture:</strong> The machine-learning component for interference classification will be trained on empirical real-world datasets collected through this platform.
              </p>
              <p>
                <strong>No LLM Substitution:</strong> An LLM is not an appropriate substitute for an RF interference classification model. The ML model will be implemented using <code>scikit-learn</code> (e.g. Random Forest or Gradient Boosting) or <code>ONNX</code> and exposed via a lightweight REST microservice.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#141414] bg-neutral-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#141414] hover:bg-[#2c2c2c] text-white font-bold text-[10px] uppercase tracking-wider border border-[#141414] cursor-pointer"
          >
            Close Architecture
          </button>
        </div>
      </div>
    </div>
  );
};
