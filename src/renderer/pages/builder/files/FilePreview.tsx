import React, { useState, useEffect } from 'react';
import { Lock, ShieldAlert, FileText, AlertTriangle, RefreshCw } from 'lucide-react';
import { FileReadResult } from '../../../../main/workspace/types';
import { CopyButton } from '@/components/CopyButton';

interface FilePreviewProps {
  projectId: string;
  relativePath: string | null;
}

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const FilePreview: React.FC<FilePreviewProps> = ({ projectId, relativePath }) => {
  const [fileData, setFileData] = useState<FileReadResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !relativePath) {
      setFileData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    window.modelForge
      .readFile({
        projectId,
        path: relativePath,
        startLine: 1,
        endLine: 1000,
      })
      .then((res) => {
        if (isMounted) {
          setFileData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectId, relativePath]);

  const getCleanCode = (): string => {
    if (!fileData?.content) return '';
    const rawLines = fileData.content.split(/\r?\n/);
    const cleaned: string[] = [];
    for (const l of rawLines) {
      if (l.startsWith('[Truncated:')) continue;
      cleaned.push(l.replace(/^\d+:\s?/, ''));
    }
    return cleaned.join('\n');
  };

  if (!relativePath) {
    return (
      <div className="file-preview-empty">
        <FileText size={32} className="text-muted" />
        <div className="file-preview-empty-title">Select a file to preview</div>
        <div className="file-preview-empty-sub">
          Click any file in the workspace tree on the left to inspect its contents in read-only mode.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="file-preview-loading">
        <RefreshCw size={20} className="spin text-primary" />
        <span>Reading file: {relativePath}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-preview-error">
        <ShieldAlert size={24} className="text-danger" />
        <div className="file-preview-error-title">Access Blocked</div>
        <div className="file-preview-error-sub">{error}</div>
        <div className="mt-3">
          <CopyButton
            text={error}
            label="Copy Error"
            compact
            tooltip="Copy error details"
            ariaLabel="Copy error details"
          />
        </div>
      </div>
    );
  }

  if (!fileData) {
    return null;
  }

  // Split lines for line-numbered rendering
  const lines = fileData.content.split(/\r?\n/);

  return (
    <div className="file-preview-container">
      {/* Preview Header */}
      <div className="file-preview-header">
        <div className="file-preview-info">
          <FileText size={15} className="text-primary" />
          <span className="file-preview-path font-mono font-semibold" title={fileData.relativePath}>
            {fileData.relativePath}
          </span>
          <span className="read-only-badge" title="Workspace Protected (No mutation allowed)">
            <Lock size={10} />
            <span>READ ONLY</span>
          </span>
        </div>

        <div className="file-preview-meta font-mono text-muted">
          <span>{formatSize(fileData.sizeBytes)}</span>
          <span className="meta-sep">•</span>
          <span>{fileData.totalLines} lines</span>
          <CopyButton
            text={getCleanCode}
            label="Copy File"
            compact
            tooltip="Copy clean file contents (line numbers stripped)"
            ariaLabel="Copy file contents"
            disabled={fileData.isBinary}
          />
        </div>
      </div>

      {/* Binary Warning Banner */}
      {fileData.isBinary ? (
        <div className="file-preview-binary">
          <ShieldAlert size={36} className="text-warning" />
          <div className="binary-title font-semibold">Binary File Detected</div>
          <div className="binary-desc text-muted">
            For system stability and model security, binary files cannot be displayed in the text viewer.
          </div>
          <div className="binary-meta font-mono text-muted">
            Size: {formatSize(fileData.sizeBytes)}
          </div>
        </div>
      ) : (
        <>
          {/* Truncation Warning */}
          {fileData.truncated && (
            <div className="file-preview-truncation-banner">
              <AlertTriangle size={14} className="text-warning" />
              <span>
                File truncated to viewer bounds (displaying lines 1–{fileData.endLine} of {fileData.totalLines} total lines).
              </span>
            </div>
          )}

          {/* Code Viewer with Line Numbers */}
          <div className="file-preview-code-viewport custom-scrollbar">
            <div className="code-table">
              {lines.map((line, idx) => {
                const lineNum = (fileData.startLine || 1) + idx;
                return (
                  <div key={lineNum} className="code-line">
                    <span className="line-gutter font-mono">{lineNum}</span>
                    <span className="line-content font-mono">{line || ' '}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
