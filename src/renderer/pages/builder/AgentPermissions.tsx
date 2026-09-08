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
    setAgentPermissionModalOpen,
    activeProject,
    addToast,
  } = useAppStore();

  const handleModeClick = (mode: PermissionLevel) => {
    if (mode === 'READ') {
      setPermissionLevel('READ');
    } else if (mode === 'EDIT') {
      if (permissionLevel === 'EDIT') return;
      if (!activeProject) {
        addToast('Select an active project first to enable Edit mode.', 'warning');
        return;
      }
      setEditPermissionModalOpen(true);
    } else if (mode === 'AGENT') {
      if (permissionLevel === 'AGENT') return;
      if (!activeProject) {
        addToast('Select an active project first to enable Agent mode.', 'warning');
        return;
      }
      setAgentPermissionModalOpen(true);
    } else {
      addToast('YOLO mode is locked in Model Forge v0.6.0.', 'warning');
    }
  };

  const isEdit = permissionLevel === 'EDIT';
  const isAgent = permissionLevel === 'AGENT';

  return (
    <div className="panel agent-permissions-panel">
      <div className="permissions-content">
        {/* Left Side: Header, Selector, and Guarantees */}
        <div className="permissions-left">
          <div className="permissions-header">
            <div className="permissions-title">
              <Lock size={15} className={isAgent ? 'text-accent' : isEdit ? 'text-warning' : 'text-success'} />
              <span>{isAgent ? 'AGENT MODE' : isEdit ? 'EDIT MODE' : 'Agent Permissions'}</span>
              <span className={`badge ${isAgent ? 'badge-accent' : 'badge-local'}`}>
                {isAgent ? 'Supervised Process Run' : 'Workspace Jailed'}
              </span>
            </div>

            {/* Mode Selector Pill Buttons */}
            <div className="mode-selector">
              {(['READ', 'EDIT', 'AGENT', 'YOLO'] as PermissionLevel[]).map((mode) => {
                const isActive = permissionLevel === mode;
                const isLocked = mode === 'YOLO';
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
                        : mode === 'AGENT'
                        ? 'Supervised process execution and code modifications'
                        : 'YOLO mode is locked in v0.6.0'
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
            {isAgent ? (
              <>
                <div className="rule-item">
                  <CheckCircle2 size={13} className="rule-icon success" />
                  <span>Text edits & mutations allowed</span>
                </div>
                <div className="rule-item">
                  <CheckCircle2 size={13} className="rule-icon success" />
                  <span>Pre-process safety snapshots</span>
                </div>
                <div className="rule-item">
                  <CheckCircle2 size={13} className="rule-icon success" />
                  <span>Supervised npm script execution</span>
                </div>
                <div className="rule-item">
                  <CheckCircle2 size={13} className="rule-icon success" />
                  <span>Normal Windows permissions (not jailed)</span>
                </div>
              </>
            ) : isEdit ? (
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
                <div className="rule-item text-muted">
                  <Ban size={13} className="rule-icon text-muted" />
                  <span>Process execution disabled</span>
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
                <div className="rule-item text-muted">
                  <Ban size={13} className="rule-icon text-muted" />
                  <span>Terminal & process execution disabled</span>
                </div>
              </>
            )}
          </div>

          <div className="permissions-footnote">
            <span>
              {isAgent
                ? 'Agent mode enables supervised execution of project package.json scripts with per-run user approval.'
                : isEdit
                ? 'Editing is scoped to text files within the active project for this session.'
                : 'Safe Read is active. Run Agent requires enabling Edit or Agent mode.'}
            </span>
          </div>
        </div>

        {/* Right Side: Visual Shield Outline */}
        <div className="permissions-right">
          <div className="shield-graphic-container">
            <Shield
              size={58}
              strokeWidth={1.2}
              className={`shield-icon ${isAgent ? 'text-accent' : isEdit ? 'text-warning' : ''}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
