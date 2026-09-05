import React from 'react';
import { ShieldCheck, AlertOctagon, TrendingUp, Compass, Cpu, CheckCircle2, AlertCircle } from 'lucide-react';
import { DerivedAnalysis, InterferenceSeverity, ChannelMetrics } from '../types/wifi';

interface DerivedSummaryProps {
  derived: DerivedAnalysis;
  totalAPs: number;
}

const SEVERITY_CONFIG: Record<
  InterferenceSeverity,
  { label: string; bg: string; text: string; border: string; icon: React.ReactNode; desc: string }
> = {
  NORMAL: {
    label: 'OPTIMAL / NORMAL',
    bg: 'bg-emerald-50/50',
    text: 'severity-normal',
    border: 'border-[#141414]',
    icon: <CheckCircle2 className="w-5 h-5 text-[#080]" />,
    desc: 'Uncongested spectral propagation. Channel contention within optimal bounds.',
  },
  LOW: {
    label: 'LOW CONTEND',
    bg: 'bg-blue-50/50',
    text: 'text-blue-700 font-extrabold',
    border: 'border-[#141414]',
    icon: <ShieldCheck className="w-5 h-5 text-blue-700" />,
    desc: 'Mild carrier activity detected. Negligible backoff delays.',
  },
  MEDIUM: {
    label: 'MODERATE CONTENTION',
    bg: 'bg-amber-50/50',
    text: 'text-amber-700 font-extrabold',
    border: 'border-[#141414]',
    icon: <AlertCircle className="w-5 h-5 text-amber-700" />,
    desc: 'Noticeable co-channel density. Packet retries likely on congested channels.',
  },
  HIGH: {
    label: 'CRITICAL / HIGH',
    bg: 'bg-red-50/50',
    text: 'severity-high',
    border: 'border-[#141414]',
    icon: <AlertOctagon className="w-5 h-5 text-[#D00]" />,
    desc: 'Severe carrier collision/backoff state. High adjacent spectral overlap detected.',
  },
};

export const DerivedSummary: React.FC<DerivedSummaryProps> = ({ derived, totalAPs }) => {
  const severityInfo = SEVERITY_CONFIG[derived.overallSeverity] || SEVERITY_CONFIG.NORMAL;
  const worstChannelData = derived.channels[derived.worstChannel];
  const recommendedData = derived.channels[derived.recommendedChannel];

  return (
    <section id="derived-telemetry-summary" className="space-y-2.5">
      {/* Header Tag Distinguishing Derived vs Raw */}
      <div className="flex items-center justify-between border-b border-[#141414] pb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#141414] font-mono">
            Derived Telemetry &amp; Analytical Classification
          </span>
          <span className="text-[9px] font-mono uppercase px-2 py-0.5 bg-[#141414] text-white font-bold">
            Computed RF Parameters
          </span>
        </div>
        <div className="text-[10px] font-mono opacity-60">
          ALGORITHM: IEEE 802.11 MASK MODEL
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Severity Classification Card */}
        <div
          id="kpi-severity-card"
          className={`p-3.5 border border-[#141414] bg-white flex flex-col justify-between`}
        >
          <div className="flex items-start justify-between border-b border-black/10 pb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 font-mono">
              Interference Severity
            </span>
            {severityInfo.icon}
          </div>
          <div className="my-2">
            <div className={`text-2xl font-black font-mono tracking-tight ${severityInfo.text}`}>
              {severityInfo.label}
            </div>
            <p className="text-[11px] text-neutral-700 mt-1 leading-snug italic">{severityInfo.desc}</p>
          </div>
          <div className="text-[10px] font-mono text-[#141414] pt-2 border-t border-black/10 font-bold flex justify-between">
            <span>COMPOSITE INDEX:</span>
            <span>{(derived.overallCongestionScore * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Total Detected AP Count */}
        <div id="kpi-ap-count-card" className="p-3.5 border border-[#141414] bg-white flex flex-col justify-between">
          <div className="flex items-start justify-between border-b border-black/10 pb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 font-mono">
              Active Transmitters (BSSIDs)
            </span>
            <Cpu className="w-4 h-4 text-[#141414]" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold font-mono text-[#141414] tracking-tight">
              {totalAPs} <span className="text-xs font-normal opacity-60">AP beacons</span>
            </div>
            <p className="text-[11px] text-neutral-600 mt-1 font-mono">Observed across 2.4 GHz band</p>
          </div>
          <div className="text-[10px] font-mono text-[#141414] pt-2 border-t border-black/10 flex justify-between">
            <span>CHANNELS ACTIVE:</span>
            <span className="font-bold">{(Object.values(derived.channels) as ChannelMetrics[]).filter((c) => c.apCount > 0).length} of 13</span>
          </div>
        </div>

        {/* Worst Contended Channel */}
        <div id="kpi-worst-channel-card" className="p-3.5 border border-[#141414] bg-white flex flex-col justify-between">
          <div className="flex items-start justify-between border-b border-black/10 pb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 font-mono">
              Peak Contention Channel
            </span>
            <TrendingUp className="w-4 h-4 text-[#D00]" />
          </div>
          <div className="my-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-[#141414]">
                CH {derived.worstChannel}
              </span>
              <span className="text-xs font-mono text-[#D00] font-bold">
                SCORE: {(worstChannelData?.congestionScore * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[11px] text-neutral-600 mt-1 font-mono">
              {worstChannelData?.apCount || 0} APs | Peak: {worstChannelData?.strongestRssi || -100} dBm
            </p>
          </div>
          <div className="text-[10px] font-mono text-[#141414] pt-2 border-t border-black/10 flex justify-between">
            <span>FREQUENCY:</span>
            <span>{worstChannelData?.centerFrequencyMhz || 2412} MHz</span>
          </div>
        </div>

        {/* Recommended Mitigation Channel */}
        <div id="kpi-recommended-channel-card" className="p-3.5 border border-[#141414] bg-white flex flex-col justify-between">
          <div className="flex items-start justify-between border-b border-black/10 pb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-900 font-mono">
              Optimal Mitigation Channel
            </span>
            <Compass className="w-4 h-4 text-blue-700" />
          </div>
          <div className="my-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-blue-700">
                CH {derived.recommendedChannel}
              </span>
              <span className="text-xs font-mono text-blue-700 font-bold">
                SCORE: {(recommendedData?.congestionScore * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[11px] text-neutral-600 mt-1 italic leading-snug">
              Lowest contention among non-overlapping channels (1, 6, 11)
            </p>
          </div>
          <div className="text-[10px] font-mono text-[#141414] pt-2 border-t border-black/10 flex justify-between">
            <span>DELTA HEADROOM:</span>
            <span className="font-bold text-blue-700">-{((worstChannelData?.congestionScore - recommendedData?.congestionScore) * 100).toFixed(0)}% Contention</span>
          </div>
        </div>
      </div>

      {/* Explainable Rationale Box */}
      <div id="classification-rationale-box" className="p-3 bg-white border border-[#141414] text-xs text-[#141414] font-mono">
        <div className="font-bold uppercase tracking-wider text-[11px] mb-1.5 flex items-center justify-between border-b border-black/10 pb-1">
          <span>AI Mitigation &amp; Telemetry Evaluation Logic:</span>
          <span className="text-[10px] opacity-60 font-normal">STAGE 1 DETERMINISTIC ENGINE</span>
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
