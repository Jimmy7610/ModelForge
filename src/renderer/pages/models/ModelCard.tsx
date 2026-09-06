import React from 'react';
import { Box, Layers, Cpu, Database, HardDrive, AlertTriangle } from 'lucide-react';
import { ModelRecord } from '@shared/types';
import { useAppStore } from '@/store/AppStoreContext';
import './ModelCard.css';

interface ModelCardProps {
  model: ModelRecord;
  onSelect: (model: ModelRecord) => void;
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;

  if (bytes >= gb) {
    return `${(bytes / gb).toFixed(2)} GB`;
  }
  return `${(bytes / mb).toFixed(1)} MB`;
}

export function formatContextLength(ctx?: number | null): string {
  if (!ctx || ctx <= 0) return '—';
  if (ctx >= 1024) {
    return `${Math.round(ctx / 1024)}K`;
  }
  return `${ctx}`;
}

export const ModelCard: React.FC<ModelCardProps> = ({ model, onSelect }) => {
  const { activeModel } = useAppStore();
  const isAvailable = model.metadataStatus === 'available';
  const isLoaded = activeModel?.modelId === model.id;

  return (
    <div
      className={`panel model-card ${isLoaded ? 'is-active-loaded' : ''} ${!isAvailable ? 'has-error' : ''}`}
      onClick={() => onSelect(model)}
      title="Click to view full model details"
    >
      <div className="model-card-top">
        <div className="model-identity">
          <div className="model-icon-box">
            <Box size={18} />
          </div>
          <div className="model-title-group">
            <div className="model-name-row">
              <span className="model-title">{model.displayName}</span>
            </div>
            <span className="model-filename font-mono" title={model.fileName}>
              {model.fileName}
            </span>
          </div>
        </div>

        <div className="model-status-badge">
          {isLoaded ? (
            <span className="badge badge-success font-semibold" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10b981', color: '#34d399' }}>
              <span className="status-dot ready" style={{ backgroundColor: '#10b981', boxShadow: '0 0 6px #10b981' }} /> Active
            </span>
          ) : isAvailable ? (
            <span className="badge badge-local">
              <span className="status-dot ready" /> Available
            </span>
          ) : (
            <span className="badge badge-warning" title={model.metadataError}>
              <AlertTriangle size={10} /> Error
            </span>
          )}
        </div>
      </div>

      {/* Model Specifications Grid */}
      <div className="model-specs-grid">
        <div className="spec-col">
          <span className="spec-label">
            <Cpu size={11} /> Architecture
          </span>
          <span className="spec-value font-mono">
            {model.architecture || 'Unknown'}
          </span>
        </div>

        <div className="spec-col">
          <span className="spec-label">
            <Layers size={11} /> Quantization
          </span>
          <div className="spec-quant-row">
            <span className="spec-value font-mono">
              {model.quantization || 'Unknown'}
            </span>
            {model.quantizationSource === 'filename' && (
              <span className="quant-source-tag" title="Inferred from filename">
                file
              </span>
            )}
          </div>
        </div>

        <div className="spec-col">
          <span className="spec-label">
            <HardDrive size={11} /> File Size
          </span>
          <span className="spec-value font-mono">
            {formatFileSize(model.sizeBytes)}
          </span>
        </div>

        <div className="spec-col">
          <span className="spec-label">
            <Database size={11} /> Context
          </span>
          <span className="spec-value font-mono">
            {formatContextLength(model.contextLength)}
          </span>
        </div>
      </div>

      <div className="model-card-footer">
        <span className="model-location font-mono" title={model.path}>
          {model.path}
        </span>
        <span className="model-inspect-link">Inspect</span>
      </div>
    </div>
  );
};
