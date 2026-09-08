import React, { useState, useEffect, useMemo } from 'react';
import {
  GitCompare,
  Check,
  RotateCcw,
  FileText,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import { CopyButton } from '@/components/CopyButton';
import { FileDiffItem } from '@shared/types';
import './DiffTab.css';

export const DiffTab: React.FC = () => {
  const {
    activeProject,
    pendingCheckpoint,
    checkpointDiff,
    acceptCheckpoint,
    rollbackCheckpoint,
    refreshPendingCheckpointAndDiff,
  } = useAppStore();

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);

  // Reconcile pending checkpoint and diff when Diff tab mounts or becomes active
  useEffect(() => {
    refreshPendingCheckpointAndDiff();
  }, [refreshPendingCheckpointAndDiff]);

  // Auto-select first file if not selected
  useEffect(() => {
    if (checkpointDiff?.files && checkpointDiff.files.length > 0) {
      if (!selectedFilePath || !checkpointDiff.files.some((f) => f.relativePath === selectedFilePath)) {
        setSelectedFilePath(checkpointDiff.files[0].relativePath);
      }
    } else {
      setSelectedFilePath(null);
    }
  }, [checkpointDiff, selectedFilePath]);

  const selectedFile = useMemo<FileDiffItem | null>(() => {
    if (!checkpointDiff || !selectedFilePath) return null;
    return checkpointDiff.files.find((f) => f.relativePath === selectedFilePath) || null;
  }, [checkpointDiff, selectedFilePath]);

  const completeUnifiedDiff = useMemo<string>(() => {
    if (!checkpointDiff || checkpointDiff.files.length === 0) return '';
    return checkpointDiff.files.map((f) => f.unifiedDiff).filter(Boolean).join('\n\n');
  }, [checkpointDiff]);

  const handleAccept = async () => {
    setIsActing(true);
    try {
      await acceptCheckpoint();
    } finally {
      setIsActing(false);
    }
  };

  const handleRollback = async () => {
    setIsActing(true);
    try {
      await rollbackCheckpoint();
    } finally {
      setIsActing(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="diff-empty-state">
        <GitCompare size={32} className="text-muted" />
        <div className="diff-empty-title">No Active Project Selected</div>
        <div className="diff-empty-sub">
          Select or add a project from the top bar to inspect modifications and diffs.
        </div>
      </div>
    );
  }

  if (!pendingCheckpoint || !checkpointDiff || checkpointDiff.totalFilesChanged === 0) {
    return (
      <div className="diff-empty-state">
        <GitCompare size={32} className="text-muted" />
        <div className="diff-empty-title">No Pending Changes</div>
        <div className="diff-empty-sub">
          The workspace matches the baseline. Run Edit Agent to propose code changes or inspect modifications.
        </div>
        <button
          className="btn btn-secondary btn-sm mt-3"
          onClick={() => refreshPendingCheckpointAndDiff()}
        >
          <RefreshCw size={13} />
          <span>Check for Changes</span>
        </button>
      </div>
    );
  }

  const getStatusBadge = (status: FileDiffItem['status']) => {
    switch (status) {
      case 'created':
        return <span className="diff-badge badge-created font-mono">A</span>;
      case 'modified':
        return <span className="diff-badge badge-modified font-mono">M</span>;
      case 'deleted':
        return <span className="diff-badge badge-deleted font-mono">D</span>;
      default:
        return null;
    }
  };

  return (
    <div className="diff-container">
      {/* Diff Header */}
      <div className="diff-header">
        <div className="diff-summary-group">
          <span className="diff-summary-title font-semibold">CHANGES</span>
          <span className="diff-summary-count text-muted">
            {checkpointDiff.totalFilesChanged} file{checkpointDiff.totalFilesChanged === 1 ? '' : 's'} changed
          </span>
          <span className="diff-stat-add font-mono">+{checkpointDiff.totalInsertions}</span>
          <span className="diff-stat-del font-mono">-{checkpointDiff.totalDeletions}</span>
        </div>

        <div className="diff-actions-group">
          <CopyButton
            text={completeUnifiedDiff}
            label="Copy Diff"
            compact
            tooltip="Copy entire unified patch for all files"
            ariaLabel="Copy full diff"
            disabled={!completeUnifiedDiff}
          />

          <button
            className="btn btn-sm btn-danger btn-rollback"
            onClick={handleRollback}
            disabled={isActing}
            title="Rollback all changes to baseline"
          >
            <RotateCcw size={13} />
            <span>Rollback</span>
          </button>

          <button
            className="btn btn-sm btn-success btn-accept"
            onClick={handleAccept}
            disabled={isActing}
            title="Accept current changes on disk"
          >
            <Check size={13} />
            <span>Accept</span>
          </button>
        </div>
      </div>

      {/* Conflict Banner if any file has rollback conflict */}
      {checkpointDiff.hasConflict && (
        <div className="diff-conflict-banner">
          <AlertTriangle size={15} className="text-warning flex-shrink-0" />
          <div className="conflict-text">
            <strong>ROLLBACK CONFLICT:</strong> One or more files were modified outside Model Forge after the agent edited them. Automatic overwrite is blocked to protect your external changes.
          </div>
        </div>
      )}

      {/* Main Diff Content: Sidebar + Viewer */}
      <div className="diff-workspace-body">
        {/* Left: Files List */}
        <div className="diff-file-sidebar custom-scrollbar">
          <div className="sidebar-header font-mono text-muted">TOUCHED FILES</div>
          <div className="diff-file-list">
            {checkpointDiff.files.map((file) => {
              const isSelected = selectedFilePath === file.relativePath;
              return (
                <button
                  key={file.relativePath}
                  className={`diff-file-item ${isSelected ? 'active' : ''} ${file.hasConflict ? 'has-conflict' : ''}`}
                  onClick={() => setSelectedFilePath(file.relativePath)}
                >
                  <div className="diff-file-left">
                    {getStatusBadge(file.status)}
                    <span className="diff-file-name font-mono" title={file.relativePath}>
                      {file.relativePath}
                    </span>
                  </div>
                  <div className="diff-file-stats font-mono">
                    {file.insertions > 0 && (
                      <span className="diff-item-add">+{file.insertions}</span>
                    )}
                    {file.deletions > 0 && (
                      <span className="diff-item-del">-{file.deletions}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Unified Diff Viewer */}
        <div className="diff-viewer-panel">
          {selectedFile ? (
            <div className="diff-viewer-container">
              {/* File Diff Header Toolbar */}
              <div className="diff-viewer-header">
                <div className="viewer-file-info">
                  <FileText size={15} className="text-primary" />
                  <span className="font-mono font-medium">{selectedFile.relativePath}</span>
                  {selectedFile.hasConflict && (
                    <span className="conflict-pill font-mono">Conflict</span>
                  )}
                </div>

                <div className="viewer-actions">
                  <CopyButton
                    text={selectedFile.relativePath}
                    label="Copy Path"
                    compact
                    tooltip="Copy relative path"
                    ariaLabel="Copy file path"
                  />
                  <CopyButton
                    text={selectedFile.unifiedDiff}
                    label="Copy File Diff"
                    compact
                    tooltip="Copy unified patch for this file"
                    ariaLabel="Copy file diff"
                    disabled={!selectedFile.unifiedDiff}
                  />
                </div>
              </div>

              {selectedFile.hasConflict && (
                <div className="file-conflict-note">
                  <AlertTriangle size={13} className="text-warning" />
                  <span>{selectedFile.conflictReason || 'File modified outside Model Forge after agent edit.'}</span>
                </div>
              )}

              {/* Patch Lines Viewport */}
              <div className="diff-code-viewport custom-scrollbar">
                {selectedFile.unifiedDiff ? (
                  <pre className="diff-patch-content font-mono">
                    {selectedFile.unifiedDiff.split('\n').map((line, idx) => {
                      let lineClass = 'diff-line-context';
                      if (line.startsWith('+++') || line.startsWith('---')) {
                        lineClass = 'diff-line-header';
                      } else if (line.startsWith('@@')) {
                        lineClass = 'diff-line-hunk';
                      } else if (line.startsWith('+')) {
                        lineClass = 'diff-line-addition';
                      } else if (line.startsWith('-')) {
                        lineClass = 'diff-line-deletion';
                      }

                      return (
                        <div key={idx} className={`diff-line ${lineClass}`}>
                          <span className="diff-line-text">{line}</span>
                        </div>
                      );
                    })}
                  </pre>
                ) : (
                  <div className="diff-no-changes text-muted">
                    No content differences detected.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="diff-select-prompt text-muted">
              Select a file on the left to view its unified diff.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
