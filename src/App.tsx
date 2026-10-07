import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { ScannerControls } from './components/ScannerControls';
import { DerivedSummary } from './components/DerivedSummary';
import { ChannelMetricsView } from './components/ChannelMetricsView';
import { RawObservationTable } from './components/RawObservationTable';
import { FuturePerformanceMetrics } from './components/FuturePerformanceMetrics';
import { Esp32IntegrationModal } from './components/Esp32IntegrationModal';
import { ArchitectureModal } from './components/ArchitectureModal';
import {
  RawScanBatch,
  DerivedAnalysis,
  SimulatorEnvironmentProfile,
  ChannelMetrics,
} from './types/wifi';
import { liveScanner } from './services/wifiDataSource';
import { triggerScan, fetchLatestScan } from './services/apiClient';

export default function App() {
  // Primary application state
  const [profile, setProfile] = useState<SimulatorEnvironmentProfile>('MODERATE_DENSITY');
  const [currentBatch, setCurrentBatch] = useState<RawScanBatch | null>(null);
  const [derivedAnalysis, setDerivedAnalysis] = useState<DerivedAnalysis | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(true); // Default active live scanning as requested
  const [scanIntervalSec, setScanIntervalSec] = useState(4); // 4 seconds between scans
  const [scanCount, setScanCount] = useState(1);
  const [lastScanTimeMs, setLastScanTimeMs] = useState(Date.now());

  // Modals state
  const [isArchModalOpen, setIsArchModalOpen] = useState(false);
  const [isEsp32ModalOpen, setIsEsp32ModalOpen] = useState(false);

  // Reference for stable timer loop
  const autoScanRef = useRef(autoScan);
  autoScanRef.current = autoScan;
  const isScanningRef = useRef(isScanning);
  isScanningRef.current = isScanning;

  // Execute a single scan sweep with realistic scan indicator transition
  const handleExecuteScan = useCallback(
    async (targetProfile = profile) => {
      if (isScanningRef.current) return;
      setIsScanning(true);

      // Brief realistic scan sweep duration (800ms) to show active animated state
      await new Promise((resolve) => setTimeout(resolve, 850));

      try {
        const response = await triggerScan(targetProfile);
        setCurrentBatch(response.batch);
        setDerivedAnalysis(response.derived);
        setScanCount((prev) => prev + 1);
        setLastScanTimeMs(response.batch.timestamp);
      } catch (err) {
        console.warn('Backend sweep trigger failed, falling back to local live scanner:', err);
        const local = liveScanner.sweepScan();
        setCurrentBatch(local.batch);
        setDerivedAnalysis(local.derived);
        setScanCount((prev) => prev + 1);
        setLastScanTimeMs(local.batch.timestamp);
      } finally {
        setIsScanning(false);
      }
    },
    [profile]
  );

  // Initial scan load
  useEffect(() => {
    async function loadInitial() {
      try {
        const initial = await fetchLatestScan();
        setCurrentBatch(initial.batch);
        setDerivedAnalysis(initial.derived);
        setLastScanTimeMs(initial.batch.timestamp);
      } catch {
        const local = liveScanner.sweepScan();
        setCurrentBatch(local.batch);
        setDerivedAnalysis(local.derived);
        setLastScanTimeMs(local.batch.timestamp);
      }
    }
    loadInitial();
  }, []);

  // Scenario switch trigger
  const handleProfileChange = (newProfile: SimulatorEnvironmentProfile) => {
    setProfile(newProfile);
    liveScanner.setScenario(newProfile);
    handleExecuteScan(newProfile);
  };

  // Continuous Auto-Scan Interval Loop (3–6 seconds cadence)
  useEffect(() => {
    if (!autoScan) return;

    const timer = setInterval(() => {
      if (autoScanRef.current && !isScanningRef.current) {
        handleExecuteScan();
      }
    }, scanIntervalSec * 1000);

    return () => clearInterval(timer);
  }, [autoScan, scanIntervalSec, handleExecuteScan]);

  // System Uptime counter for high-density footer
  const [uptimeSec, setUptimeSec] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setUptimeSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const detectedCount = currentBatch?.observations.length || 0;
  const activeChannelsCount = derivedAnalysis
    ? (Object.values(derivedAnalysis.channels) as ChannelMetrics[]).filter((c) => c.apCount > 0).length
    : 0;
  const strongestRssi = derivedAnalysis
    ? Math.max(...(Object.values(derivedAnalysis.channels) as ChannelMetrics[]).map((c) => c.strongestRssi))
    : -100;

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] flex flex-col font-sans selection:bg-[#141414] selection:text-white">
      {/* Header */}
      <Header
        source={currentBatch?.source || 'SIMULATED'}
        batchId={currentBatch?.batchId || 'CYCLE-0001'}
        timestamp={currentBatch?.timestamp || Date.now()}
        scanDurationMs={currentBatch?.scanDurationMs || 1500}
        isScanning={isScanning}
        onOpenArchitecture={() => setIsArchModalOpen(true)}
        onOpenEsp32Modal={() => setIsEsp32ModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 space-y-4">
        {/* Active Wi-Fi Scanner Controls & Status Radar */}
        <ScannerControls
          currentProfile={profile}
          onProfileChange={handleProfileChange}
          onTriggerScan={() => handleExecuteScan()}
          isScanning={isScanning}
          autoScan={autoScan}
          onToggleAutoScan={() => setAutoScan(!autoScan)}
          scanIntervalSec={scanIntervalSec}
          onIntervalChange={setScanIntervalSec}
          scanCount={scanCount}
          lastScanTimeMs={lastScanTimeMs}
          detectedCount={detectedCount}
          activeChannelsCount={activeChannelsCount}
          strongestRssi={strongestRssi}
          interferenceSeverity={derivedAnalysis?.overallSeverity || 'NORMAL'}
          congestionScorePct={Math.round((derivedAnalysis?.overallCongestionScore || 0) * 100)}
          recommendedChannel={derivedAnalysis?.recommendedChannel || 11}
        />

        {/* Real-Time Telemetry & Interference Classification Summary Cards */}
        {derivedAnalysis && (
          <DerivedSummary
            derived={derivedAnalysis}
            totalAPs={detectedCount}
            isScanning={isScanning}
            scanCount={scanCount}
            lastScanTimeMs={lastScanTimeMs}
          />
        )}

        {/* Spectral Channel Congestion Analysis (Recharts & Channel Table) */}
        {derivedAnalysis && (
          <ChannelMetricsView
            channels={derivedAnalysis.channels}
            worstChannel={derivedAnalysis.worstChannel}
            recommendedChannel={derivedAnalysis.recommendedChannel}
          />
        )}

        {/* Live Raw Observation Feed (Dynamic Access Points) */}
        {currentBatch && (
          <RawObservationTable
            observations={currentBatch.observations}
            batchId={currentBatch.batchId}
            isScanning={isScanning}
          />
        )}

        {/* Performance Evaluation Contract Card (Before/After Mitigation) */}
        <FuturePerformanceMetrics />
      </main>

      {/* High Density Industrial Telemetry Footer */}
      <footer className="bg-[#141414] text-white border-t border-black px-4 py-2.5 flex flex-wrap items-center justify-between text-[10px] font-mono gap-3">
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          <div>
            <span className="opacity-50">SYS_UPTIME:</span> {formatUptime(uptimeSec)}
          </div>
          <div>
            <span className="opacity-50">SCAN_CADENCE:</span>{' '}
            {autoScan ? `${(1 / scanIntervalSec).toFixed(2)} Hz (every ${scanIntervalSec}s)` : 'MANUAL'}
          </div>
          <div>
            <span className="opacity-50">SCAN_CYCLE:</span> #{scanCount}
          </div>
          <div>
            <span className="opacity-50">RADIO_PHY:</span>{' '}
            {currentBatch?.source === 'ESP32_HARDWARE' ? 'ESP32_INGEST_LIVE' : 'RF_SPECTRUM_EMULATOR'}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-400 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Status: Continuous Scanner Operational</span>
        </div>
      </footer>

      {/* Modals */}
      <Esp32IntegrationModal
        isOpen={isEsp32ModalOpen}
        onClose={() => setIsEsp32ModalOpen(false)}
      />
      <ArchitectureModal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
      />
    </div>
  );
}
