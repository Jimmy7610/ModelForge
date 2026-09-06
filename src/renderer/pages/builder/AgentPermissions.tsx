import React, { useState } from 'react';
import { Shield, CheckCircle2, Lock } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './AgentPermissions.css';

type PermissionMode = 'READ' | 'EDIT' | 'AGENT' | 'YOLO';

export const AgentPermissions: React.FC = () => {
  const { addToast } = useAppStore();
  const [selectedMode, setSelectedMode] = useState<PermissionMode>('READ');

  const handleModeClick = (mode: PermissionMode) => {
    if (mode === 'READ') {
      setSelectedMode('READ');
    } else {
      addToast(`${mode} mode requires runtime model execution. Safe READ is active.`, 'info');
    }
  };

  return (
    <div className="panel agent-permissions-panel">
      <div className="permissions-content">
        {/* Left Side: Header, Selector, and Guarantees */}
        <div className="permissions-left">
          <div className="permissions-header">
            <div className="permissions-title">
              <Lock size={15} className="text-success" />
              <span>Agent Permissions</span>
              <span className="badge badge-local">Jailed</span>
            </div>

            {/* Mode Selector Pill Buttons */}
            <div className="mode-selector">
              {(['READ', 'EDIT', 'AGENT', 'YOLO'] as PermissionMode[]).map((mode) => {
                const isActive = selectedMode === mode;
                const isAvailable = mode === 'READ';
                return (
                  <button
                    key={mode}
                    className={`mode-btn ${isActive ? 'active' : ''} ${!isAvailable ? 'upcoming' : ''}`}
                    onClick={() => handleModeClick(mode)}
                    title={
                      isAvailable
                        ? 'Safe read-only inspection'
                        : `${mode} mode: Jailed workspace editing requires active model`
                    }
                  >
                    <span>{mode}</span>
                    {!isAvailable && <span className="mode-badge-tag">Upcoming</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checklist of security rules */}
          <div className="permissions-rules-grid">
            <div className="rule-item">
              <CheckCircle2 size={13} className="rule-icon success" />
              <span>Restricted to current project</span>
            </div>
            <div className="rule-item">
              <CheckCircle2 size={13} className="rule-icon success" />
              <span>Outside filesystem blocked</span>
            </div>
            <div className="rule-item">
              <CheckCircle2 size={13} className="rule-icon success" />
              <span>All subfolders allowed</span>
            </div>
            <div className="rule-item">
              <CheckCircle2 size={13} className="rule-icon success" />
              <span>Internet blocked</span>
            </div>
            <div className="rule-item">
              <CheckCircle2 size={13} className="rule-icon success" />
              <span>Automatic checkpoint</span>
            </div>
          </div>

          <div className="permissions-footnote">
            <span>YOLO will be restricted to the selected project and its subfolders.</span>
          </div>
        </div>

        {/* Right Side: Visual Shield Outline */}
        <div className="permissions-right">
          <div className="shield-graphic-container">
            <Shield size={58} strokeWidth={1.2} className="shield-icon" />
          </div>
        </div>
      </div>
    </div>
  );
};
