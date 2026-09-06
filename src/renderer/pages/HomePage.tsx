import React from 'react';
import {
  FolderPlus,
  Box,
  HardDrive,
  Hammer,
  ArrowRight,
  ShieldCheck,
  Activity,
  Folder,
} from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './HomePage.css';

export const HomePage: React.FC = () => {
  const {
    setCurrentPage,
    addProject,
    addModelLibrary,
    models,
    modelLibraries,
    activeProject,
    hardwareInfo,
  } = useAppStore();

  return (
    <div className="home-page">
      {/* Welcome Banner */}
      <div className="home-hero-card">
        <div className="home-hero-content">
          <div className="badge badge-local">
            <ShieldCheck size={13} /> 100% Local Development
          </div>
          <h1 className="home-hero-title">Welcome to Model Forge</h1>
          <p className="home-hero-desc">
            A self-contained local AI development workstation. Discover and inspect local GGUF models directly on
            your hardware with zero external dependencies, no cloud subscriptions, and workspace-jailed agent autonomy.
          </p>
          <div className="home-hero-actions">
            <button className="btn btn-primary" onClick={() => setCurrentPage('builder')}>
              <Hammer size={14} />
              <span>Launch Builder</span>
            </button>
            <button className="btn btn-secondary" onClick={() => addProject()}>
              <FolderPlus size={14} />
              <span>Open Project Folder</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Start 4-step Guide */}
      <div className="home-section">
        <h2 className="home-section-title">Quick Start Workflow</h2>
        <div className="quick-start-grid">
          {/* Step 1 */}
          <div className="quick-step-card" onClick={() => addModelLibrary()}>
            <div className="quick-step-number">1</div>
            <div className="quick-step-icon">
              <HardDrive size={18} />
            </div>
            <div className="quick-step-body">
              <span className="quick-step-title">Add Model Folder</span>
              <p className="quick-step-desc">
                {modelLibraries.length > 0
                  ? `${modelLibraries.length} folder(s) configured (${models.length} models)`
                  : 'Point to your local directory containing .gguf models.'}
              </p>
            </div>
            <ArrowRight size={14} className="quick-step-arrow" />
          </div>

          {/* Step 2 */}
          <div className="quick-step-card" onClick={() => addProject()}>
            <div className="quick-step-number">2</div>
            <div className="quick-step-icon">
              <Folder size={18} />
            </div>
            <div className="quick-step-body">
              <span className="quick-step-title">Add / Open Project</span>
              <p className="quick-step-desc">
                {activeProject
                  ? `Active: ${activeProject.name}`
                  : 'Select the local project repository you want to build or edit.'}
              </p>
            </div>
            <ArrowRight size={14} className="quick-step-arrow" />
          </div>

          {/* Step 3 */}
          <div className="quick-step-card" onClick={() => setCurrentPage('models')}>
            <div className="quick-step-number">3</div>
            <div className="quick-step-icon">
              <Box size={18} />
            </div>
            <div className="quick-step-body">
              <span className="quick-step-title">Inspect Models</span>
              <p className="quick-step-desc">
                {models.length > 0
                  ? `${models.length} local GGUF models available in library.`
                  : 'Explore local GGUF models, context windows, and quantization.'}
              </p>
            </div>
            <ArrowRight size={14} className="quick-step-arrow" />
          </div>

          {/* Step 4 */}
          <div className="quick-step-card" onClick={() => setCurrentPage('builder')}>
            <div className="quick-step-number">4</div>
            <div className="quick-step-icon">
              <Hammer size={18} />
            </div>
            <div className="quick-step-body">
              <span className="quick-step-title">Build Locally</span>
              <p className="quick-step-desc">
                Compose prompts, generate architecture plans, and inspect code diffs.
              </p>
            </div>
            <ArrowRight size={14} className="quick-step-arrow" />
          </div>
        </div>
      </div>

      {/* Dashboard Overview Cards */}
      <div className="home-dashboard-grid">
        {/* Model Inventory Summary Card */}
        <div className="panel home-summary-card">
          <div className="panel-header">
            <div className="panel-title">
              <Box size={14} className="text-secondary" />
              <span>Model Inventory</span>
            </div>
            <span className="badge badge-local">Local Only</span>
          </div>
          <div className="home-stats-list">
            <div className="home-stat-row">
              <span className="stat-name">Discovered Models</span>
              <span className="stat-val font-mono font-semibold text-primary">
                {models.length} available
              </span>
            </div>
            <div className="home-stat-row">
              <span className="stat-name">Configured Libraries</span>
              <span className="stat-val font-mono">
                {modelLibraries.length} {modelLibraries.length === 1 ? 'folder' : 'folders'}
              </span>
            </div>
            <div className="home-stat-row">
              <span className="stat-name">Inference Core</span>
              <span className="stat-val font-mono text-muted">Awaiting installation</span>
            </div>
          </div>
          <button
            className="btn btn-secondary mt-2"
            onClick={() => setCurrentPage('models')}
          >
            Open Model Library
          </button>
        </div>

        {/* System & Hardware Card */}
        <div className="panel home-summary-card">
          <div className="panel-header">
            <div className="panel-title">
              <Activity size={14} className="text-secondary" />
              <span>System & Hardware</span>
            </div>
            <span className="badge badge-local">Local Engine</span>
          </div>
          <div className="home-stats-list">
            <div className="home-stat-row">
              <span className="stat-name">Platform</span>
              <span className="stat-val font-mono">{hardwareInfo?.os || 'Windows x64'}</span>
            </div>
            <div className="home-stat-row">
              <span className="stat-name">CPU</span>
              <span className="stat-val font-mono">{hardwareInfo?.cpuModel || 'Detecting...'}</span>
            </div>
            <div className="home-stat-row">
              <span className="stat-name">Logical Cores</span>
              <span className="stat-val font-mono">{hardwareInfo?.cpuCores || '—'}</span>
            </div>
            <div className="home-stat-row">
              <span className="stat-name">System RAM</span>
              <span className="stat-val font-mono">
                {hardwareInfo ? `${hardwareInfo.usedMemoryGB} / ${hardwareInfo.totalMemoryGB} GB` : '—'}
              </span>
            </div>
            <div className="home-stat-row">
              <span className="stat-name">GPU</span>
              <span className="stat-val font-mono text-accent">
                {hardwareInfo?.gpuName || 'GPU detection pending'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
