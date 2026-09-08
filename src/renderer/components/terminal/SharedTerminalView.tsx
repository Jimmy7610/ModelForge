import React, { useRef, useEffect, useState } from 'react';
import {
  Play,
  Square,
  Copy,
  Trash2,
  Terminal as TerminalIcon,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './SharedTerminalView.css';

export const SharedTerminalView: React.FC = () => {
  const {
    activeProject,
    activeProcessSession,
    discoveredScripts,
    packageManager,
    runManualScript,
    stopActiveProcess,
    addToast,
  } = useAppStore();

  const viewportRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [cleared, setCleared] = useState(false);

  // Auto-scroll when output updates unless user scrolled up
  useEffect(() => {
    if (!userScrolledUp && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [activeProcessSession?.retainedOutput, userScrolledUp]);

  const handleScroll = () => {
    if (!viewportRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = viewportRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 40;
    setUserScrolledUp(!isNearBottom);
  };

  const handleCopyOutput = async () => {
    const text = activeProcessSession?.retainedOutput || '';
    if (!text) {
      addToast('No output to copy.', 'info');
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.modelForge?.copyText) {
        await window.modelForge.copyText(text);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      addToast('Terminal output copied to clipboard.', 'success');
    } catch {
      addToast('Failed to copy output.', 'error');
    }
  };

  const handleClear = () => {
    setCleared(true);
  };

  const isRunning = activeProcessSession?.status === 'running';

  if (!activeProject) {
    return (
      <div className="shared-terminal-container">
        <div className="tab-empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <TerminalIcon size={32} className="text-muted" style={{ margin: '0 auto 12px' }} />
          <div className="tab-empty-title">No Active Project Selected</div>
          <div className="tab-empty-sub">
            Select or open a project to inspect scripts and run supervised processes.
          </div>
        </div>
      </div>
    );
  }

  const outputContent = cleared ? '' : (activeProcessSession?.retainedOutput || '');

  return (
    <div className="shared-terminal-container">
      {/* Toolbar */}
      <div className="terminal-toolbar">
        <div className="terminal-toolbar-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Package size={14} className="text-accent" />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {packageManager || 'Unknown'}
            </span>
          </div>

          {/* Script runner chips */}
          <div className="script-chip-list">
            {discoveredScripts.length === 0 ? (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                No scripts in package.json
              </span>
            ) : (
              discoveredScripts.map((s) => (
                <button
                  key={s.name}
                  className="script-run-chip"
                  disabled={isRunning}
                  onClick={() => {
                    setCleared(false);
                    runManualScript(s.name);
                  }}
                  title={`Run "${s.name}": ${s.command}`}
                >
                  <Play size={10} className="text-accent" />
                  <span>{s.name}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="terminal-toolbar-right">
          {/* Status badge */}
          {activeProcessSession ? (
            <div className={`terminal-status-pill ${activeProcessSession.status}`}>
              {activeProcessSession.status === 'running' && (
                <>
                  <Clock size={10} className="animate-spin" />
                  <span>Running (PID {activeProcessSession.pid || '—'})</span>
                </>
              )}
              {activeProcessSession.status === 'completed' && (
                <>
                  <CheckCircle2 size={10} />
                  <span>Exit {activeProcessSession.exitCode ?? 0}</span>
                </>
              )}
              {activeProcessSession.status === 'failed' && (
                <>
                  <XCircle size={10} />
                  <span>Failed ({activeProcessSession.exitCode ?? 1})</span>
                </>
              )}
              {activeProcessSession.status === 'cancelled' && (
                <>
                  <Square size={10} />
                  <span>Stopped</span>
                </>
              )}
              {activeProcessSession.status === 'timed_out' && (
                <>
                  <Clock size={10} />
                  <span>Timed Out</span>
                </>
              )}
            </div>
          ) : (
            <div className="terminal-status-pill idle">
              <span>Idle</span>
            </div>
          )}

          {/* Process Controls */}
          {isRunning && (
            <button
              className="btn btn-danger"
              style={{ padding: '3px 8px', fontSize: '11px', gap: '4px' }}
              onClick={stopActiveProcess}
              title="Stop running process"
            >
              <Square size={12} />
              <span>Stop</span>
            </button>
          )}

          <button
            className="icon-btn-ghost"
            onClick={handleCopyOutput}
            title="Copy Terminal Output"
            aria-label="Copy Terminal Output"
          >
            <Copy size={13} />
          </button>

          <button
            className="icon-btn-ghost"
            onClick={handleClear}
            title="Clear Terminal View"
            aria-label="Clear Terminal View"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="terminal-viewport" ref={viewportRef} onScroll={handleScroll}>
        {activeProcessSession && (
          <div className="terminal-line-header">
            &gt; {activeProcessSession.commandDisplay}
          </div>
        )}
        {activeProcessSession && (
          <div className="terminal-line-meta">
            [cwd: {activeProcessSession.cwd}]
            {activeProcessSession.startedAt && ` • started ${new Date(activeProcessSession.startedAt).toLocaleTimeString()}`}
            {activeProcessSession.durationMs !== undefined && ` • duration ${activeProcessSession.durationMs}ms`}
          </div>
        )}

        {outputContent ? (
          <div>{outputContent}</div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>
            {isRunning
              ? 'Process running, waiting for output...'
              : 'Terminal ready. Click a package.json script above or run an agent task.'}
          </div>
        )}

        {activeProcessSession?.outputTruncated && (
          <div style={{ color: 'var(--color-warning)', marginTop: '8px', fontSize: '11px' }}>
            [Output truncated: exceeded 5 MB buffer limit]
          </div>
        )}
      </div>

      {/* Truthful Security Disclaimer Footer */}
      <div className="terminal-footer-disclaimer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={12} className="text-secondary" />
          <span>
            Supervised execution • Normal Windows user permissions • Safety snapshots enabled
          </span>
        </div>
        <div>
          <span>Pass 6 Process Engine</span>
        </div>
      </div>
    </div>
  );
};
