import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { processRawObservations } from './src/services/derivedParameters';
import { generateSimulatedScan } from './src/services/simulator';
import {
  RawScanBatch,
  RawWiFiObservation,
  DerivedAnalysis,
  SimulatorEnvironmentProfile,
} from './src/types/wifi';

const PORT = 3000;

interface StoredScanRecord {
  batch: RawScanBatch;
  derived: DerivedAnalysis;
}

// In-Memory Development Data Layer (Retains last 50 scans)
const scanHistory: StoredScanRecord[] = [];
let latestRecord: StoredScanRecord | null = null;

// Initialize with a default baseline scan from the simulator
const initialBatch = generateSimulatedScan('MODERATE_DENSITY');
const initialDerived = processRawObservations(
  initialBatch.observations,
  initialBatch.batchId,
  initialBatch.timestamp
);
latestRecord = { batch: initialBatch, derived: initialDerived };
scanHistory.push(latestRecord);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // ==========================================
  // REST API ENDPOINTS
  // ==========================================

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Wi-Fi Interference Detection Platform Backend',
      sensorAttached: latestRecord?.batch.source === 'ESP32_HARDWARE',
      storedScansCount: scanHistory.length,
      timestamp: Date.now(),
    });
  });

  // Latest scan and derived parameters
  app.get('/api/scan/latest', (req: Request, res: Response) => {
    if (!latestRecord) {
      return res.status(404).json({ error: 'No scan data available yet' });
    }
    res.json(latestRecord);
  });

  // Recent scan history
  app.get('/api/scan/history', (req: Request, res: Response) => {
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const recent = scanHistory.slice(-limit);
    res.json(recent);
  });

  /**
   * ESP32 PHYSICAL SENSOR INGESTION ENDPOINT
   * This is the exact production contract for the real ESP32 microcontroller.
   * Accepts JSON payloads sent via HTTP POST from the ESP32 WiFiClient.
   */
  app.post('/api/scan/ingest', (req: Request, res: Response) => {
    try {
      const body = req.body;

      if (!body || !Array.isArray(body.observations)) {
        return res.status(400).json({
          error: 'Invalid payload schema. Expected { observations: [...] }',
          expectedFields: ['ssid', 'bssid', 'rssi', 'channel'],
        });
      }

      const timestamp = Date.now();
      const batchId = body.batchId || `esp32-batch-${timestamp}-${Math.floor(Math.random() * 1000)}`;
      const sensorId = body.sensorId || 'ESP32-HARDWARE-NODE';
      const scanDurationMs = typeof body.scanDurationMs === 'number' ? body.scanDurationMs : 1500;

      // Map and validate raw observations
      const observations: RawWiFiObservation[] = body.observations.map(
        (obs: any, index: number): RawWiFiObservation => ({
          id: obs.id || `esp32-obs-${timestamp}-${index}`,
          timestamp: typeof obs.timestamp === 'number' ? obs.timestamp : timestamp,
          ssid: typeof obs.ssid === 'string' ? obs.ssid : '',
          bssid: typeof obs.bssid === 'string' ? obs.bssid.toUpperCase() : '00:00:00:00:00:00',
          rssi: typeof obs.rssi === 'number' ? obs.rssi : -80,
          channel: typeof obs.channel === 'number' ? obs.channel : 1,
          securityType: obs.securityType || 'UNKNOWN',
          bandwidthMhz: obs.bandwidthMhz === 40 ? 40 : 20,
          source: 'ESP32_HARDWARE', // Marked explicitly as physical hardware data
        })
      );

      const rawBatch: RawScanBatch = {
        batchId,
        timestamp,
        scanDurationMs,
        sensorId,
        observations,
        source: 'ESP32_HARDWARE',
      };

      // Run real derived parameter calculation engine
      const derived = processRawObservations(rawBatch.observations, batchId, timestamp);

      const record: StoredScanRecord = { batch: rawBatch, derived };
      latestRecord = record;
      scanHistory.push(record);
      if (scanHistory.length > 50) {
        scanHistory.shift();
      }

      console.log(`[INGEST] ESP32 Scan Received: ${observations.length} APs from sensor ${sensorId}`);

      res.status(201).json({
        success: true,
        message: 'ESP32 observation batch successfully ingested and processed',
        batchId,
        observationsProcessed: observations.length,
        derivedSummary: {
          overallSeverity: derived.overallSeverity,
          worstChannel: derived.worstChannel,
          recommendedChannel: derived.recommendedChannel,
        },
      });
    } catch (err: any) {
      console.error('[INGEST ERROR]', err);
      res.status(500).json({ error: 'Failed to ingest ESP32 scan', details: err.message });
    }
  });

  /**
   * TRIGGER SIMULATOR SWEEP (Server-side trigger)
   */
  app.post('/api/simulator/trigger', (req: Request, res: Response) => {
    const profile = (req.body?.profile as SimulatorEnvironmentProfile) || 'MODERATE_DENSITY';
    const batch = generateSimulatedScan(profile);
    const derived = processRawObservations(batch.observations, batch.batchId, batch.timestamp);

    const record: StoredScanRecord = { batch, derived };
    latestRecord = record;
    scanHistory.push(record);
    if (scanHistory.length > 50) {
      scanHistory.shift();
    }

    res.json(record);
  });

  // ==========================================
  // VITE MIDDLEWARE / STATIC ASSETS
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telecommunications Platform Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
