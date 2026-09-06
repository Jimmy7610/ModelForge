import React from 'react';
import { Folder, Box, Cpu, Lock, CpuIcon, Database } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './TopStatusCards.css';

function formatAbbreviatedPath(fullPath?: string): string {
  if (!fullPath) return 'Click to choose project';
  const norm = fullPath.replace(/\\/g, '/');
  const parts = norm.split('/').filter(Boolean);
  if (parts.length <= 3) return norm;
  return `${parts[0]}/.../${parts.slice(-2).join('/')}`;
}

export const TopStatusCards: React.FC = () => {

  const { activeProject, hardwareInfo, models, activeModel, inferenceState, setCurrentPage, addProject } = useAppStore();

  const handleProjectClick = () => {
    if (!activeProject) {
      addProject();
    } else {
      setCurrentPage('projects');
    }
  };

  const gpuDisplay = hardwareInfo?.gpuName || 'GPU detection pending';
  const isGpuReady = hardwareInfo?.gpuStatus === 'detected';
  const backendName = inferenceState?.runtime.backend?.toUpperCase() || 'CPU';

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
          <span className="status-card-sub" title={activeProject ? activeProject.rootPath || activeProject.path : undefined}>
            {activeProject
              ? formatAbbreviatedPath(activeProject.rootPath || activeProject.path)
              : 'Click to choose project'}
          </span>
        </div>
      </div>


      {/* 2. Active Model */}
      <div className="status-card clickable" onClick={() => setCurrentPage('models')} title="Click to view local model library">
        <div className="status-card-icon">
          <Box size={18} />
        </div>
        <div className="status-card-body">
          <span className="status-card-label">Active Model</span>
          <div className="status-card-value-row">
            <span className={`status-card-value ${activeModel ? 'text-primary' : 'text-muted'}`}>
              {activeModel ? activeModel.name : 'No model loaded'}
            </span>
            <span className={`status-dot ${activeModel ? 'ready' : models.length > 0 ? 'idle' : 'error'}`} />
          </div>
          <span className="status-card-sub">
            {activeModel
              ? `${activeModel.architecture} · ${activeModel.quantization}`
              : models.length > 0
              ? `${models.length} available on disk`
              : 'No models discovered'}
          </span>
        </div>
      </div>

      {/* 3. Engine */}
      <div className="status-card">
        <div className="status-card-icon">
          <Cpu size={18} />
        </div>
        <div className="status-card-body">
          <span className="status-card-label">Engine</span>
          <span className="status-card-value font-mono">
            Built-in: {backendName}
          </span>
          <span className="status-card-sub">
            {inferenceState?.runtime.status === 'ready' ? 'Native Offline Core' : 'Initializing Core'}
          </span>
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
          <span className="status-card-value font-mono">
            {activeModel ? `${activeModel.contextLength}` : '—'}
          </span>
          <span className="status-card-sub">
            {activeModel ? 'Bounded safe context' : 'Awaiting model load'}
          </span>
        </div>
      </div>
    </div>
  );
};
