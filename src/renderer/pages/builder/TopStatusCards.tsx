import React from 'react';
import { Folder, Box, Cpu, Lock, CpuIcon, Database } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './TopStatusCards.css';

export const TopStatusCards: React.FC = () => {
  const { activeProject, hardwareInfo, setCurrentPage, addProject } = useAppStore();

  const handleProjectClick = () => {
    if (!activeProject) {
      addProject();
    } else {
      setCurrentPage('projects');
    }
  };

  const gpuDisplay = hardwareInfo?.gpuName || 'GPU detection pending';
  const isGpuReady = hardwareInfo?.gpuStatus === 'detected';

  return (
    <div className="top-status-cards">
      {/* 1. Current Project */}
      <div className="status-card clickable" onClick={handleProjectClick} title="Click to manage or select project">
        <div className="status-card-icon">
          <Folder size={18} />
        </div>
        <div className="status-card-body">
          <span className="status-card-label">Current Project</span>
          <span className="status-card-value">
            {activeProject ? activeProject.name : 'No project selected'}
          </span>
          <span className="status-card-sub">
            {activeProject ? activeProject.path : 'Click to choose project'}
          </span>
        </div>
      </div>

      {/* 2. Active Model */}
      <div className="status-card clickable" onClick={() => setCurrentPage('models')} title="Click to view local models">
        <div className="status-card-icon">
          <Box size={18} />
        </div>
        <div className="status-card-body">
          <span className="status-card-label">Active Model</span>
          <div className="status-card-value-row">
            <span className="status-card-value text-muted">No model loaded</span>
            <span className="status-dot idle" />
          </div>
          <span className="status-card-sub">Core setup pending</span>
        </div>
      </div>

      {/* 3. Engine */}
      <div className="status-card">
        <div className="status-card-icon">
          <Cpu size={18} />
        </div>
        <div className="status-card-body">
          <span className="status-card-label">Engine</span>
          <span className="status-card-value">Built-in Core</span>
          <span className="status-card-sub">Local llama-core</span>
        </div>
      </div>

      {/* 4. Mode */}
      <div className="status-card">
        <div className="status-card-icon">
          <Lock size={18} />
        </div>
        <div className="status-card-body">
          <span className="status-card-label">Mode</span>
          <span className="status-card-value font-mono">Safe / Read</span>
          <span className="status-card-sub">Sandbox enforced</span>
        </div>
      </div>

      {/* 5. Hardware */}
      <div className="status-card" title={gpuDisplay}>
        <div className="status-card-icon">
          <CpuIcon size={18} />
        </div>
        <div className="status-card-body">
          <span className="status-card-label">Hardware</span>
          <div className="status-card-value-row">
            <span className="status-card-value">
              {gpuDisplay.length > 18 ? `${gpuDisplay.substring(0, 16)}...` : gpuDisplay}
            </span>
            <span className={`status-dot ${isGpuReady ? 'ready' : 'idle'}`} />
          </div>
          <span className="status-card-sub">
            {hardwareInfo ? `${hardwareInfo.cpuCores} Cores · ${hardwareInfo.totalMemoryGB} GB RAM` : 'Detecting...'}
          </span>
        </div>
      </div>

      {/* 6. Context */}
      <div className="status-card">
        <div className="status-card-icon">
          <Database size={18} />
        </div>
        <div className="status-card-body">
          <span className="status-card-label">Context</span>
          <span className="status-card-value font-mono">—</span>
          <span className="status-card-sub">Awaiting model load</span>
        </div>
      </div>
    </div>
  );
};
