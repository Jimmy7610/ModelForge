import React from 'react';
import { Folder, FolderPlus, Trash2, Calendar } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './ProjectsPage.css';

export const ProjectsPage: React.FC = () => {
  const { projects, activeProject, setActiveProjectId, addProject, removeProject, setCurrentPage } = useAppStore();

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
                      <span className="project-path font-mono" title={proj.path}>
                        {proj.path}
                      </span>
                    </div>
                  </div>

                  <button
                    className="project-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeProject(proj.id);
                    }}
                    title="Remove from Model Forge"
                  >
                    <Trash2 size={13} />
                  </button>
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
    </div>
  );
};
