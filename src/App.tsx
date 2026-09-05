import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { SimulatorControls } from './components/SimulatorControls';
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
} from './types/wifi';
import { generateSimulatedScan } from './services/simulator';
import { processRawObservations } from './services/derivedParameters';
import { fetchLatestScan, triggerScan } from './services/apiClient';

export default function App() {
  // Primary application state
  const [profile, setProfile] = useState<SimulatorEnvironmentProfile>('MODERATE_DENSITY');
  const [currentBatch, setCurrentBatch] = useState<RawScanBatch | null>(null);
  const [derivedAnalysis, setDerivedAnalysis] = useState<DerivedAnalysis | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [scanIntervalSec, setScanIntervalSec] = useState(4);

  // Modals state
  const [isArchModalOpen, setIsArchModalOpen] = useState(false);
  const [isEsp32ModalOpen, setIsEsp32ModalOpen] = useState(false);

  // Reference to hold autoScan state in interval
  const autoScanRef = useRef(autoScan);
  autoScanRef.current = autoScan;

  // Execute a single scan sweep (delegates to REST API or local simulator)
  const handleExecuteScan = useCallback(
    async (targetProfile = profile) => {
      setIsScanning(true);
      try {
        const response = await triggerScan(targetProfile);
        setCurrentBatch(response.batch);
        setDerivedAnalysis(response.derived);
      } catch (err) {
        console.warn('Backend sweep trigger failed, falling back to local simulator engine:', err);
        const batch = generateSimulatedScan(targetProfile);
        const derived = processRawObservations(batch.observations, batch.batchId, batch.timestamp);
        setCurrentBatch(batch);
        setDerivedAnalysis(derived);
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
        const response = await fetchLatestScan();
        setCurrentBatch(response.batch);
        setDerivedAnalysis(response.derived);
      } catch {
        const batch = generateSimulatedScan('MODERATE_DENSITY');
        const derived = processRawObservations(batch.observations, batch.batchId, batch.timestamp);
        setCurrentBatch(batch);
        setDerivedAnalysis(derived);
      }
    }
    loadInitial();
  }, []);

  // Profile switch trigger
  const handleProfileChange = (newProfile: SimulatorEnvironmentProfile) => {
    setProfile(newProfile);
    handleExecuteScan(newProfile);
  };

  // Auto sweep timer loop
  useEffect(() => {
    if (!autoScan) return;

    const timer = setInterval(() => {
      if (autoScanRef.current) {
        handleExecuteScan();
      }
    }, scanIntervalSec * 1000);

    return () => clearInterval(timer);
  }, [autoScan, scanIntervalSec, handleExecuteScan]);

  // Uptime counter for high density telemetry footer
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

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] flex flex-col font-sans selection:bg-[#141414] selection:text-white">
      {/* Header */}
      <Header
        source={currentBatch?.source || 'SIMULATED'}
        batchId={currentBatch?.batchId || 'INITIALIZING'}
        timestamp={currentBatch?.timestamp || Date.now()}
        scanDurationMs={currentBatch?.scanDurationMs || 0}
        onOpenArchitecture={() => setIsArchModalOpen(true)}
        onOpenEsp32Modal={() => setIsEsp32ModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 space-y-4">
        {/* Simulator Controls & Environmental Profile Selector */}
        <SimulatorControls
          currentProfile={profile}
          onProfileChange={handleProfileChange}
          onTriggerScan={() => handleExecuteScan()}
          isScanning={isScanning}
          autoScan={autoScan}
          onToggleAutoScan={() => setAutoScan(!autoScan)}
          scanIntervalSec={scanIntervalSec}
          onIntervalChange={setScanIntervalSec}
        />

        {/* Derived Telemetry Summary Cards */}
        {derivedAnalysis && (
          <DerivedSummary
            derived={derivedAnalysis}
            totalAPs={currentBatch?.observations.length || 0}
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

        {/* Raw Observation Table (Direct Sensor Telemetry Stream) */}
        {currentBatch && (
          <RawObservationTable
            observations={currentBatch.observations}
            batchId={currentBatch.batchId}
          />
        )}

        {/* Future Network Performance Contract Card */}
        <FuturePerformanceMetrics />
      </main>

      {/* High Density Industrial Telemetry Footer */}
      <footer className="bg-[#141414] text-white border-t border-black px-4 py-2.5 flex flex-wrap items-center justify-between text-[10px] font-mono gap-3">
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          <div>
            <span className="opacity-50">SYS_UPTIME:</span> {formatUptime(uptimeSec)}
          </div>
          <div>
            <span className="opacity-50">SAMPLING_RATE:</span>{' '}
            {autoScan ? `${(1 / scanIntervalSec).toFixed(2)} Hz` : 'ON-DEMAND'}
          </div>
          <div>
            <span className="opacity-50">ENGINE:</span>{' '}
            {currentBatch?.source === 'ESP32_HARDWARE' ? 'ESP32_INGEST_V1.0' : 'SIM_V1.0_PROTOTYPE'}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-widest font-bold text-orange-400">
          Experimental Environment: [{currentBatch?.source === 'ESP32_HARDWARE' ? 'ESP32 HARDWARE' : 'Simulated'}]
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
