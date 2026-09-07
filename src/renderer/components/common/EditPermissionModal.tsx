import React from 'react';
import { Shield, Check, X, Ban } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './EditPermissionModal.css';

export const EditPermissionModal: React.FC = () => {
  const {
    isEditPermissionModalOpen,
    setEditPermissionModalOpen,
    confirmEnableEdit,
    activeProject,
  } = useAppStore();

  if (!isEditPermissionModalOpen || !activeProject) {
    return null;
  }

  const projectPath = activeProject.rootPath || activeProject.path;

  return (
    <div className="modal-backdrop" onClick={() => setEditPermissionModalOpen(false)}>
      <div className="modal-dialog edit-permission-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Shield size={18} className="text-warning" />
            <span className="modal-title">Enable Edit Mode</span>
          </div>
          <button
            className="icon-btn-ghost"
            onClick={() => setEditPermissionModalOpen(false)}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body edit-permission-body">
          <p className="edit-desc">
            Model Forge may modify text and code files inside:
          </p>
          <div className="edit-target-path font-mono" title={projectPath}>
            {projectPath}
          </div>

          <div className="edit-features-list">
            <div className="edit-feature-item">
              <Check size={14} className="text-success" />
              <span>Automatic baseline checkpoint before first mutation</span>
            </div>
            <div className="edit-feature-item">
              <Check size={14} className="text-success" />
              <span>Full unified diff review for all touched files</span>
            </div>
            <div className="edit-feature-item">
              <Check size={14} className="text-success" />
              <span>One-click rollback with external conflict protection</span>
            </div>
            <div className="edit-feature-item">
              <Check size={14} className="text-success" />
              <span>Outside workspace and sensitive credentials strictly blocked</span>
            </div>
            <div className="edit-feature-item disabled">
              <Ban size={14} className="text-muted" />
              <span className="text-muted">Terminal and command execution disabled</span>
            </div>
          </div>
        </div>

        <div className="modal-footer edit-permission-footer">
          <button
            className="btn btn-secondary"
            onClick={() => setEditPermissionModalOpen(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-warning btn-enable-edit"
            onClick={confirmEnableEdit}
          >
            Enable Edit
          </button>
        </div>
      </div>
    </div>
  );
};
