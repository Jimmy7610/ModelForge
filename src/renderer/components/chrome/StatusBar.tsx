import React from 'react';
import { useAppStore } from '@/store/AppStoreContext';
import { APP_VERSION } from '@shared/constants';
import './StatusBar.css';

export const StatusBar: React.FC = () => {
  const { hardwareInfo, activeModel, inferenceState, isGenerating } = useAppStore();

  const ramUsed = hardwareInfo ? `${hardwareInfo.usedMemoryGB} / ${hardwareInfo.totalMemoryGB} GB` : '—';
  const cpuText = hardwareInfo ? `${hardwareInfo.cpuCores} Cores` : '—';
  const gpuText = hardwareInfo ? hardwareInfo.gpuName : 'GPU detection pending';
  const backendName = inferenceState?.runtime.backend?.toUpperCase() || 'CPU';

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <div className="statusbar-item">
          <span className="status-dot ready" />
          <span className="statusbar-text font-medium">System Ready</span>
        </div>
        <div className="statusbar-divider" />
        <div className="statusbar-item">
          <span className="statusbar-text text-secondary font-mono">
            Built-in Core: {backendName}
          </span>
        </div>
        {activeModel && (
          <>
            <div className="statusbar-divider" />
            <div className="statusbar-item">
              <span className="status-dot ready" style={{ backgroundColor: '#10b981' }} />
              <span className="statusbar-text text-primary font-mono">{activeModel.name}</span>
              {isGenerating && (
                <span className="statusbar-text text-warning font-medium ml-1">
                  (Generating...)
                </span>
              )}
            </div>
          </>
        )}
        <div className="statusbar-divider" />
        <div className="statusbar-item">
          <span className="statusbar-text text-muted font-mono">v{APP_VERSION}</span>
        </div>
      </div>

      <div className="statusbar-right">
        <div className="statusbar-item">
          <span className="statusbar-label">CPU</span>
          <span className="statusbar-value font-mono">{cpuText}</span>
        </div>
        <div className="statusbar-divider" />
        <div className="statusbar-item">
          <span className="statusbar-label">RAM</span>
          <span className="statusbar-value font-mono">{ramUsed}</span>
        </div>
        <div className="statusbar-divider" />
        <div className="statusbar-item">
          <span className="statusbar-label">GPU</span>
          <span className="statusbar-value font-mono" title={gpuText}>
            {gpuText.length > 20 ? `${gpuText.substring(0, 18)}...` : gpuText}
          </span>
        </div>
      </div>
    </footer>
  );
};
