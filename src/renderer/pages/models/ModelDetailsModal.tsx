import React, { useEffect } from 'react';
import {
  X,
  Box,
  Cpu,
  Layers,
  HardDrive,
  Database,
  Calendar,
  Folder,
  AlertCircle,
  FileCode,
  Shield,
  Play,
} from 'lucide-react';
import { ModelRecord } from '@shared/types';
import { formatFileSize, formatContextLength } from './ModelCard';
import './ModelDetailsModal.css';

interface ModelDetailsModalProps {
  model: ModelRecord | null;
  onClose: () => void;
}

export const ModelDetailsModal: React.FC<ModelDetailsModalProps> = ({ model, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!model) return null;

  return (
    <div className="details-modal-backdrop" onClick={onClose}>
      <div className="details-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="details-modal-header">
          <div className="details-header-brand">
            <div className="details-icon-box">
              <Box size={20} />
            </div>
            <div className="details-header-titles">
              <div className="details-title-row">
                <h2 className="details-title">{model.displayName}</h2>
                <span
                  className={`badge ${
                    model.metadataStatus === 'available' ? 'badge-local' : 'badge-warning'
                  }`}
                >
                  {model.metadataStatus === 'available' ? 'Available' : 'Metadata Warning'}
                </span>
              </div>
              <span className="details-sub font-mono">{model.fileName}</span>
            </div>
          </div>

          <button className="details-close-btn" onClick={onClose} title="Close (ESC)">
            <X size={16} />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="details-modal-body">
          {/* Metadata Warning Alert if corrupted/truncated */}
          {model.metadataError && (
            <div className="details-error-banner">
              <AlertCircle size={16} className="text-warning" />
              <div>
                <div className="font-semibold">Metadata Inspection Warning</div>
                <div className="text-xs">{model.metadataError}</div>
              </div>
            </div>
          )}

          {/* Core Specifications */}
          <div className="details-section">
            <h3 className="details-section-title">Model Specifications</h3>
            <div className="details-grid">
              <div className="details-item">
                <span className="details-item-label">
                  <Cpu size={12} /> Architecture
                </span>
                <span className="details-item-val font-mono">
                  {model.architecture || 'Unknown'}
                </span>
              </div>

              <div className="details-item">
                <span className="details-item-label">
                  <Layers size={12} /> Quantization
                </span>
                <div className="details-quant-group">
                  <span className="details-item-val font-mono">
                    {model.quantization || 'Unknown'}
                  </span>
                  {model.quantizationSource && (
                    <span className="badge badge-muted">
                      source: {model.quantizationSource}
                    </span>
                  )}
                </div>
              </div>

              <div className="details-item">
                <span className="details-item-label">
                  <Database size={12} /> Context Length
                </span>
                <span className="details-item-val font-mono">
                  {formatContextLength(model.contextLength)}
                  {model.contextLength ? ` (${model.contextLength.toLocaleString()} tokens)` : ''}
                </span>
              </div>

              <div className="details-item">
                <span className="details-item-label">
                  <FileCode size={12} /> GGUF Version
                </span>
                <span className="details-item-val font-mono">
                  {model.ggufVersion ? `v${model.ggufVersion}` : 'Unknown'}
                </span>
              </div>
            </div>
          </div>

          {/* Filesystem Details */}
          <div className="details-section">
            <h3 className="details-section-title">Filesystem & Storage</h3>
            <div className="details-list">
              <div className="details-row">
                <span className="details-label">
                  <HardDrive size={12} /> File Size
                </span>
                <span className="details-val font-mono">
                  {formatFileSize(model.sizeBytes)} ({model.sizeBytes.toLocaleString()} bytes)
                </span>
              </div>

              <div className="details-row">
                <span className="details-label">
                  <Calendar size={12} /> Last Modified
                </span>
                <span className="details-val font-mono">
                  {new Date(model.modifiedAt).toLocaleString()}
                </span>
              </div>

              <div className="details-row">
                <span className="details-label">
                  <Folder size={12} /> Library Root
                </span>
                <span className="details-val font-mono text-secondary" title={model.rootDirectory}>
                  {model.rootDirectory}
                </span>
              </div>

              <div className="details-row">
                <span className="details-label">Full File Path</span>
                <span className="details-val font-mono text-secondary path-wrap" title={model.path}>
                  {model.path}
                </span>
              </div>
            </div>
          </div>

          {/* Execution Status */}
          <div className="details-section">
            <h3 className="details-section-title">Runtime & Inference</h3>
            <div className="details-list">
              <div className="details-row">
                <span className="details-label">Execution State</span>
                <span className="details-val text-muted">Not loaded</span>
              </div>

              <div className="details-row">
                <span className="details-label">Built-in Core Integration</span>
                <span className="details-val text-secondary">Not available yet</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="details-modal-footer">
          <div className="details-footer-note">
            <Shield size={13} className="text-success" />
            <span>100% Local File · Ready for runtime integration</span>
          </div>

          <div className="details-footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              className="btn btn-primary"
              disabled
              title="Built-in inference core is not installed yet."
            >
              <Play size={13} fill="currentColor" />
              <span>Load Model</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
