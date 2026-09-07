import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Lock, AlertCircle, FolderGit2 } from 'lucide-react';
import { WorkspaceEntry } from '../../../../main/workspace/types';
import { FileTreeNode } from './FileTreeNode';

interface FileTreeProps {
  projectId: string;
  projectName: string;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  projectId,
  projectName,
  selectedPath,
  onSelectFile,
}) => {
  const [rootEntries, setRootEntries] = useState<WorkspaceEntry[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [childrenMap, setChildrenMap] = useState<Map<string, WorkspaceEntry[]>>(new Map());
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState('');
  const [isLoadingRoot, setIsLoadingRoot] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRootEntries = useCallback(async () => {
    if (!projectId) return;
    setIsLoadingRoot(true);
    setError(null);
    try {
      const res = await window.modelForge.listDirectory({
        projectId,
        path: '',
        recursive: false,
      });
      if (res && Array.isArray(res.entries)) {
        setRootEntries(res.entries);
      } else {
        setRootEntries([]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoadingRoot(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRootEntries();
  }, [fetchRootEntries]);

  const handleToggleFolder = async (folderPath: string) => {
    if (expandedFolders.has(folderPath)) {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.delete(folderPath);
        return next;
      });
      return;
    }

    // Expand
    setExpandedFolders((prev) => new Set(prev).add(folderPath));

    // Lazy load children if not already fetched
    if (!childrenMap.has(folderPath)) {
      setLoadingFolders((prev) => new Set(prev).add(folderPath));
      try {
        const res = await window.modelForge.listDirectory({
          projectId,
          path: folderPath,
          recursive: false,
        });
        if (res && Array.isArray(res.entries)) {
          setChildrenMap((prev) => new Map(prev).set(folderPath, res.entries));
        }
      } catch (err) {
        console.error('Failed to load directory entries for:', folderPath, err);
      } finally {
        setLoadingFolders((prev) => {
          const next = new Set(prev);
          next.delete(folderPath);
          return next;
        });
      }
    }
  };

  return (
    <div className="file-tree-container">
      {/* Root Header */}
      <div className="file-tree-header">
        <div className="file-tree-project-info">
          <FolderGit2 size={16} className="text-primary" />
          <span className="file-tree-project-name font-semibold truncate" title={projectName}>
            {projectName}
          </span>
          <span className="read-only-badge" title="Hard Workspace Jail (Safe Read-Only Mode)">
            <Lock size={10} />
            <span>READ ONLY</span>
          </span>
        </div>
        <button
          className="icon-btn-ghost"
          onClick={fetchRootEntries}
          title="Refresh file tree"
          disabled={isLoadingRoot}
        >
          <RefreshCw size={13} className={isLoadingRoot ? 'spin' : ''} />
        </button>
      </div>

      {/* Search / Filter bar */}
      <div className="file-tree-search-bar">
        <Search size={13} className="text-muted search-icon" />
        <input
          type="text"
          className="file-tree-search-input"
          placeholder="Filter files..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        {filterText && (
          <button
            className="search-clear-btn"
            onClick={() => setFilterText('')}
            title="Clear filter"
          >
            ×
          </button>
        )}
      </div>

      {/* Tree Content */}
      <div className="file-tree-content custom-scrollbar">
        {isLoadingRoot && (
          <div className="file-tree-status text-muted">
            <RefreshCw size={16} className="spin text-primary" />
            <span>Loading workspace files...</span>
          </div>
        )}

        {error && (
          <div className="file-tree-status text-danger">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {!isLoadingRoot && !error && rootEntries.length === 0 && (
          <div className="file-tree-status text-muted">
            <span>No files found in workspace</span>
          </div>
        )}

        {!isLoadingRoot && !error && rootEntries.length > 0 && (
          <div className="file-tree-list">
            {rootEntries.map((entry) => (
              <FileTreeNode
                key={entry.relativePath || entry.name}
                entry={entry}
                level={0}
                expandedFolders={expandedFolders}
                selectedPath={selectedPath}
                onToggleFolder={handleToggleFolder}
                onSelectFile={onSelectFile}
                childrenMap={childrenMap}
                loadingFolders={loadingFolders}
                filterText={filterText}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
