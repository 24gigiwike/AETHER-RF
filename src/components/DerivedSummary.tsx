import React from 'react';
import {
  ShieldCheck,
  AlertOctagon,
  TrendingUp,
  Compass,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Radio,
  Clock,
  Sparkles,
} from 'lucide-react';
import { DerivedAnalysis, InterferenceSeverity, ChannelMetrics } from '../types/wifi';

interface DerivedSummaryProps {
  derived: DerivedAnalysis;
  totalAPs: number;
  isScanning: boolean;
  scanCount: number;
  lastScanTimeMs: number;
}

const SEVERITY_CONFIG: Record<
  InterferenceSeverity,
  { label: string; text: string; icon: React.ReactNode; desc: string; levelBadge: string }
> = {
  NORMAL: {
    label: 'NORMAL / OPTIMAL',
    text: 'text-emerald-700 font-extrabold',
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
    desc: 'Uncongested spectral propagation. Channel contention within optimal bounds.',
    levelBadge: 'OPTIMAL',
  },
  LOW: {
    label: 'LOW INTERFERENCE',
    text: 'text-blue-700 font-extrabold',
    icon: <ShieldCheck className="w-5 h-5 text-blue-700" />,
    desc: 'Mild carrier activity detected. Negligible CSMA/CA backoff delays.',
    levelBadge: 'LOW',
  },
  MEDIUM: {
    label: 'MEDIUM INTERFERENCE',
    text: 'text-amber-700 font-extrabold',
    icon: <AlertCircle className="w-5 h-5 text-amber-700" />,
    desc: 'Noticeable co-channel density. Packet retries likely on congested channels.',
    levelBadge: 'MEDIUM',
  },
  HIGH: {
    label: 'HIGH INTERFERENCE',
    text: 'text-rose-700 font-extrabold',
    icon: <AlertOctagon className="w-5 h-5 text-rose-700" />,
    desc: 'Severe carrier collision and backoff state. High adjacent spectral overlap detected.',
    levelBadge: 'HIGH',
  },
};

export const DerivedSummary: React.FC<DerivedSummaryProps> = ({
  derived,
  totalAPs,
  isScanning,
  scanCount,
  lastScanTimeMs,
}) => {
  const severityInfo = SEVERITY_CONFIG[derived.overallSeverity] || SEVERITY_CONFIG.NORMAL;
  const worstChannelData = derived.channels[derived.worstChannel];
  const recommendedData = derived.channels[derived.recommendedChannel];

  // Seconds ago calculation
  const [secondsAgo, setSecondsAgo] = React.useState(0);
  React.useEffect(() => {
    const update = () => {
      if (!lastScanTimeMs) return;
      setSecondsAgo(Math.max(0, Math.round((Date.now() - lastScanTimeMs) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastScanTimeMs]);

  const activeChannelsCount = (Object.values(derived.channels) as ChannelMetrics[]).filter(
    (c) => c.apCount > 0
  ).length;

  const strongestOverallRssi = Math.max(
    ...(Object.values(derived.channels) as ChannelMetrics[]).map((c) => c.strongestRssi)
  );

  return (
    <section id="derived-telemetry-summary" className="space-y-2.5 font-mono">
      {/* Real-Time Live Status Bar matching student prompt requirements */}
      <div className="bg-[#141414] text-white p-3 border border-black flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="opacity-70">Wi-Fi Scanner:</span>
            <span className="font-bold text-emerald-400">ACTIVE</span>
          </div>
          <div className="flex items-center gap-2 border-l border-white/20 pl-4">
            <span className="opacity-70">Scanner Status:</span>
            <span className={`font-bold ${isScanning ? 'text-amber-400 animate-pulse' : 'text-emerald-300'}`}>
              {isScanning ? 'SCANNING...' : 'MONITORING'}
            </span>
          </div>
          <div className="flex items-center gap-2 border-l border-white/20 pl-4">
            <span className="opacity-70">Networks Detected:</span>
            <span className="font-bold text-white">{totalAPs}</span>
          </div>
          <div className="flex items-center gap-2 border-l border-white/20 pl-4 hidden md:flex">
            <span className="opacity-70">Channels Active:</span>
            <span className="font-bold text-white">{activeChannelsCount} of 13</span>
          </div>
          <div className="flex items-center gap-2 border-l border-white/20 pl-4 hidden lg:flex">
            <span className="opacity-70">Strongest Signal:</span>
            <span className="font-bold text-emerald-400">{strongestOverallRssi} dBm</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1.5 text-neutral-300">
            <Clock className="w-3.5 h-3.5 text-orange-400" />
            <span>Last Scan: {secondsAgo === 0 ? 'Just now' : `${secondsAgo} seconds ago`}</span>
          </div>
          <div className="px-2 py-0.5 bg-white/10 text-neutral-300 border border-white/20">
            Cycle #{scanCount}
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Severity Classification Card */}
        <div
          id="kpi-severity-card"
          className="p-3.5 border border-[#141414] bg-white flex flex-col justify-between"
        >
          <div className="flex items-start justify-between border-b border-black/10 pb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">
              Interference Level
            </span>
            {severityInfo.icon}
          </div>
          <div className="my-2">
            <div className={`text-2xl font-black tracking-tight ${severityInfo.text}`}>
              {severityInfo.levelBadge}
            </div>
            <p className="text-[11px] text-neutral-700 mt-1 leading-snug italic">{severityInfo.desc}</p>
          </div>
          <div className="text-[10px] text-[#141414] pt-2 border-t border-black/10 font-bold flex justify-between">
            <span>CONGESTION SCORE:</span>
            <span>{(derived.overallCongestionScore * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Total Detected AP Count */}
        <div id="kpi-ap-count-card" className="p-3.5 border border-[#141414] bg-white flex flex-col justify-between">
          <div className="flex items-start justify-between border-b border-black/10 pb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">
              Networks Detected
            </span>
            <Cpu className="w-4 h-4 text-[#141414]" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold text-[#141414] tracking-tight">
              {totalAPs} <span className="text-xs font-normal opacity-60">APs</span>
            </div>
            <p className="text-[11px] text-neutral-600 mt-1">
              Active transmitters captured on 2.4 GHz
            </p>
          </div>
          <div className="text-[10px] text-[#141414] pt-2 border-t border-black/10 flex justify-between">
            <span>CHANNELS ACTIVE:</span>
            <span className="font-bold">{activeChannelsCount} Active</span>
          </div>
        </div>

        {/* Worst Contended Channel */}
        <div id="kpi-worst-channel-card" className="p-3.5 border border-[#141414] bg-white flex flex-col justify-between">
          <div className="flex items-start justify-between border-b border-black/10 pb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">
              Peak Contention Channel
            </span>
            <TrendingUp className="w-4 h-4 text-[#D00]" />
          </div>
          <div className="my-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-[#141414]">
                CH {derived.worstChannel}
              </span>
              <span className="text-xs text-[#D00] font-bold">
                SCORE: {(worstChannelData?.congestionScore * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[11px] text-neutral-600 mt-1">
              {worstChannelData?.apCount || 0} APs | Peak: {worstChannelData?.strongestRssi || -100} dBm
            </p>
          </div>
          <div className="text-[10px] text-[#141414] pt-2 border-t border-black/10 flex justify-between">
            <span>CARRIER FREQUENCY:</span>
            <span>{worstChannelData?.centerFrequencyMhz || 2412} MHz</span>
          </div>
        </div>

        {/* Recommended Mitigation Channel */}
        <div id="kpi-recommended-channel-card" className="p-3.5 border border-[#141414] bg-white flex flex-col justify-between">
          <div className="flex items-start justify-between border-b border-black/10 pb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-900">
              Recommended Channel
            </span>
            <Compass className="w-4 h-4 text-blue-700" />
          </div>
          <div className="my-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-blue-700">
                CH {derived.recommendedChannel}
              </span>
              <span className="text-xs text-blue-700 font-bold">
                SCORE: {(recommendedData?.congestionScore * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[11px] text-neutral-600 mt-1 italic leading-snug">
              Cleanest spectral path among non-overlapping channels (1, 6, 11)
            </p>
          </div>
          <div className="text-[10px] text-[#141414] pt-2 border-t border-black/10 flex justify-between">
            <span>DELTA ADVANTAGE:</span>
            <span className="font-bold text-blue-700">
              -{((worstChannelData?.congestionScore - recommendedData?.congestionScore) * 100).toFixed(0)}% Contention
            </span>
          </div>
        </div>
      </div>

      {/* Explainable Rationale Box */}
      <div id="classification-rationale-box" className="p-3 bg-white border border-[#141414] text-xs text-[#141414]">
        <div className="font-bold uppercase tracking-wider text-[11px] mb-1.5 flex items-center justify-between border-b border-black/10 pb-1">
          <span>AI Mitigation &amp; Telemetry Evaluation Logic:</span>
          <span className="text-[10px] opacity-60 font-normal">REAL-TIME DETERMINISTIC ENGINE</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-neutral-800 text-[11px]">
          {derived.classificationRationale.map((reason, idx) => (
            <li key={idx} className="leading-snug">{reason}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};
