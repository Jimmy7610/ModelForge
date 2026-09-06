import React from 'react';
import { Box, FolderPlus, HardDrive, RefreshCw, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './ModelsPage.css';

export const ModelsPage: React.FC = () => {
  const { settings, selectModelFolder, addToast } = useAppStore();

  const handleScan = () => {
    if (!settings.modelDirectory) {
      addToast('Add a model folder first to scan for .gguf files.', 'warning');
    } else {
      addToast('Scanning model directory for GGUF weights...', 'info');
    }
  };

  return (
    <div className="models-page">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Models</h1>
          <p className="page-subtitle">Your local model library</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={handleScan}>
            <RefreshCw size={13} />
            <span>Scan Library</span>
          </button>
          <button className="btn btn-primary" onClick={() => selectModelFolder()}>
            <FolderPlus size={14} />
            <span>Add Model Folder</span>
          </button>
        </div>
      </div>

      {/* Directory Status Box */}
      <div className="panel model-dir-panel">
        <div className="dir-row">
          <div className="dir-icon-wrap">
            <HardDrive size={18} className="text-secondary" />
          </div>
          <div className="dir-details">
            <span className="dir-title">Local Model Storage Directory</span>
            {settings.modelDirectory ? (
              <span className="dir-path-text font-mono">{settings.modelDirectory}</span>
            ) : (
              <span className="dir-path-placeholder">No folder selected yet</span>
            )}
          </div>
          <button className="btn btn-secondary" onClick={() => selectModelFolder()}>
            {settings.modelDirectory ? 'Change Directory' : 'Choose Directory'}
          </button>
        </div>
      </div>

      {/* Models List / Empty State */}
      <div className="panel models-library-panel">
        <div className="models-empty-state">
          <div className="models-empty-icon-wrap">
            <Box size={36} className="text-secondary" strokeWidth={1.5} />
          </div>
          <h3 className="empty-title">No models found yet.</h3>
          <p className="empty-desc">
            Add the folder containing your local GGUF models.
            Model Forge discovers and executes quantized models directly on your hardware without third-party services.
          </p>
          <div className="empty-action-group">
            <button className="btn btn-primary" onClick={() => selectModelFolder()}>
              <FolderPlus size={14} />
              <span>Select GGUF Folder</span>
            </button>
          </div>
          <div className="models-note">
            <AlertCircle size={13} />
            <span>Pass 1 Foundation: Model discovery and built-in llama.cpp inference engine arrive in Pass 2.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
