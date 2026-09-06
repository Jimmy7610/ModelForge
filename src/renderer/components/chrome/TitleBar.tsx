import React from 'react';
import { ShieldCheck, Minus, Square, X, Copy } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './TitleBar.css';

export const TitleBar: React.FC = () => {
  const { isMaximized } = useAppStore();

  const handleControl = (action: 'minimize' | 'maximize' | 'close') => {
    if (typeof window !== 'undefined' && window.modelForge) {
      window.modelForge.windowControl(action);
    }
  };

  return (
    <header className="titlebar app-drag-region">
      {/* Brand Identity */}
      <div className="titlebar-brand app-no-drag">
        <svg className="titlebar-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M3 5C3 4.44772 3.44772 4 4 4H20C20.5523 4 21 4.44772 21 5C21 5.55228 20.5523 6 20 6H17.5L14.5 11V15H17C17.5523 15 18 15.4477 18 16C18 16.5523 17.5523 17 17 17H7C6.44772 17 6 16.5523 6 16C6 15.4477 6.44772 15 7 15H9.5V11L6.5 6H4C3.44772 6 3 5.55228 3 5Z"
            fill="url(#forge-blue)"
          />
          <path
            d="M4 19C4 18.4477 4.44772 18 5 18H19C19.5523 18 20 18.4477 20 19C20 19.5523 19.5523 20 19 20H5C4.44772 20 4 19.5523 4 19Z"
            fill="#3b82f6"
          />
          <defs>
            <linearGradient id="forge-blue" x1="3" y1="4" x2="21" y2="17" gradientUnits="userSpaceOnUse">
              <stop stopColor="#60a5fa" />
              <stop offset="1" stopColor="#2563eb" />
            </linearGradient>
          </defs>
        </svg>
        <span className="titlebar-title">Model Forge</span>
      </div>

      {/* Center Spacer & Drag Surface */}
      <div className="titlebar-center">
        <span className="titlebar-subtitle">Local AI Development Workstation</span>
      </div>

      {/* Right Controls */}
      <div className="titlebar-actions app-no-drag">
        <div className="local-badge" title="All models, data, and agent tasks run 100% locally on your machine">
          <ShieldCheck size={14} className="local-badge-icon" />
          <span className="local-badge-text">100% LOCAL</span>
        </div>

        <div className="window-controls">
          <button
            className="win-btn"
            onClick={() => handleControl('minimize')}
            title="Minimize"
            aria-label="Minimize"
          >
            <Minus size={13} />
          </button>
          <button
            className="win-btn"
            onClick={() => handleControl('maximize')}
            title={isMaximized ? 'Restore' : 'Maximize'}
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Copy size={11} /> : <Square size={11} />}
          </button>
          <button
            className="win-btn win-btn-close"
            onClick={() => handleControl('close')}
            title="Close"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};
