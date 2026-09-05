import React from 'react';
import { Gauge, Clock, WifiOff, ArrowRightLeft, ShieldAlert } from 'lucide-react';
import { NetworkPerformanceMetrics } from '../types/wifi';

export const FuturePerformanceMetrics: React.FC = () => {
  // Formal architecture representation with strictly NO fabricated measurements
  const contract: NetworkPerformanceMetrics = {
    packetLossPercent: null,
    latencyMs: null,
    throughputMbps: null,
    isImplemented: false,
    statusNote: 'Reserved for Phase 2 active transport layer evaluation (Ping/iPerf3)',
  };

  return (
    <section
      id="future-performance-contract"
      className="bg-white border border-[#141414] p-3.5 space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#141414] pb-2">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-[#141414]" />
          <h3 className="text-xs font-bold text-[#141414] uppercase tracking-wider font-mono">
            Network Performance &amp; Mitigation Validation Contract
          </h3>
        </div>
        <span className="text-[9px] font-mono uppercase px-2 py-0.5 border border-[#141414] bg-neutral-100 text-[#141414] font-bold">
          Phase 2 Evaluation Spec
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Packet Loss Contract Card */}
        <div className="p-3 bg-white border border-[#141414] flex flex-col justify-between font-mono">
          <div className="flex items-center justify-between opacity-60">
            <span className="text-[10px] uppercase font-bold tracking-wider">Packet Loss Rate</span>
            <WifiOff className="w-4 h-4" />
          </div>
          <div className="my-2">
            <div className="text-xl font-bold font-mono text-[#141414]">
              -- <span className="text-xs font-normal opacity-60">%</span>
            </div>
            <p className="text-[11px] text-neutral-600 mt-1 italic leading-snug">
              Active ICMP sequence loss tracking across channel switch
            </p>
          </div>
          <div className="text-[10px] font-mono opacity-60 border-t border-black/10 pt-1.5 flex justify-between">
            <span>STATUS:</span>
            <span>Awaiting probe integration</span>
          </div>
        </div>

        {/* Latency Contract Card */}
        <div className="p-3 bg-white border border-[#141414] flex flex-col justify-between font-mono">
          <div className="flex items-center justify-between opacity-60">
            <span className="text-[10px] uppercase font-bold tracking-wider">RTT Network Latency</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="my-2">
            <div className="text-xl font-bold font-mono text-[#141414]">
              -- <span className="text-xs font-normal opacity-60">ms</span>
            </div>
            <p className="text-[11px] text-neutral-600 mt-1 italic leading-snug">
              Round-trip time under varying co-channel interference
            </p>
          </div>
          <div className="text-[10px] font-mono opacity-60 border-t border-black/10 pt-1.5 flex justify-between">
            <span>STATUS:</span>
            <span>Awaiting probe integration</span>
          </div>
        </div>

        {/* Throughput Contract Card */}
        <div className="p-3 bg-white border border-[#141414] flex flex-col justify-between font-mono">
          <div className="flex items-center justify-between opacity-60">
            <span className="text-[10px] uppercase font-bold tracking-wider">PHY Layer Throughput</span>
            <Gauge className="w-4 h-4" />
          </div>
          <div className="my-2">
            <div className="text-xl font-bold font-mono text-[#141414]">
              -- <span className="text-xs font-normal opacity-60">Mbps</span>
            </div>
            <p className="text-[11px] text-neutral-600 mt-1 italic leading-snug">
              Downlink/Uplink speed measurement before vs. after mitigation
            </p>
          </div>
          <div className="text-[10px] font-mono opacity-60 border-t border-black/10 pt-1.5 flex justify-between">
            <span>STATUS:</span>
            <span>Awaiting probe integration</span>
          </div>
        </div>
      </div>

      <div className="p-2.5 bg-neutral-100 border border-[#141414] text-[11px] text-[#141414] font-mono flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
        <p className="leading-snug">
          <strong className="uppercase font-bold">Academic Integrity Notice:</strong> Telecommunications benchmarks for packet loss, latency, and throughput are deliberately unpopulated at this development stage. Fabricating values without physical measurement probes would breach experimental scientific integrity.
        </p>
      </div>
    </section>
  );
};
