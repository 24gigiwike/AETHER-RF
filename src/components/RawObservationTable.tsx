import React, { useState, useMemo, useEffect } from 'react';
import { RawWiFiObservation } from '../types/wifi';
import { Search, Filter, ArrowUpDown, Lock, Unlock, Radio, Signal, Clock } from 'lucide-react';

function formatObservedAge(timestamp: number, now: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '—';
  }
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

interface RawObservationTableProps {
  observations: RawWiFiObservation[];
  batchId: string;
  isScanning: boolean;
}

export const RawObservationTable: React.FC<RawObservationTableProps> = ({
  observations,
  batchId,
  isScanning,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'rssi' | 'channel' | 'ssid'>('rssi');
  const [sortAsc, setSortAsc] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter & sort
  const filteredObservations = useMemo(() => {
    return observations
      .filter((obs) => {
        const matchesSearch =
          (obs.ssid || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          obs.bssid.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesChannel =
          selectedChannelFilter === 'ALL' || obs.channel.toString() === selectedChannelFilter;
        return matchesSearch && matchesChannel;
      })
      .sort((a, b) => {
        let compare = 0;
        if (sortField === 'rssi') {
          compare = a.rssi - b.rssi;
        } else if (sortField === 'channel') {
          compare = a.channel - b.channel;
        } else if (sortField === 'ssid') {
          compare = (a.ssid || '').localeCompare(b.ssid || '');
        }
        return sortAsc ? compare : -compare;
      });
  }, [observations, searchTerm, selectedChannelFilter, sortField, sortAsc]);

  const toggleSort = (field: 'rssi' | 'channel' | 'ssid') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field !== 'rssi');
    }
  };

  // Signal level color helper
  const getRssiColor = (rssi: number) => {
    if (rssi >= -55) return 'text-emerald-700 font-bold';
    if (rssi >= -70) return 'text-blue-700 font-bold';
    if (rssi >= -82) return 'text-amber-700 font-medium';
    return 'text-rose-700';
  };

  const getRssiPercent = (rssi: number) => {
    const pct = ((rssi - -100) / 70) * 100;
    return Math.max(5, Math.min(100, Math.round(pct)));
  };

  const formatSecurity = (sec: string) => {
    return sec.replace('_PSK', '').replace('_', '/');
  };

  return (
    <section id="raw-wifi-observations" className="bg-white border border-[#141414] p-3.5 space-y-3 font-mono">
      {/* Header with Title and Classification Tag */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#141414] pb-2">
        <div>
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${isScanning ? 'text-amber-500 animate-spin' : 'text-[#141414]'}`} />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#141414]">
              Discovered Wi-Fi Networks ({observations.length} Access Points Active)
            </h2>
            <span className="text-[9px] uppercase px-2 py-0.5 bg-[#141414] text-white font-bold">
              Real-Time Feed
            </span>
          </div>
          <p className="text-[10px] text-neutral-600 mt-0.5">
            Active Scan Batch: {batchId} &bull; Live RSSI tracking with IEEE 802.11 beacon verification
          </p>
        </div>

        {/* Search & Channel Filter Controls */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-neutral-500" />
            <input
              id="input-search-ssid"
              type="text"
              placeholder="Filter SSID / BSSID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs pl-7 pr-2.5 py-1 bg-white border border-[#141414] text-[#141414] w-44 focus:outline-none focus:ring-1 focus:ring-[#141414]"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-neutral-500" />
            <select
              id="select-channel-filter"
              value={selectedChannelFilter}
              onChange={(e) => setSelectedChannelFilter(e.target.value)}
              className="text-xs bg-white border border-[#141414] py-1 px-2 text-[#141414] cursor-pointer"
            >
              <option value="ALL">All Channels</option>
              <option value="1">Channel 1</option>
              <option value="6">Channel 6</option>
              <option value="11">Channel 11</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto border border-[#141414]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-neutral-100 border-b border-[#141414] text-[10px] uppercase font-bold text-[#141414]">
              <th
                onClick={() => toggleSort('ssid')}
                className="p-2 cursor-pointer hover:bg-neutral-200 border-r border-[#141414]"
              >
                <div className="flex items-center gap-1">
                  <span>SSID (Network)</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th className="p-2 border-r border-[#141414]">BSSID (MAC Address)</th>
              <th
                onClick={() => toggleSort('channel')}
                className="p-2 cursor-pointer hover:bg-neutral-200 border-r border-[#141414] text-center w-24"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Channel</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th
                onClick={() => toggleSort('rssi')}
                className="p-2 cursor-pointer hover:bg-neutral-200 border-r border-[#141414] text-right w-48"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>RSSI (dBm)</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th className="p-2 border-r border-[#141414] text-center w-28">Security</th>
              <th className="p-2 text-right w-24">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filteredObservations.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-neutral-500 italic">
                  No access points match the filter criteria.
                </td>
              </tr>
            ) : (
              filteredObservations.map((obs) => {
                const isNonOverlapping = [1, 6, 11].includes(obs.channel);
                return (
                  <tr key={obs.id} className="hover:bg-neutral-50 transition-colors">
                    {/* SSID */}
                    <td className="p-2 border-r border-[#141414] font-bold text-[#141414]">
                      <div className="flex items-center gap-2">
                        <Signal className={`w-3.5 h-3.5 shrink-0 ${obs.rssi >= -60 ? 'text-emerald-600' : 'text-neutral-500'}`} />
                        <span className="truncate max-w-[200px]">
                          {obs.ssid || <span className="text-neutral-400 italic">&lt;Hidden Network&gt;</span>}
                        </span>
                      </div>
                    </td>

                    {/* BSSID */}
                    <td className="p-2 border-r border-[#141414] text-neutral-600 text-[11px]">
                      {obs.bssid}
                    </td>

                    {/* Channel */}
                    <td className="p-2 border-r border-[#141414] text-center font-bold">
                      <span className={`px-2 py-0.5 border text-[11px] ${
                        isNonOverlapping
                          ? 'bg-neutral-100 text-[#141414] border-black/30'
                          : 'bg-amber-100 text-amber-900 border-amber-600'
                      }`}>
                        CH {obs.channel}
                      </span>
                    </td>

                    {/* RSSI Signal Strength with Bar */}
                    <td className="p-2 border-r border-[#141414] text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        {/* Graphical mini bar */}
                        <div className="w-20 bg-neutral-200 h-2 border border-black/20 overflow-hidden hidden sm:block">
                          <div
                            className={`h-full transition-all duration-500 ${
                              obs.rssi >= -60
                                ? 'bg-emerald-600'
                                : obs.rssi >= -75
                                ? 'bg-blue-600'
                                : 'bg-rose-600'
                            }`}
                            style={{ width: `${getRssiPercent(obs.rssi)}%` }}
                          />
                        </div>
                        <span className={`text-[11px] w-14 font-mono ${getRssiColor(obs.rssi)}`}>
                          {obs.rssi} dBm
                        </span>
                      </div>
                    </td>

                    {/* Security */}
                    <td className="p-2 border-r border-[#141414] text-center">
                      <div className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-neutral-100 border border-black/20">
                        {obs.securityType === 'OPEN' ? (
                          <Unlock className="w-2.5 h-2.5 text-neutral-500" />
                        ) : (
                          <Lock className="w-2.5 h-2.5 text-neutral-700" />
                        )}
                        <span>{formatSecurity(obs.securityType)}</span>
                      </div>
                    </td>

                    {/* Last Seen */}
                    <td className="p-2 text-right text-neutral-500 text-[10px]">
                      {formatObservedAge(obs.timestamp, now)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
