import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './TerminalPage.css';

export const TerminalPage: React.FC = () => {
  const { activeProject } = useAppStore();

  return (
    <div className="terminal-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Terminal</h1>
          <p className="page-subtitle">Jailed workspace terminal emulator</p>
        </div>
        <span className="badge badge-local">Jail Enforced</span>
      </div>

      <div className="panel terminal-window-panel">
        {/* Terminal Window Chrome */}
        <div className="terminal-window-header">
          <div className="terminal-dots">
            <span className="term-dot red" />
            <span className="term-dot yellow" />
            <span className="term-dot green" />
          </div>
          <span className="terminal-title-text font-mono">
            modelforge-sh {activeProject ? `— ${activeProject.name}` : ''}
          </span>
          <span className="terminal-status-badge">SANDBOX READY</span>
        </div>

        {/* Terminal Screen Mock / Notice */}
        <div className="terminal-screen font-mono">
          <div className="term-line">
            <span className="term-prompt">modelforge:~$</span>
            <span className="term-cmd"> systemctl status local-jail</span>
          </div>
          <div className="term-line output text-success">
            ● local-jail.service - Model Forge Jailed Workspace Execution Environment
          </div>
          <div className="term-line output text-muted">
            &nbsp;&nbsp;Loaded: sandbox profile v1.0 (workspace-isolated)
          </div>
          <div className="term-line output text-muted">
            &nbsp;&nbsp;Active: active (jailed)
          </div>
          <div className="term-line output text-muted">
            &nbsp;&nbsp;Root: {activeProject ? activeProject.path : '/unbound'}
          </div>
          <div className="term-line output text-muted">
            &nbsp;&nbsp;Network: isolated (loopback-only)
          </div>

          <div className="terminal-spacer" />

          <div className="terminal-callout">
            <ShieldAlert size={18} className="text-secondary" />
            <div>
              <div className="font-semibold text-primary">Terminal becomes available for trusted projects.</div>
              <div className="text-secondary text-xs mt-1">
                Pass 1 enforces zero unrestricted shell execution. Interactive terminal session spawning
                restricted strictly to your project subfolders is scheduled for Pass 2.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
