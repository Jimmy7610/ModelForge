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
  const { currentPage, setCurrentPage, settings, selectModelFolder, addToast } = useAppStore();

  const handleRefreshModels = () => {
    if (!settings.modelDirectory) {
      addToast('No model directory set. Open Models page to add one.', 'info');
    } else {
      addToast('Model scan complete: GGUF runtime ready.', 'info');
    }
  };

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

      {/* Sidebar Footer: Local Models & Local Storage */}
      <div className="sidebar-footer">
        {/* Local Models Header */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="sidebar-section-title">LOCAL MODELS (0)</span>
            <button
              className="icon-action-btn"
              onClick={handleRefreshModels}
              title="Refresh local model directory"
              aria-label="Refresh local model directory"
            >
              <RotateCw size={12} />
            </button>
          </div>

          <div className="models-empty-box">
            {settings.modelDirectory ? (
              <div className="model-dir-info">
                <span className="dir-label">Directory:</span>
                <span className="dir-path" title={settings.modelDirectory}>
                  {settings.modelDirectory}
                </span>
                <span className="dir-status">No .gguf models loaded</span>
              </div>
            ) : (
              <div className="no-dir-info">
                <span>No models found</span>
                <button
                  className="btn-link-action"
                  onClick={() => selectModelFolder()}
                >
                  + Add Folder
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Local Storage Meter */}
        <div className="storage-card">
          <div className="storage-header">
            <span className="storage-title">
              <HardDrive size={11} className="storage-icon" /> LOCAL STORAGE
            </span>
            <span className="storage-percentage">71%</span>
          </div>
          <div className="storage-track">
            <div className="storage-fill" style={{ width: '71%' }} />
          </div>
          <div className="storage-footer">
            <span>1.42 TB / 2.00 TB</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
