import React from 'react';
import { BrainCircuit } from 'lucide-react';
import { CongestionPrediction } from '../services/esp32Api';
import { DashboardDataSource } from '../types/wifi';

interface AiPredictionCardProps {
  dataSource: DashboardDataSource;
  prediction: CongestionPrediction;
}

const CLASS_TEXT: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = {
  LOW: 'text-blue-700',
  MEDIUM: 'text-amber-700',
  HIGH: 'text-rose-700',
};

const STATUS_TEXT: Record<string, string> = {
  ready: 'Model status: ready',
  model_missing: 'Model status: trained model file is not available',
  no_fresh_scan: 'Model status: waiting for a fresh ESP32 scan',
  stale_scan: 'Model status: latest scan is stale, so no class is shown',
  prediction_failed: 'Model status: this scan could not be classified',
  api_unavailable: 'Model status: prediction API is not reachable',
};

export const AiPredictionCard: React.FC<AiPredictionCardProps> = ({ dataSource, prediction }) => {
  const simulation = dataSource === 'simulation';
  const predicted = !simulation && prediction.status === 'ok' ? prediction.predictedClass : null;

  return (
    <section id="ai-prediction" className="bg-white border border-[#141414] p-3.5 font-mono">
      <div className="flex items-start justify-between gap-3 border-b border-black/10 pb-1.5">
        <span className="text-[10px] uppercase font-bold tracking-wider">Random Forest prediction</span>
        <BrainCircuit className="w-4 h-4" />
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className={`text-2xl font-black tracking-tight ${predicted ? CLASS_TEXT[predicted] : 'text-neutral-500'}`}>
            {predicted ? `${predicted} congestion risk` : 'Unavailable'}
          </div>
          <p className="mt-1 text-[11px] text-neutral-700 max-w-3xl">
            {simulation
              ? 'Simulation keeps the existing heuristic. The Random Forest classifies fresh ESP32 scans only.'
              : 'Heuristic-trained demonstration model. This class imitates a documented rule and is not measured interference ground truth.'}
          </p>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-neutral-600">
          {simulation ? 'Model status: not applied to simulation' : STATUS_TEXT[prediction.modelStatus] || `Model status: ${prediction.modelStatus}`}
        </p>
      </div>
    </section>
  );
};
