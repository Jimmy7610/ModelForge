import React from 'react';
import {
  MessageSquare,
  FileCode2,
  Terminal as TerminalIcon,
  GitCompare,
  GitBranch,
  History,
  Sliders,
  Maximize2,
  LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import { WorkspaceTab } from '@shared/types';
import './WorkspaceTabs.css';
import { ChatTab } from './ChatTab';
import { FilesTab } from './files/FilesTab';
import { DiffTab } from './diff/DiffTab';
import { SharedTerminalView } from '@/components/terminal/SharedTerminalView';

export const WorkspaceTabs: React.FC = () => {
  const { activeTab, setActiveTab, activeProject } = useAppStore();

  const tabs: { id: WorkspaceTab; label: string; icon: LucideIcon }[] = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'files', label: 'Files', icon: FileCode2 },
    { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
    { id: 'diff', label: 'Diff', icon: GitCompare },
    { id: 'git', label: 'Git', icon: GitBranch },
    { id: 'history', label: 'History', icon: History },
  ];

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
          <button className="icon-btn-ghost" title="Tab Options">
            <Sliders size={13} />
          </button>
          <button className="icon-btn-ghost" title="Expand Panel">
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className={`tab-content-viewport ${activeTab === 'chat' ? 'chat-viewport' : ''} ${activeTab === 'files' ? 'files-viewport' : ''}`}>
        {/* TAB: CHAT */}
        {activeTab === 'chat' && <ChatTab />}

        {/* TAB: FILES */}
        {activeTab === 'files' && <FilesTab />}

        {/* TAB: TERMINAL */}
        {activeTab === 'terminal' && <SharedTerminalView />}

        {/* TAB: DIFF */}
        {activeTab === 'diff' && <DiffTab />}

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
