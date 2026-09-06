import React from 'react';
import { useAppStore } from '@/store/AppStoreContext';
import { APP_VERSION } from '@shared/constants';
import './StatusBar.css';

export const StatusBar: React.FC = () => {
  const { hardwareInfo } = useAppStore();

  const ramUsed = hardwareInfo ? `${hardwareInfo.usedMemoryGB} / ${hardwareInfo.totalMemoryGB} GB` : '—';
  const cpuText = hardwareInfo ? `${hardwareInfo.cpuCores} Cores` : '—';
  const gpuText = hardwareInfo ? hardwareInfo.gpuName : 'GPU detection pending';

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <div className="statusbar-item">
          <span className="status-dot ready" />
          <span className="statusbar-text font-medium">System Ready</span>
        </div>
        <div className="statusbar-divider" />
        <div className="statusbar-item">
          <span className="statusbar-text text-secondary">Built-in Core</span>
        </div>
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
