import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { ScannerControls } from './components/ScannerControls';
import { DerivedSummary } from './components/DerivedSummary';
import { ChannelMetricsView } from './components/ChannelMetricsView';
import { RawObservationTable } from './components/RawObservationTable';
import { FuturePerformanceMetrics } from './components/FuturePerformanceMetrics';
import { AiPredictionCard } from './components/AiPredictionCard';
import { Esp32IntegrationModal } from './components/Esp32IntegrationModal';
import { ArchitectureModal } from './components/ArchitectureModal';
import {
  RawScanBatch,
  DerivedAnalysis,
  SimulatorEnvironmentProfile,
  ChannelMetrics,
  DashboardDataSource,
  Esp32LinkState,
  DataSourceOrigin,
} from './types/wifi';
import { liveScanner } from './services/wifiDataSource';
import { triggerScan } from './services/apiClient';
import {
  CongestionPrediction,
  ESP32_LINK_LABEL,
  ESP32_POLL_INTERVAL_MS,
  PREDICTION_UNAVAILABLE,
  pollEsp32,
} from './services/esp32Api';

interface SourceSnapshot {
  batch: RawScanBatch | null;
  derived: DerivedAnalysis | null;
  scanCount: number;
}

const EMPTY_SNAPSHOT: SourceSnapshot = { batch: null, derived: null, scanCount: 0 };

function measuredStrongestRssi(derived: DerivedAnalysis | null): number | null {
  if (!derived) return null;
  const values = (Object.values(derived.channels) as ChannelMetrics[])
    .filter((channel) => channel.apCount > 0)
    .map((channel) => channel.strongestRssi);
  return values.length > 0 ? Math.max(...values) : null;
}

function connectionTone(link: Esp32LinkState): 'live' | 'warn' | 'down' {
  if (link === 'fresh') return 'live';
  if (link === 'stale' || link === 'waiting') return 'warn';
  return 'down';
}

export default function App() {
  const [profile, setProfile] = useState<SimulatorEnvironmentProfile>('MODERATE_DENSITY');
  const [dataSource, setDataSource] = useState<DashboardDataSource>('esp32');
  const [simSnapshot, setSimSnapshot] = useState<SourceSnapshot>(EMPTY_SNAPSHOT);
  const [espSnapshot, setEspSnapshot] = useState<SourceSnapshot>(EMPTY_SNAPSHOT);
  const [linkState, setLinkState] = useState<Esp32LinkState>('waiting');
  const [linkDetail, setLinkDetail] = useState('Contacting the ESP32 API.');
  const [prediction, setPrediction] = useState<CongestionPrediction>(PREDICTION_UNAVAILABLE);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(true);
  const [scanIntervalSec, setScanIntervalSec] = useState(4);

  const [isArchModalOpen, setIsArchModalOpen] = useState(false);
  const [isEsp32ModalOpen, setIsEsp32ModalOpen] = useState(false);

  const autoScanRef = useRef(autoScan);
  autoScanRef.current = autoScan;
  const isScanningRef = useRef(isScanning);
  isScanningRef.current = isScanning;
  const dataSourceRef = useRef(dataSource);
  dataSourceRef.current = dataSource;
  const espScanKeyRef = useRef<string | null>(null);
  const pollLockRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const simLoadedRef = useRef(false);

  const activeSnapshot = dataSource === 'esp32' ? espSnapshot : simSnapshot;
  const currentBatch = activeSnapshot.batch;
  const derivedAnalysis = activeSnapshot.derived;

  const handleExecuteScan = useCallback(
    async (targetProfile = profile) => {
      if (dataSourceRef.current !== 'simulation') return;
      if (isScanningRef.current) return;
      setIsScanning(true);

      await new Promise((resolve) => setTimeout(resolve, 850));
      if (dataSourceRef.current !== 'simulation') {
        setIsScanning(false);
        return;
      }

      try {
        const response = await triggerScan(targetProfile);
        setSimSnapshot((previous) => ({
          batch: response.batch,
          derived: response.derived,
          scanCount: previous.scanCount + 1,
        }));
      } catch (err) {
        console.warn('Backend sweep trigger failed, falling back to local live scanner:', err);
        const local = liveScanner.sweepScan();
        setSimSnapshot((previous) => ({
          batch: local.batch,
          derived: local.derived,
          scanCount: previous.scanCount + 1,
        }));
      } finally {
        setIsScanning(false);
      }
    },
    [profile]
  );

  const pollHardware = useCallback(async () => {
    if (dataSourceRef.current !== 'esp32' || pollLockRef.current) return;
    pollLockRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await pollEsp32(controller.signal);
      if (dataSourceRef.current !== 'esp32') return;

      setLinkState(result.link);
      setLinkDetail(result.detail);
      setPrediction(result.prediction);

      if (!result.ok || !result.scan) {
        if (result.ok && (result.link === 'waiting' || result.link === 'disconnected')) {
          espScanKeyRef.current = null;
          setEspSnapshot(EMPTY_SNAPSHOT);
        }
        return;
      }

      const isNewScan = espScanKeyRef.current !== result.scan.key;
      espScanKeyRef.current = result.scan.key;
      setEspSnapshot((previous) => ({
        batch: result.scan!.batch,
        derived: result.scan!.derived,
        scanCount: isNewScan ? previous.scanCount + 1 : previous.scanCount,
      }));
    } catch (error) {
      if (controller.signal.aborted || dataSourceRef.current !== 'esp32') return;
      console.warn('ESP32 poll failed:', error);
      setLinkState('unavailable');
      setLinkDetail('FastAPI did not respond. Previous ESP32 observations are unchanged.');
      setPrediction(PREDICTION_UNAVAILABLE);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        pollLockRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    if (dataSource !== 'esp32') return;

    void pollHardware();
    const timer = setInterval(() => {
      void pollHardware();
    }, ESP32_POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
      pollLockRef.current = false;
    };
  }, [dataSource, pollHardware]);

  useEffect(() => {
    if (dataSource !== 'simulation') return;
    if (simLoadedRef.current) return;
    simLoadedRef.current = true;
    void handleExecuteScan();
  }, [dataSource, handleExecuteScan]);

  useEffect(() => {
    if (dataSource !== 'simulation' || !autoScan) return;

    const timer = setInterval(() => {
      if (autoScanRef.current && !isScanningRef.current && dataSourceRef.current === 'simulation') {
        void handleExecuteScan();
      }
    }, scanIntervalSec * 1000);

    return () => clearInterval(timer);
  }, [dataSource, autoScan, scanIntervalSec, handleExecuteScan]);

  const handleProfileChange = (newProfile: SimulatorEnvironmentProfile) => {
    setProfile(newProfile);
    liveScanner.setScenario(newProfile);
    if (dataSource === 'simulation') {
      void handleExecuteScan(newProfile);
    }
  };

  const handleTrigger = () => {
    if (dataSource === 'esp32') {
      void pollHardware();
      return;
    }
    void handleExecuteScan();
  };

  const [uptimeSec, setUptimeSec] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setUptimeSec((seconds) => seconds + 1), 1000);
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
    ? (Object.values(derivedAnalysis.channels) as ChannelMetrics[]).filter((channel) => channel.apCount > 0).length
    : 0;
  const strongestRssi = measuredStrongestRssi(derivedAnalysis);
  const hardwareMode = dataSource === 'esp32';
  const displaySource: DataSourceOrigin = hardwareMode ? 'ESP32_HARDWARE' : 'SIMULATED';
  const displayScanning = !hardwareMode && isScanning;
  const lastScanTimeMs = currentBatch?.timestamp || 0;
  const footerStatus = hardwareMode
    ? `ESP32 ${ESP32_LINK_LABEL[linkState]}`
    : autoScan
      ? 'Simulation scanner operational'
      : 'Simulation scanner paused';

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] flex flex-col font-sans selection:bg-[#141414] selection:text-white">
      <Header
        source={currentBatch?.source || displaySource}
        batchId={currentBatch?.batchId || (hardwareMode ? 'ESP32-WAITING' : 'CYCLE-0000')}
        timestamp={currentBatch?.timestamp || 0}
        scanDurationMs={hardwareMode ? null : currentBatch?.scanDurationMs ?? null}
        isScanning={displayScanning}
        connectionLabel={hardwareMode ? `ESP32: ${ESP32_LINK_LABEL[linkState]}` : 'Wi-Fi Scanner: Active'}
        connectionTone={hardwareMode ? connectionTone(linkState) : 'live'}
        onOpenArchitecture={() => setIsArchModalOpen(true)}
        onOpenEsp32Modal={() => setIsEsp32ModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 space-y-4">
        <ScannerControls
          dataSource={dataSource}
          onDataSourceChange={setDataSource}
          linkState={linkState}
          linkDetail={linkDetail}
          currentProfile={profile}
          onProfileChange={handleProfileChange}
          onTriggerScan={handleTrigger}
          isScanning={displayScanning}
          autoScan={autoScan}
          onToggleAutoScan={() => setAutoScan(!autoScan)}
          scanIntervalSec={scanIntervalSec}
          onIntervalChange={setScanIntervalSec}
          scanCount={activeSnapshot.scanCount}
          lastScanTimeMs={lastScanTimeMs}
          detectedCount={detectedCount}
          activeChannelsCount={activeChannelsCount}
          strongestRssi={strongestRssi}
          interferenceSeverity={derivedAnalysis?.overallSeverity || 'NORMAL'}
          congestionScorePct={Math.round((derivedAnalysis?.overallCongestionScore || 0) * 100)}
          recommendedChannel={derivedAnalysis?.recommendedChannel || 0}
        />

        <AiPredictionCard dataSource={dataSource} prediction={prediction} />

        {hardwareMode && !currentBatch && (
          <section id="esp32-empty-state" className="bg-white border border-[#141414] p-4 font-mono text-xs">
            <p className="font-bold uppercase tracking-wider">{ESP32_LINK_LABEL[linkState]}</p>
            <p className="mt-1 text-neutral-700">{linkDetail}</p>
            <p className="mt-2 text-[11px] text-neutral-500">
              ESP32 Live does not fill this view with simulated networks.
            </p>
          </section>
        )}

        {derivedAnalysis && currentBatch && (
          <DerivedSummary
            derived={derivedAnalysis}
            totalAPs={detectedCount}
            isScanning={displayScanning}
            scanCount={activeSnapshot.scanCount}
            lastScanTimeMs={lastScanTimeMs}
            source={currentBatch.source}
            linkState={hardwareMode ? linkState : null}
          />
        )}

        {derivedAnalysis && currentBatch && (
          <ChannelMetricsView
            channels={derivedAnalysis.channels}
            worstChannel={derivedAnalysis.worstChannel}
            recommendedChannel={derivedAnalysis.recommendedChannel}
            datasetLabel={currentBatch.source === 'ESP32_HARDWARE' ? 'ESP32 measurements' : 'Simulation only'}
          />
        )}

        {currentBatch && (
          <RawObservationTable
            observations={currentBatch.observations}
            batchId={currentBatch.batchId}
            isScanning={displayScanning}
          />
        )}

        <FuturePerformanceMetrics />
      </main>

      <footer className="bg-[#141414] text-white border-t border-black px-4 py-2.5 flex flex-wrap items-center justify-between text-[10px] font-mono gap-3">
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          <div>
            <span className="opacity-50">SYS_UPTIME:</span> {formatUptime(uptimeSec)}
          </div>
          <div>
            <span className="opacity-50">SCAN_CADENCE:</span>{' '}
            {hardwareMode
              ? 'ESP32 poll 0.25 Hz (every 4s)'
              : autoScan
                ? `${(1 / scanIntervalSec).toFixed(2)} Hz (every ${scanIntervalSec}s)`
                : 'MANUAL'}
          </div>
          <div>
            <span className="opacity-50">SCAN_CYCLE:</span> #{activeSnapshot.scanCount}
          </div>
          <div>
            <span className="opacity-50">RADIO_PHY:</span>{' '}
            {hardwareMode ? 'ESP32_INGEST_LIVE' : 'RF_SPECTRUM_EMULATOR'}
          </div>
        </div>
        <div
          className={`text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 ${
            hardwareMode && linkState !== 'fresh' ? 'text-amber-300' : 'text-emerald-400'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              hardwareMode && (linkState === 'disconnected' || linkState === 'unavailable')
                ? 'bg-rose-400'
                : hardwareMode && linkState !== 'fresh'
                  ? 'bg-amber-300'
                  : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <span>Status: {footerStatus}</span>
        </div>
      </footer>

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
