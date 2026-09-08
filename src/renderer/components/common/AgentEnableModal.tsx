import React from 'react';
import { Terminal, Check, X, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './EditPermissionModal.css';

export const AgentEnableModal: React.FC = () => {
  const {
    isAgentPermissionModalOpen,
    setAgentPermissionModalOpen,
    confirmEnableAgent,
    activeProject,
  } = useAppStore();

  if (!isAgentPermissionModalOpen || !activeProject) {
    return null;
  }

  const projectPath = activeProject.rootPath || activeProject.path;

  return (
    <div className="modal-backdrop" onClick={() => setAgentPermissionModalOpen(false)}>
      <div className="modal-dialog edit-permission-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Terminal size={18} className="text-accent" />
            <span className="modal-title">Enable Agent Mode</span>
          </div>
          <button
            className="icon-btn-ghost"
            onClick={() => setAgentPermissionModalOpen(false)}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body edit-permission-body">
          <p className="edit-desc">
            Enables supervised process execution for project:
          </p>
          <div className="edit-target-path font-mono" title={projectPath}>
            {projectPath}
          </div>

          <div className="edit-features-list">
            <div className="edit-feature-item">
              <Check size={14} className="text-success" />
              <span>Agent can request execution of existing package.json scripts</span>
            </div>
            <div className="edit-feature-item">
              <Check size={14} className="text-success" />
              <span>Every command requires explicit user approval on every run</span>
            </div>
            <div className="edit-feature-item">
              <Check size={14} className="text-success" />
              <span>Automatic pre-process safety snapshot and verified rollback</span>
            </div>
            <div className="edit-feature-item">
              <Check size={14} className="text-success" />
              <span>No arbitrary shells, no dependency installs, no Git mutation</span>
            </div>
            <div className="edit-feature-item warning-highlight" style={{ backgroundColor: 'rgba(234, 179, 8, 0.08)', padding: '6px 8px', borderRadius: '4px' }}>
              <AlertTriangle size={14} className="text-warning" style={{ flexShrink: 0 }} />
              <span className="text-secondary" style={{ fontSize: '11px' }}>
                <strong>Truthful security notice:</strong> File edits are jailed to this workspace, but processes execute directly on your system with normal Windows user permissions.
              </span>
            </div>
          </div>
        </div>

        <div className="modal-footer edit-permission-footer">
          <button
            className="btn btn-secondary"
            onClick={() => setAgentPermissionModalOpen(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={confirmEnableAgent}
          >
            Enable Agent Mode
          </button>
        </div>
      </div>
    </div>
  );
};
