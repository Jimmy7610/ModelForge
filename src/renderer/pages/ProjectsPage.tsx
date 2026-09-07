import React, { useState } from 'react';
import { Folder, FolderPlus, Trash2, Calendar, GitBranch, ShieldAlert } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import { Project } from '@shared/types';
import { CopyButton } from '@/components/CopyButton';
import './ProjectsPage.css';

export const ProjectsPage: React.FC = () => {
  const { projects, activeProject, setActiveProjectId, addProject, removeProject, setCurrentPage } = useAppStore();
  const [projectToRemove, setProjectToRemove] = useState<Project | null>(null);

  const handleConfirmRemove = () => {
    if (projectToRemove) {
      removeProject(projectToRemove.id);
      setProjectToRemove(null);
    }
  };

  return (
    <div className="projects-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Manage local repositories and workspaces</p>
        </div>
        <button className="btn btn-primary" onClick={() => addProject()}>
          <FolderPlus size={14} />
          <span>Add Project</span>
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="panel projects-empty-panel">
          <div className="projects-empty-state">
            <div className="projects-empty-icon-wrap">
              <Folder size={36} className="text-secondary" strokeWidth={1.5} />
            </div>
            <h3 className="empty-title">No projects registered yet</h3>
            <p className="empty-desc">
              Add a project directory from your computer. Model Forge keeps all file operations strictly
              jailed within your designated project folder.
            </p>
            <button className="btn btn-primary" onClick={() => addProject()}>
              <FolderPlus size={14} />
              <span>Select Project Directory</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="projects-list-grid">
          {projects.map((proj) => {
            const isActive = activeProject?.id === proj.id;
            const displayPath = proj.rootPath || proj.path;
            return (
              <div
                key={proj.id}
                className={`panel project-item-card ${isActive ? 'active' : ''}`}
                onClick={() => setActiveProjectId(proj.id)}
              >
                <div className="project-card-top">
                  <div className="project-title-group">
                    <div className="project-icon-box">
                      <Folder size={18} />
                    </div>
                    <div className="project-header-text">
                      <div className="project-name-row">
                        <span className="project-name">{proj.name}</span>
                        {isActive && <span className="badge badge-local">Active</span>}
                      </div>
                      <div className="project-path-row">
                        <span className="project-path font-mono" title={displayPath}>
                          {displayPath}
                        </span>
                        <CopyButton
                          text={displayPath}
                          compact
                          tooltip="Copy project directory path"
                          ariaLabel={`Copy path for project ${proj.name}`}
                          className="project-copy-btn"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    className="project-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjectToRemove(proj);
                    }}
                    title="Remove from Model Forge (keeps local files intact)"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Project Intelligence Badges */}
                <div className="project-tags-row">
                  {proj.isGitRepository && (
                    <span className="badge badge-git" title="Git repository detected">
                      <GitBranch size={10} style={{ display: 'inline', marginRight: 3 }} />
                      Git
                    </span>
                  )}
                  {proj.packageManager && (
                    <span className="badge badge-pm" title={`Package manager: ${proj.packageManager}`}>
                      {proj.packageManager}
                    </span>
                  )}
                  {proj.languages?.slice(0, 3).map((lang) => (
                    <span key={lang} className="badge badge-lang">
                      {lang}
                    </span>
                  ))}
                  {proj.frameworkHints?.slice(0, 3).map((hint) => (
                    <span key={hint} className="badge badge-framework">
                      {hint}
                    </span>
                  ))}
                </div>

                <div className="project-card-footer">
                  <div className="project-meta">
                    <Calendar size={12} className="text-muted" />
                    <span>Added {new Date(proj.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="project-actions">
                    {isActive ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentPage('builder');
                        }}
                      >
                        Open in Builder
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveProjectId(proj.id);
                        }}
                      >
                        Set Active
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Non-Destructive Project Removal Confirmation Modal */}
      {projectToRemove && (
        <div className="modal-backdrop" onClick={() => setProjectToRemove(null)}>
          <div className="panel project-remove-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={20} className="text-warning" />
              <h3 className="modal-title">Remove Project from Model Forge?</h3>
            </div>
            <p className="modal-desc">
              Are you sure you want to remove <strong>{projectToRemove.name}</strong> from Model Forge?
            </p>
            <div className="modal-notice">
              <strong>Non-Destructive Action:</strong> Your local project files, git repository, and code on disk will <u>NOT</u> be touched or deleted. This only removes the workspace registration from Model Forge.
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setProjectToRemove(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmRemove}>
                Remove from Model Forge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
