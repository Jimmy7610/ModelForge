import React from 'react';
import {
  Home,
  Box,
  FlaskConical,
  Users,
  Folder,
  Hammer,
  Terminal,
  History,
  Settings,
  RotateCw,
  HardDrive,
  LucideIcon,
  ChevronRight,
  FolderPlus,
} from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import { NavigationPage } from '@shared/types';
import './Sidebar.css';

interface NavItem {
  id: NavigationPage;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'models', label: 'Models', icon: Box },
  { id: 'model-lab', label: 'Model Lab', icon: FlaskConical },
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'projects', label: 'Projects', icon: Folder },
  { id: 'builder', label: 'Builder', icon: Hammer },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const {
    currentPage,
    setCurrentPage,
    models,
    activeModel,
    modelLibraries,
    primaryDriveStorage,
    isScanning,
    scanAllModelLibraries,
    addModelLibrary,
    setSelectedModelId,
  } = useAppStore();

  const handleRefreshModels = async () => {
    if (modelLibraries.length === 0) {
      await addModelLibrary();
    } else {
      await scanAllModelLibraries();
    }
  };

  const previewModels = models.slice(0, 4);

  return (
    <aside className="sidebar">
      {/* Primary Navigation List */}
      <nav className="sidebar-nav" aria-label="Main Navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setCurrentPage(item.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={16} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
              {isActive && <div className="nav-active-indicator" />}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer: Real Local Models & Real Local Storage */}
      <div className="sidebar-footer">
        {/* Local Models Header */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="sidebar-section-title">
              LOCAL MODELS ({models.length})
            </span>
            <button
              className={`icon-action-btn ${isScanning ? 'spinning' : ''}`}
              onClick={handleRefreshModels}
              title={modelLibraries.length > 0 ? 'Rescan all local model directories' : 'Add model library folder'}
              aria-label="Refresh local model directories"
              disabled={isScanning}
            >
              <RotateCw size={12} />
            </button>
          </div>

          <div className="sidebar-models-container">
            {models.length > 0 ? (
              <div className="sidebar-models-list">
                {previewModels.map((m) => {
                  const isModelActive = activeModel?.modelId === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`sidebar-model-item ${isModelActive ? 'active-model-item' : ''}`}
                      onClick={() => {
                        setSelectedModelId(m.id);
                        setCurrentPage('models');
                      }}
                      title={`${m.displayName}\nLocation: ${m.path}`}
                    >
                      <div className="sidebar-model-top">
                        <span className="sidebar-model-name">{m.displayName}</span>
                        {isModelActive ? (
                          <span className="sidebar-active-badge">Active</span>
                        ) : (
                          <span
                            className={`status-dot ${m.metadataStatus === 'available' ? 'ready' : 'idle'}`}
                          />
                        )}
                      </div>
                      <div className="sidebar-model-sub">
                        <span>{m.quantization || (m.metadataStatus === 'error' ? 'Metadata error' : 'Available')}</span>
                        {m.contextLength && <span>· {Math.round(m.contextLength / 1024)}K</span>}
                      </div>
                    </div>
                  );
                })}

                {models.length > previewModels.length && (
                  <button
                    className="sidebar-view-all-btn"
                    onClick={() => setCurrentPage('models')}
                  >
                    <span>View all {models.length} models</span>
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>
            ) : (
              <div className="models-empty-box">
                {modelLibraries.length > 0 ? (
                  <div className="model-dir-info">
                    <span className="dir-label">Configured Roots: {modelLibraries.length}</span>
                    <span className="dir-status">No .gguf models found yet</span>
                    <button
                      className="btn-link-action"
                      onClick={() => scanAllModelLibraries()}
                      disabled={isScanning}
                    >
                      {isScanning ? 'Scanning...' : 'Rescan Folders'}
                    </button>
                  </div>
                ) : (
                  <div className="no-dir-info">
                    <span>No model library added</span>
                    <button
                      className="btn-link-action"
                      onClick={() => addModelLibrary()}
                      disabled={isScanning}
                    >
                      <FolderPlus size={11} />
                      <span>Add Model Folder</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Real Local Storage Meter */}
        <div className="storage-card">
          <div className="storage-header">
            <span className="storage-title">
              <HardDrive size={11} className="storage-icon" /> LOCAL STORAGE
            </span>
            {primaryDriveStorage && (
              <span className="storage-percentage font-mono">
                {primaryDriveStorage.usedPercentage}%
              </span>
            )}
          </div>

          {primaryDriveStorage ? (
            <>
              <div className="storage-track">
                <div
                  className="storage-fill"
                  style={{ width: `${Math.min(100, primaryDriveStorage.usedPercentage)}%` }}
                />
              </div>
              <div className="storage-footer font-mono">
                <span>
                  {primaryDriveStorage.formattedUsed} / {primaryDriveStorage.formattedTotal}
                </span>
              </div>
            </>
          ) : (
            <div className="storage-empty-state">
              <span>{modelLibraries.length > 0 ? 'Reading drive metrics...' : 'No library folders configured'}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
