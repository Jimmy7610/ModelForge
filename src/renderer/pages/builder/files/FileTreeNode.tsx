import React from 'react';
import { ChevronRight, Folder, FolderOpen, FileText, ShieldAlert, FileCode2 } from 'lucide-react';
import { WorkspaceEntry } from '../../../../main/workspace/types';

interface FileTreeNodeProps {
  entry: WorkspaceEntry;
  level: number;
  expandedFolders: Set<string>;
  selectedPath: string | null;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  childrenMap: Map<string, WorkspaceEntry[]>;
  loadingFolders: Set<string>;
  filterText?: string;
}

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const isBinaryFile = (name: string): boolean => {
  const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm', '.gguf', '.woff', '.woff2', '.ttf'];
  const dot = name.lastIndexOf('.');
  if (dot === -1) return false;
  return binaryExts.includes(name.slice(dot).toLowerCase());
};

export const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  entry,
  level,
  expandedFolders,
  selectedPath,
  onToggleFolder,
  onSelectFile,
  childrenMap,
  loadingFolders,
  filterText = '',
}) => {
  const isDir = entry.type === 'directory';
  const isBinary = !isDir && isBinaryFile(entry.name);
  const isExpanded = expandedFolders.has(entry.relativePath);
  const isSelected = selectedPath === entry.relativePath;
  const isLoading = loadingFolders.has(entry.relativePath);
  const children = childrenMap.get(entry.relativePath) || [];

  const handleRowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDir) {
      onToggleFolder(entry.relativePath);
    } else {
      onSelectFile(entry.relativePath);
    }
  };

  const getFileIcon = () => {
    if (isBinary) {
      return <ShieldAlert size={14} className="text-warning tree-icon" />;
    }
    const ext = entry.name.split('.').pop()?.toLowerCase();
    if (['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'py', 'rs'].includes(ext || '')) {
      return <FileCode2 size={14} className="text-accent tree-icon" />;
    }
    return <FileText size={14} className="text-muted tree-icon" />;
  };

  // Filter visibility
  const matchesFilter = !filterText ||
    entry.name.toLowerCase().includes(filterText.toLowerCase()) ||
    entry.relativePath.toLowerCase().includes(filterText.toLowerCase());

  if (!matchesFilter && !isDir) {
    return null;
  }

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-node-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleRowClick}
        title={entry.relativePath}
      >
        {isDir ? (
          <span className={`folder-chevron ${isExpanded ? 'expanded' : ''}`}>
            <ChevronRight size={14} />
          </span>
        ) : (
          <span className="folder-chevron-placeholder" />
        )}

        <span className="tree-icon-wrapper">
          {isDir ? (
            isExpanded ? (
              <FolderOpen size={15} className="text-primary tree-icon" />
            ) : (
              <Folder size={15} className="text-primary tree-icon" />
            )
          ) : (
            getFileIcon()
          )}
        </span>

        <span className="tree-node-name truncate">{entry.name}</span>

        {entry.isIgnored && (
          <span className="tree-badge-ignored" title="Ignored dependency / build folder">
            ignored
          </span>
        )}

        {isBinary && (
          <span className="tree-badge-binary" title="Binary file (read-only blocked)">
            bin
          </span>
        )}

        {!isDir && (
          <span className="tree-node-size text-muted font-mono">
            {formatSize(entry.sizeBytes)}
          </span>
        )}

        {isLoading && <span className="tree-loading-spinner" />}
      </div>

      {isDir && isExpanded && (
        <div className="tree-children">
          {children.length === 0 && !isLoading && (
            <div
              className="tree-empty-folder text-muted"
              style={{ paddingLeft: `${(level + 1) * 16 + 12}px` }}
            >
              (empty folder)
            </div>
          )}
          {children.map((child) => (
            <FileTreeNode
              key={child.relativePath || child.name}
              entry={child}
              level={level + 1}
              expandedFolders={expandedFolders}
              selectedPath={selectedPath}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
              childrenMap={childrenMap}
              loadingFolders={loadingFolders}
              filterText={filterText}
            />
          ))}
        </div>
      )}
    </div>
  );
};
