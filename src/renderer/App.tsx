import React from 'react';
import { TitleBar } from './components/chrome/TitleBar';
import { Sidebar } from './components/chrome/Sidebar';
import { StatusBar } from './components/chrome/StatusBar';
import { CommandPalette } from './components/chrome/CommandPalette';
import { CommandApprovalModal } from './components/common/CommandApprovalModal';
import { BuilderPage } from './pages/BuilderPage';
import { HomePage } from './pages/HomePage';
import { ModelsPage } from './pages/ModelsPage';
import { ModelLabPage } from './pages/ModelLabPage';
import { TeamsPage } from './pages/TeamsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TerminalPage } from './pages/TerminalPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { AppStoreProvider, useAppStore } from './store/AppStoreContext';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import './styles/global.css';
import './styles/components.css';

const AppContent: React.FC = () => {
  const { currentPage, toasts, removeToast } = useAppStore();

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'models':
        return <ModelsPage />;
      case 'model-lab':
        return <ModelLabPage />;
      case 'teams':
        return <TeamsPage />;
      case 'projects':
        return <ProjectsPage />;
      case 'builder':
        return <BuilderPage />;
      case 'terminal':
        return <TerminalPage />;
      case 'history':
        return <HistoryPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <BuilderPage />;
    }
  };

  return (
    <div className="app-container">
      {/* Frameless Custom Window Title Bar */}
      <TitleBar />

      {/* Main App Area: Sidebar + Content */}
      <div className="app-main">
        <Sidebar />
        <main className="app-content">{renderPage()}</main>
      </div>

      {/* Persistent Bottom Status Bar */}
      <StatusBar />

      {/* Global Ctrl+K Command Palette */}
      <CommandPalette />

      {/* Global Process Command Approval Modal */}
      <CommandApprovalModal />

      {/* Contextual Toast Notifications */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.type === 'success' && <CheckCircle2 size={16} className="text-success" />}
            {t.type === 'warning' && <AlertCircle size={16} className="text-warning" />}
            {t.type === 'info' && <Info size={16} className="text-accent" />}
            {t.type === 'error' && <AlertCircle size={16} className="text-danger" />}
            <span>{t.message}</span>
            <button
              className="feedback-dismiss"
              onClick={() => removeToast(t.id)}
              aria-label="Close notification"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppStoreProvider>
      <AppContent />
    </AppStoreProvider>
  );
};

export default App;
