import React, { useState } from 'react';
import { FileCode2 } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import { FileTree } from './FileTree';
import { FilePreview } from './FilePreview';
import './FilesTab.css';

export const FilesTab: React.FC = () => {
  const { activeProject } = useAppStore();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  if (!activeProject) {
    return (
      <div className="tab-empty-state">
        <FileCode2 size={32} className="text-muted" />
        <div className="tab-empty-title">No Active Project</div>
        <div className="tab-empty-sub">
          Please select an active project in the Projects page to explore files and inspect the workspace.
        </div>
      </div>
    );
  }

  return (
    <div className="files-tab-container">
      {/* Left Column: File Tree */}
      <div className="files-tab-tree-pane">
        <FileTree
          projectId={activeProject.id}
          projectName={activeProject.name}
          selectedPath={selectedPath}
          onSelectFile={setSelectedPath}
        />
      </div>

      {/* Right Column: Read-Only Preview */}
      <div className="files-tab-preview-pane">
        <FilePreview
          projectId={activeProject.id}
          relativePath={selectedPath}
        />
      </div>
    </div>
  );
};
