import React, { useState, useMemo } from 'react';
import { RawWiFiObservation } from '../types/wifi';
import { Search, Filter, ArrowUpDown, Lock, Unlock, Radio } from 'lucide-react';

interface RawObservationTableProps {
  observations: RawWiFiObservation[];
  batchId: string;
}

export const RawObservationTable: React.FC<RawObservationTableProps> = ({
  observations,
  batchId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'rssi' | 'channel' | 'ssid'>('rssi');
  const [sortAsc, setSortAsc] = useState(false);

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
      setSortAsc(field !== 'rssi'); // default rssi descending (strongest first)
    }
  };

  // Signal level color helper
  const getRssiColor = (rssi: number) => {
    if (rssi >= -55) return 'text-emerald-600 font-semibold';
    if (rssi >= -70) return 'text-blue-600 font-medium';
    if (rssi >= -82) return 'text-amber-600';
    return 'text-rose-600';
  };

  // Visual RSSI strength bar percentage
  const getRssiPercent = (rssi: number) => {
    // -100 dBm is 0%, -30 dBm is 100%
    const pct = ((rssi - -100) / 70) * 100;
    return Math.max(5, Math.min(100, Math.round(pct)));
  };

  return (
    <section id="raw-wifi-observations" className="bg-white border border-[#141414] p-3.5 space-y-3">
      {/* Header with Title and Classification Tag */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#141414] pb-2">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#141414]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#141414] font-mono">
              Raw 802.11 Wi-Fi Observation Stream
            </h2>
            <span className="text-[9px] font-mono uppercase px-2 py-0.5 bg-[#141414] text-white font-bold">
              Physical Sensor Layer
            </span>
          </div>
          <p className="text-[10px] text-neutral-600 font-mono mt-0.5">
            Active Batch: {batchId} ({observations.length} discrete BSSID records captured)
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
              className="text-xs font-mono pl-7 pr-2.5 py-1 bg-white border border-[#141414] text-[#141414] w-44 focus:outline-none focus:ring-1 focus:ring-[#141414]"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-[#141414]" />
            <select
              id="select-filter-channel"
              value={selectedChannelFilter}
              onChange={(e) => setSelectedChannelFilter(e.target.value)}
              className="text-xs font-mono bg-white border border-[#141414] px-2 py-1 text-[#141414] focus:outline-none"
            >
              <option value="ALL">All Ch (1-14)</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((ch) => (
                <option key={ch} value={ch.toString()}>
                  Ch {ch}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Raw Observation Data Table */}
      <div className="overflow-x-auto border border-[#141414]">
        <table id="raw-observations-table" className="w-full text-left text-[11px] font-mono">
          <thead className="bg-neutral-100 text-[#141414] border-b border-[#141414]">
            <tr>
              <th
                onClick={() => toggleSort('ssid')}
                className="py-1.5 px-2.5 font-bold uppercase text-[10px] cursor-pointer hover:bg-neutral-200 select-none"
              >
                <div className="flex items-center gap-1">
                  <span>SSID (Network Name)</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px]">BSSID (MAC Address)</th>
              <th
                onClick={() => toggleSort('channel')}
                className="py-1.5 px-2.5 font-bold uppercase text-[10px] cursor-pointer hover:bg-neutral-200 select-none"
              >
                <div className="flex items-center gap-1">
                  <span>Channel</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th
                onClick={() => toggleSort('rssi')}
                className="py-1.5 px-2.5 font-bold uppercase text-[10px] cursor-pointer hover:bg-neutral-200 select-none"
              >
                <div className="flex items-center gap-1">
                  <span>RSSI (dBm)</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px]">Security Cipher</th>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px]">Provenance</th>
              <th className="py-1.5 px-2.5 font-bold uppercase text-[10px] text-right">Captured Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {filteredObservations.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-neutral-500 font-mono">
                  No Wi-Fi observations match the current filter criteria.
                </td>
              </tr>
            ) : (
              filteredObservations.map((obs) => {
                const rssiPct = getRssiPercent(obs.rssi);
                const isNonStdChannel = ![1, 6, 11].includes(obs.channel);
                const isOpenAuth = obs.securityType === 'OPEN';

                return (
                  <tr key={obs.id} className="hover:bg-neutral-100 transition-colors">
                    {/* SSID */}
                    <td className="py-1.5 px-2.5 font-mono font-bold text-[#141414]">
                      <div className="flex items-center gap-2">
                        {isOpenAuth ? (
                          <Unlock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        )}
                        <span className="truncate max-w-[180px]">
                          {obs.ssid ? obs.ssid : <span className="text-neutral-400 italic font-normal">&lt;Hidden SSID&gt;</span>}
                        </span>
                      </div>
                    </td>

                    {/* BSSID */}
                    <td className="py-1.5 px-2.5 text-neutral-700 font-mono tracking-tight">
                      {obs.bssid}
                    </td>

                    {/* Primary Channel */}
                    <td className="py-1.5 px-2.5 font-bold text-[#141414]">
                      <div className="inline-flex items-center gap-1.5">
                        <span>CH {obs.channel}</span>
                        {isNonStdChannel && (
                          <span className="text-[9px] px-1 py-0.2 border border-[#141414] bg-neutral-100 text-[#141414] font-normal">
                            Bleed
                          </span>
                        )}
                      </div>
                    </td>

                    {/* RSSI Signal Level */}
                    <td className="py-1.5 px-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-14 font-mono font-bold ${getRssiColor(obs.rssi)}`}>
                          {obs.rssi} dBm
                        </span>
                        <div className="w-14 h-1.5 bg-neutral-200 border border-black/20">
                          <div
                            className={`h-full ${
                              obs.rssi >= -60
                                ? 'bg-emerald-700'
                                : obs.rssi >= -75
                                ? 'bg-blue-700'
                                : obs.rssi >= -85
                                ? 'bg-amber-600'
                                : 'bg-[#D00]'
                            }`}
                            style={{ width: `${rssiPct}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Security */}
                    <td className="py-1.5 px-2.5 text-neutral-700">
                      <span className="px-1 py-0.5 border border-black/20 bg-neutral-100 text-[10px]">
                        {obs.securityType}
                      </span>
                    </td>

                    {/* Source Origin */}
                    <td className="py-1.5 px-2.5">
                      <span
                        className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border border-[#141414] ${
                          obs.source === 'SIMULATED'
                            ? 'bg-neutral-100 text-[#141414]'
                            : 'bg-emerald-100 text-emerald-900'
                        }`}
                      >
                        {obs.source}
                      </span>
                    </td>

                    {/* Timestamp */}
                    <td className="py-1.5 px-2.5 text-right text-neutral-600 text-[10px] font-mono">
                      {new Date(obs.timestamp).toLocaleTimeString()}
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
