import React from 'react';
import {
  HardDrive,
  Sliders,
  Shield,
  Palette,
  Terminal,
  Trash2,
  RefreshCw,
  FolderPlus,
} from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import { NavigationPage } from '@shared/types';
import { APP_VERSION } from '@shared/constants';
import './SettingsPage.css';

export const SettingsPage: React.FC = () => {
  const {
    settings,
    updateSettings,
    modelLibraries,
    addModelLibrary,
    removeModelLibrary,
    scanModelLibrary,
    isScanning,
    hardwareInfo,
    addToast,
  } = useAppStore();

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

        {/* Section 2: Models & Multi-Root Storage */}
        <div className="panel settings-section-card">
          <div className="settings-section-header">
            <div className="settings-section-title">
              <HardDrive size={16} className="text-secondary" />
              <span>Model Library Directories</span>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => addModelLibrary()}
              disabled={isScanning}
            >
              <FolderPlus size={13} />
              <span>Add Folder</span>
            </button>
          </div>
          <div className="settings-group">
            <div className="settings-libraries-container">
              {modelLibraries.length === 0 ? (
                <div className="settings-empty-notice">
                  <span>No model folders configured. Add a directory containing .gguf models.</span>
                </div>
              ) : (
                <div className="settings-libraries-list">
                  {modelLibraries.map((lib) => (
                    <div key={lib.path} className="settings-lib-item">
                      <div className="settings-lib-info">
                        <span className="settings-lib-path font-mono" title={lib.path}>
                          {lib.path}
                        </span>
                        <span className="settings-lib-count text-muted text-xs">
                          {lib.modelCount} models discovered
                        </span>
                      </div>
                      <div className="settings-lib-actions">
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => scanModelLibrary(lib.path)}
                          disabled={isScanning}
                          title="Rescan folder"
                        >
                          <RefreshCw size={11} className={isScanning ? 'spinning' : ''} />
                          <span>Rescan</span>
                        </button>
                        <button
                          className="btn-delete-root"
                          onClick={() => removeModelLibrary(lib.path)}
                          disabled={isScanning}
                          title="Remove from Model Forge (keeps files on disk)"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="settings-safety-hint text-xs text-muted">
                Note: Removing a folder root only unregisters it from Model Forge. Model files on disk are never deleted or modified.
              </div>
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
                  All autonomous agent tasks are strictly sandboxed to the active project directory.
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
                <span className="settings-sub">
                  Model Forge is optimized for focused dark-mode developer environments.
                </span>
              </div>
              <span className="badge badge-accent">Forge Dark (Default)</span>
            </div>

            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Compact Density</span>
                <span className="settings-sub">
                  Reduce sidebar width and padding for smaller screen sizes.
                </span>
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
                <span className="settings-sub font-mono">v{APP_VERSION}</span>
              </div>
              <span className="badge badge-local">Local Workstation</span>
            </div>

            <div className="settings-row">
              <div className="settings-text">
                <span className="settings-label">Detected Hardware Target</span>
                <span className="settings-sub font-mono">
                  {hardwareInfo
                    ? `${hardwareInfo.cpuModel} (${hardwareInfo.cpuCores} cores) · ${hardwareInfo.totalMemoryGB} GB RAM`
                    : 'Detecting...'}
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
