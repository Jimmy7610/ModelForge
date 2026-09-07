import React from 'react';
import { Shield, CheckCircle2, Lock, Ban } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import { PermissionLevel } from '@shared/types';
import './AgentPermissions.css';

export const AgentPermissions: React.FC = () => {
  const {
    permissionLevel,
    setPermissionLevel,
    setEditPermissionModalOpen,
    activeProject,
    addToast,
  } = useAppStore();

  const handleModeClick = (mode: PermissionLevel) => {
    if (mode === 'READ') {
      setPermissionLevel('READ');
      if (typeof window !== 'undefined' && window.modelForge?.disableEdit) {
        window.modelForge.disableEdit().catch(console.error);
      }
    } else if (mode === 'EDIT') {
      if (permissionLevel === 'EDIT') return;
      if (!activeProject) {
        addToast('Select an active project first to enable Edit mode.', 'warning');
        return;
      }
      setEditPermissionModalOpen(true);
    } else {
      addToast(`${mode} mode is locked in v0.5.1.`, 'info');
    }
  };

  const isEdit = permissionLevel === 'EDIT';

  return (
    <div className="panel agent-permissions-panel">
      <div className="permissions-content">
        {/* Left Side: Header, Selector, and Guarantees */}
        <div className="permissions-left">
          <div className="permissions-header">
            <div className="permissions-title">
              <Lock size={15} className={isEdit ? 'text-warning' : 'text-success'} />
              <span>{isEdit ? 'EDIT MODE' : 'Agent Permissions'}</span>
              <span className="badge badge-local">Workspace Jailed</span>
            </div>

            {/* Mode Selector Pill Buttons */}
            <div className="mode-selector">
              {(['READ', 'EDIT', 'AGENT', 'YOLO'] as PermissionLevel[]).map((mode) => {
                const isActive = permissionLevel === mode;
                const isLocked = mode === 'AGENT' || mode === 'YOLO';
                return (
                  <button
                    key={mode}
                    className={`mode-btn ${isActive ? 'active' : ''} ${isLocked ? 'upcoming' : ''}`}
                    onClick={() => handleModeClick(mode)}
                    title={
                      mode === 'READ'
                        ? 'Safe read-only inspection'
                        : mode === 'EDIT'
                        ? 'Workspace jailed text and code modifications'
                        : `${mode} mode is locked in v0.5.0`
                    }
                  >
                    <span>{mode}</span>
                    {isLocked && <span className="mode-badge-tag">Locked</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checklist of security rules */}
          <div className="permissions-rules-grid">
            <div className="rule-item">
              <CheckCircle2 size={13} className="rule-icon success" />
              <span>Restricted to active project</span>
            </div>
            <div className="rule-item">
              <CheckCircle2 size={13} className="rule-icon success" />
              <span>Outside filesystem blocked</span>
            </div>
            {isEdit ? (
              <>
                <div className="rule-item">
                  <CheckCircle2 size={13} className="rule-icon success" />
                  <span>Text edits allowed</span>
                </div>
                <div className="rule-item">
                  <CheckCircle2 size={13} className="rule-icon success" />
                  <span>Automatic checkpoint</span>
                </div>
                <div className="rule-item">
                  <CheckCircle2 size={13} className="rule-icon success" />
                  <span>Diff review & Rollback</span>
                </div>
              </>
            ) : (
              <>
                <div className="rule-item">
                  <CheckCircle2 size={13} className="rule-icon success" />
                  <span>Safe read-only inspection</span>
                </div>
                <div className="rule-item">
                  <CheckCircle2 size={13} className="rule-icon success" />
                  <span>File mutations blocked</span>
                </div>
                <div className="rule-item">
                  <CheckCircle2 size={13} className="rule-icon success" />
                  <span>Plan agent allowed</span>
                </div>
              </>
            )}
            <div className="rule-item text-muted">
              <Ban size={13} className="rule-icon text-muted" />
              <span>Terminal & process execution disabled</span>
            </div>
          </div>

          <div className="permissions-footnote">
            <span>
              {isEdit
                ? 'Editing is scoped to text files within the active project for this session.'
                : 'Safe Read is active. Run Agent requires enabling Edit mode.'}
            </span>
          </div>
        </div>

        {/* Right Side: Visual Shield Outline */}
        <div className="permissions-right">
          <div className="shield-graphic-container">
            <Shield size={58} strokeWidth={1.2} className={`shield-icon ${isEdit ? 'text-warning' : ''}`} />
          </div>
        </div>
      </div>
    </div>
  );
};
