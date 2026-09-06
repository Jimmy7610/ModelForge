import React, { useState } from 'react';
import {
  MessageSquare,
  FileCode2,
  Terminal as TerminalIcon,
  GitCompare,
  GitBranch,
  History,
  Check,
  RotateCcw,
  Sliders,
  Maximize2,
  ChevronRight,
  Eye,
  LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import { WorkspaceTab } from '@shared/types';
import './WorkspaceTabs.css';
import { ChatTab } from './ChatTab';

interface ChangedFileItem {
  id: string;
  name: string;
  insertions: number;
  deletions: number;
}

const PREVIEW_FILES: ChangedFileItem[] = [
  { id: '1', name: 'src/game.ts', insertions: 512, deletions: 78 },
  { id: '2', name: 'src/bosses.ts', insertions: 231, deletions: 12 },
  { id: '3', name: 'tests/boss.test.ts', insertions: 184, deletions: 0 },
];

export const WorkspaceTabs: React.FC = () => {
  const { activeTab, setActiveTab, activeProject, addToast } = useAppStore();
  const [showDiffPreview, setShowDiffPreview] = useState(false);

  const tabs: { id: WorkspaceTab; label: string; icon: LucideIcon }[] = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'files', label: 'Files', icon: FileCode2 },
    { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
    { id: 'diff', label: 'Diff', icon: GitCompare },
    { id: 'git', label: 'Git', icon: GitBranch },
    { id: 'history', label: 'History', icon: History },
  ];

  const handleAcceptDiff = () => {
    addToast('Diff changes accepted into project workspace.', 'success');
    setShowDiffPreview(false);
  };

  const handleRollbackDiff = () => {
    addToast('Workspace restored to previous checkpoint.', 'warning');
    setShowDiffPreview(false);
  };

  return (
    <div className="panel workspace-tabs-panel">
      {/* Tab Navigation Header */}
      <div className="tabs-header">
        <div className="tabs-list">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                {isActive && <div className="tab-active-indicator" />}
              </button>
            );
          })}
        </div>

        <div className="tabs-actions">
          {activeTab === 'diff' && (
            <button
              className="btn-ghost-sm"
              onClick={() => setShowDiffPreview((prev) => !prev)}
              title="Toggle Diff layout preview"
            >
              <Eye size={12} />
              <span>{showDiffPreview ? 'Show Empty State' : 'Preview Diff'}</span>
            </button>
          )}
          <button className="icon-btn-ghost" title="Tab Options">
            <Sliders size={13} />
          </button>
          <button className="icon-btn-ghost" title="Expand Panel">
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className={`tab-content-viewport ${activeTab === 'chat' ? 'chat-viewport' : ''}`}>
        {/* TAB: CHAT */}
        {activeTab === 'chat' && <ChatTab />}

        {/* TAB: FILES */}
        {activeTab === 'files' && (
          <div className="tab-empty-state">
            <FileCode2 size={28} className="text-muted" />
            <div className="tab-empty-title">
              {activeProject ? `Project: ${activeProject.name}` : 'Select a project to browse its files'}
            </div>
            <div className="tab-empty-sub">
              {activeProject
                ? 'File tree exploration is jailed to the active workspace.'
                : 'Registered projects can be selected from the Projects sidebar.'}
            </div>
          </div>
        )}

        {/* TAB: TERMINAL */}
        {activeTab === 'terminal' && (
          <div className="tab-empty-state">
            <TerminalIcon size={28} className="text-muted" />
            <div className="tab-empty-title">Terminal integration will activate for trusted projects</div>
            <div className="tab-empty-sub">
              Terminal sessions run locally inside your project root with sandboxed execution.
            </div>
          </div>
        )}

        {/* TAB: DIFF */}
        {activeTab === 'diff' && (
          <>
            {!showDiffPreview ? (
              <div className="tab-empty-state">
                <GitCompare size={28} className="text-muted" />
                <div className="tab-empty-title">No changes yet</div>
                <div className="tab-empty-sub">
                  Code modifications made by the autonomous agent will appear here for review and rollback.
                </div>
              </div>
            ) : (
              <div className="diff-view-container">
                {/* Diff Overview Card */}
                <div className="diff-summary-card">
                  <div className="diff-stat-header">
                    <FileCode2 size={18} className="text-secondary" />
                    <span className="diff-file-count font-semibold">17 files changed</span>
                  </div>
                  <div className="diff-stats font-mono">
                    <span className="text-success font-semibold">+1,482</span> insertions
                    <span className="diff-stat-spacer" />
                    <span className="text-danger font-semibold">-237</span> deletions
                  </div>

                  <div className="diff-card-actions">
                    <button className="btn btn-success" onClick={handleAcceptDiff}>
                      <Check size={13} />
                      <span>Accept</span>
                    </button>
                    <button className="btn btn-danger" onClick={handleRollbackDiff}>
                      <RotateCcw size={13} />
                      <span>Rollback</span>
                    </button>
                  </div>
                </div>

                {/* Changed Files List matching mockup */}
                <div className="diff-files-list">
                  <div className="diff-table-header">
                    <span>File</span>
                    <span>Change</span>
                  </div>

                  {PREVIEW_FILES.map((f) => (
                    <div key={f.id} className="diff-file-row">
                      <div className="diff-file-identity">
                        <span className="file-badge-ts">TS</span>
                        <span className="diff-file-name font-mono">{f.name}</span>
                      </div>
                      <div className="diff-file-metrics font-mono">
                        <span className="text-success">+{f.insertions}</span>
                        <span className="text-danger">-{f.deletions}</span>
                        {/* Visual bar matching mockup */}
                        <div className="diff-bar-preview">
                          <div className="diff-bar-add" style={{ width: '65%' }} />
                          <div className="diff-bar-del" style={{ width: '35%' }} />
                        </div>
                        <ChevronRight size={14} className="text-muted" />
                      </div>
                    </div>
                  ))}

                  <div className="diff-more-files text-muted">
                    ... 14 more files
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB: GIT */}
        {activeTab === 'git' && (
          <div className="tab-empty-state">
            <GitBranch size={28} className="text-muted" />
            <div className="tab-empty-title">
              {activeProject ? `Git repository: ${activeProject.name}` : 'No project selected'}
            </div>
            <div className="tab-empty-sub">
              Checkpoints and git commit trees will be monitored here.
            </div>
          </div>
        )}

        {/* TAB: HISTORY */}
        {activeTab === 'history' && (
          <div className="tab-empty-state">
            <History size={28} className="text-muted" />
            <div className="tab-empty-title">No sessions yet</div>
            <div className="tab-empty-sub">
              Your previous model runs and agent task histories will be recorded here.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
