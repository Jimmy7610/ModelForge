import React from 'react';
import { useAppStore } from '@/store/AppStoreContext';
import { SharedTerminalView } from '@/components/terminal/SharedTerminalView';
import './TerminalPage.css';

export const TerminalPage: React.FC = () => {
  const { activeProject } = useAppStore();

  return (
    <div className="terminal-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Terminal</h1>
          <p className="page-subtitle">
            Supervised package.json script execution {activeProject ? `— ${activeProject.name}` : ''}
          </p>
        </div>
        <span className="badge badge-accent">Supervised Execution</span>
      </div>

      <div style={{ flex: 1, minHeight: '400px', marginTop: '12px' }}>
        <SharedTerminalView />
      </div>
    </div>
  );
};
