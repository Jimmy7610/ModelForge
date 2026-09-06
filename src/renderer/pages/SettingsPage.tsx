import React from 'react';
import {
  HardDrive,
  Sliders,
  Shield,
  Palette,
  Terminal,
  FolderOpen,
} from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import { NavigationPage } from '@shared/types';
import { APP_VERSION } from '@shared/constants';
import './SettingsPage.css';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, selectModelFolder, hardwareInfo, addToast } = useAppStore();

  const handleStartupPageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const page = e.target.value as NavigationPage;
    await updateSettings({ startupPage: page });
    addToast(`Startup page changed to ${page}`, 'info');
  };

  const handleConfirmDestructiveToggle = async () => {
    const newVal = !settings.confirmDestructiveActions;
    await updateSettings({ confirmDestructiveActions: newVal });
    addToast(`Confirm destructive actions ${newVal ? 'enabled' : 'disabled'}`, 'info');
  };

  const handleCompactModeToggle = async () => {
    const newVal = !settings.compactMode;
    await updateSettings({ compactMode: newVal });
    addToast(`Compact layout ${newVal ? 'enabled' : 'disabled'}`, 'info');
  };

  return (
    <div className="settings-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure Model Forge workstation preferences and runtime paths</p>
        </div>
        <span className="badge badge-local">Local Persistence Active</span>
      </div>

      <div className="settings-sections-list">
        {/* Section 1: General */}
        <div className="panel settings-section-card">
          <div className="settings-section-header">
            <div className="settings-section-title">
              <Sliders size={16} className="text-secondary" />
              <span>General</span>
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Startup Page</span>
                <span className="settings-sub">Choose which view appears when Model Forge opens.</span>
              </div>
              <select
                className="settings-select"
                value={settings.startupPage}
                onChange={handleStartupPageChange}
              >
                <option value="builder">Builder (Hero)</option>
                <option value="home">Home (Dashboard)</option>
                <option value="models">Models</option>
                <option value="projects">Projects</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Models */}
        <div className="panel settings-section-card">
          <div className="settings-section-header">
            <div className="settings-section-title">
              <HardDrive size={16} className="text-secondary" />
              <span>Models & Storage</span>
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Local Model Directory</span>
                <span className="settings-sub">
                  Directory where your local GGUF models are stored on disk.
                </span>
                <span className="settings-value-preview font-mono">
                  {settings.modelDirectory || 'No directory configured'}
                </span>
              </div>
              <button className="btn btn-secondary" onClick={() => selectModelFolder()}>
                <FolderOpen size={13} />
                <span>Browse Directory</span>
              </button>
            </div>
          </div>
        </div>

        {/* Section 3: Agent Safety */}
        <div className="panel settings-section-card">
          <div className="settings-section-header">
            <div className="settings-section-title">
              <Shield size={16} className="text-secondary" />
              <span>Agent Safety & Workspace Jail</span>
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Confirm Destructive Actions</span>
                <span className="settings-sub">
                  Prompt for explicit approval before performing rollbacks or discarding file diffs.
                </span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.confirmDestructiveActions}
                  onChange={handleConfirmDestructiveToggle}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Workspace Jail Restrictions</span>
                <span className="settings-sub">
                  All autonomous agent tasks are strictly sandboxed to the project directory.
                </span>
              </div>
              <span className="badge badge-local">Always Enforced</span>
            </div>
          </div>
        </div>

        {/* Section 4: Appearance */}
        <div className="panel settings-section-card">
          <div className="settings-section-header">
            <div className="settings-section-title">
              <Palette size={16} className="text-secondary" />
              <span>Appearance</span>
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Color Theme</span>
                <span className="settings-sub">Model Forge is optimized for focused dark-mode developer environments.</span>
              </div>
              <span className="badge badge-accent">Forge Dark (Default)</span>
            </div>

            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Compact Density</span>
                <span className="settings-sub">Reduce sidebar width and padding for smaller screen sizes.</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.compactMode}
                  onChange={handleCompactModeToggle}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </div>

        {/* Section 5: Developer & Diagnostics */}
        <div className="panel settings-section-card">
          <div className="settings-section-header">
            <div className="settings-section-title">
              <Terminal size={16} className="text-secondary" />
              <span>Developer & Diagnostics</span>
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Model Forge Core Version</span>
                <span className="settings-sub font-mono">v{APP_VERSION} (Pass 1 Foundation)</span>
              </div>
              <span className="badge badge-local">Build 2026.1</span>
            </div>

            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Detected Hardware Target</span>
                <span className="settings-sub font-mono">
                  {hardwareInfo ? `${hardwareInfo.cpuModel} (${hardwareInfo.cpuCores} cores) · ${hardwareInfo.totalMemoryGB} GB RAM` : 'Detecting...'}
                </span>
                <span className="settings-sub font-mono text-accent">
                  GPU: {hardwareInfo?.gpuName || 'GPU detection pending'}
                </span>
              </div>
              <div className="status-dot ready" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
