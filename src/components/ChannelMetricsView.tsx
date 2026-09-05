import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';
import { ChannelMetrics } from '../types/wifi';
import { BarChart3, ListFilter } from 'lucide-react';

interface ChannelMetricsViewProps {
  channels: Record<number, ChannelMetrics>;
  worstChannel: number;
  recommendedChannel: number;
}

export const ChannelMetricsView: React.FC<ChannelMetricsViewProps> = ({
  channels,
  worstChannel,
  recommendedChannel,
}) => {
  const [metricMode, setMetricMode] = useState<'congestion' | 'density' | 'rssi'>('congestion');

  const channelList = Object.values(channels) as ChannelMetrics[];

  // Prepare chart data array for Channels 1 through 13
  const chartData = channelList.map((metric) => ({
    channel: `Ch ${metric.channel}`,
    rawChannel: metric.channel,
    apCount: metric.apCount,
    congestionScorePct: Math.round(metric.congestionScore * 100),
    averageRssi: metric.apCount > 0 ? metric.averageRssi : -100,
    strongestRssi: metric.apCount > 0 ? metric.strongestRssi : -100,
    isStandardNonOverlapping: [1, 6, 11].includes(metric.channel),
  }));

  const getBarColor = (rawChannel: number, scorePct: number) => {
    if (rawChannel === worstChannel) return '#D00';          // High-contrast Red
    if (rawChannel === recommendedChannel) return '#1D4ED8';  // High-contrast Blue
    if (scorePct > 60) return '#ea580c';                     // Orange
    if (scorePct > 30) return '#141414';                     // Dark Ink
    return '#888888';                                        // Muted Charcoal
  };

  return (
    <section id="channel-congestion-analysis" className="bg-white border border-[#141414] p-3.5 space-y-3">
      {/* Header & Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#141414] pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#141414]" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#141414] font-mono">
            2.4 GHz Spectral Channel Distribution &amp; Congestion Analysis
          </h2>
        </div>

        {/* View Metric Mode Switcher */}
        <div className="flex items-center gap-1 font-mono">
          <button
            onClick={() => setMetricMode('congestion')}
            className={`px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors cursor-pointer border border-[#141414] ${
              metricMode === 'congestion'
                ? 'bg-[#141414] text-white font-bold'
                : 'bg-white text-[#141414] hover:bg-neutral-100'
            }`}
          >
            Congestion Index
          </button>
          <button
            onClick={() => setMetricMode('density')}
            className={`px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors cursor-pointer border border-[#141414] ${
              metricMode === 'density'
                ? 'bg-[#141414] text-white font-bold'
                : 'bg-white text-[#141414] hover:bg-neutral-100'
            }`}
          >
            AP Density
          </button>
          <button
            onClick={() => setMetricMode('rssi')}
            className={`px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors cursor-pointer border border-[#141414] ${
              metricMode === 'rssi'
                ? 'bg-[#141414] text-white font-bold'
                : 'bg-white text-[#141414] hover:bg-neutral-100'
            }`}
          >
            Average RSSI
          </button>
        </div>
      </div>

      {/* Spectral Visualization Chart */}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#E4E3E0" />
            <XAxis
              dataKey="channel"
              tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#141414' }}
              axisLine={{ stroke: '#141414' }}
            />
            <YAxis
              tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#141414' }}
              domain={metricMode === 'rssi' ? [-100, -30] : [0, 'auto']}
              axisLine={{ stroke: '#141414' }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-[#141414] text-white text-[11px] p-2.5 border border-black font-mono space-y-1">
                      <div className="font-bold text-orange-400">
                        {data.channel} {data.isStandardNonOverlapping ? '(Standard 20MHz)' : '(Non-standard)'}
                      </div>
                      <div>APs Detected: {data.apCount}</div>
                      <div>Congestion Index: {data.congestionScorePct}%</div>
                      <div>Avg RSSI: {data.averageRssi > -100 ? `${data.averageRssi} dBm` : 'None'}</div>
                      <div>Peak RSSI: {data.strongestRssi > -100 ? `${data.strongestRssi} dBm` : 'None'}</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey={
                metricMode === 'congestion'
                  ? 'congestionScorePct'
                  : metricMode === 'density'
                  ? 'apCount'
                  : 'averageRssi'
              }
              radius={0}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getBarColor(entry.rawChannel, entry.congestionScorePct)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend & Channel Convention Reference */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[#141414] pt-1 border-t border-[#141414]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-blue-700 border border-black/20" />
            <span className="font-bold">Recommended (CH {recommendedChannel})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#D00] border border-black/20" />
            <span className="font-bold">Peak Congested (CH {worstChannel})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#141414] border border-black/20" />
            <span>Standard Channels (1, 6, 11)</span>
          </div>
        </div>
        <span className="text-[10px] opacity-60">
          802.11b/g/n 2.4 GHz Carrier Grid: 5 MHz Step / 20 MHz Mask
        </span>
      </div>

      {/* Structured Channels Telemetry Table */}
      <div className="overflow-x-auto border border-[#141414]">
        <table id="channel-metrics-table" className="w-full text-left text-[11px] font-mono">
          <thead className="bg-neutral-100 text-[#141414] border-b border-[#141414]">
            <tr>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px]">CH</th>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px]">Center Freq</th>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px]">AP Count</th>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px]">Avg RSSI</th>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px]">Peak RSSI</th>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px]">CCI Score</th>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px]">ACI Bleed</th>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px] text-right">Congestion Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {channelList.map((ch) => {
              const isRecommended = ch.channel === recommendedChannel;
              const isWorst = ch.channel === worstChannel;
              const isStandard = [1, 6, 11].includes(ch.channel);

              return (
                <tr
                  key={ch.channel}
                  className={`hover:bg-neutral-100 transition-colors ${
                    isRecommended
                      ? 'bg-blue-50/50'
                      : isWorst
                      ? 'bg-red-50/50'
                      : ''
                  }`}
                >
                  <td className="py-1.5 px-2.5 font-bold text-[#141414]">
                    <div className="flex items-center gap-1.5">
                      <span>CH {ch.channel}</span>
                      {isStandard && (
                        <span className="text-[9px] px-1 py-0.2 border border-[#141414] bg-neutral-100 text-[#141414] font-bold">
                          STD
                        </span>
                      )}
                      {isRecommended && (
                        <span className="text-[9px] px-1 py-0.2 bg-blue-700 text-white font-bold">
                          BEST
                        </span>
                      )}
                      {isWorst && (
                        <span className="text-[9px] px-1 py-0.2 bg-[#D00] text-white font-bold">
                          WORST
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 px-2.5 opacity-80">{ch.centerFrequencyMhz} MHz</td>
                  <td className="py-1.5 px-2.5">
                    <span
                      className={`px-1 py-0.5 text-[10px] font-mono ${
                        ch.apCount > 4
                          ? 'text-[#D00] font-bold'
                          : ch.apCount > 0
                          ? 'text-[#141414]'
                          : 'opacity-40'
                      }`}
                    >
                      {ch.apCount} APs
                    </span>
                  </td>
                  <td className="py-1.5 px-2.5 text-[#141414]">
                    {ch.apCount > 0 ? `${ch.averageRssi} dBm` : '—'}
                  </td>
                  <td className="py-1.5 px-2.5 text-[#141414]">
                    {ch.apCount > 0 ? `${ch.strongestRssi} dBm` : '—'}
                  </td>
                  <td className="py-1.5 px-2.5 opacity-80">
                    {(ch.coChannelScore * 100).toFixed(0)}%
                  </td>
                  <td className="py-1.5 px-2.5 opacity-80">
                    {(ch.adjacentChannelScore * 100).toFixed(0)}%
                  </td>
                  <td className="py-1.5 px-2.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-16 h-2 bg-neutral-200 border border-black/20">
                        <div
                          className={`h-full ${
                            ch.congestionScore > 0.6
                              ? 'bg-[#D00]'
                              : ch.congestionScore > 0.3
                              ? 'bg-[#141414]'
                              : 'bg-blue-700'
                          }`}
                          style={{ width: `${Math.round(ch.congestionScore * 100)}%` }}
                        />
                      </div>
                      <span className="font-bold w-8 text-right text-[#141414]">
                        {(ch.congestionScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
