import React, { useEffect, useState } from 'react';
import { History as HistoryIcon, Terminal, CheckCircle2, XCircle, Clock, Square } from 'lucide-react';
import { ProcessSessionInfo } from '@shared/types';
import { CopyButton } from '@/components/CopyButton';
import './HistoryPage.css';

export const HistoryPage: React.FC = () => {
  const [processRuns, setProcessRuns] = useState<ProcessSessionInfo[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchHistory = async () => {
      try {
        if (typeof window !== 'undefined' && window.modelForge?.getProcessHistory) {
          const runs = await window.modelForge.getProcessHistory();
          if (mounted) {
            setProcessRuns(runs || []);
          }
        }
      } catch (err) {
        console.error('[HistoryPage] Failed to load process history:', err);
      }
    };
    fetchHistory();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="history-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-subtitle">Past process runs, agent activities, and checkpoints</p>
        </div>
      </div>

      {processRuns.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Terminal size={16} className="text-accent" />
            <h2 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Process Execution Runs</h2>
            <span className="badge badge-accent" style={{ fontSize: '10px' }}>
              {processRuns.length} recorded
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {processRuns.map((run) => {
              const detailsText = `Command: ${run.commandDisplay}\nProject: ${run.projectId}\nStatus: ${run.status}\nExit Code: ${run.exitCode ?? 'N/A'}\nDuration: ${run.durationMs ?? 0} ms\nTime: ${run.startedAt || 'N/A'}\n\nSTDOUT:\n${run.retainedStdout || ''}\n\nSTDERR:\n${run.retainedStderr || ''}`;

              return (
                <div
                  key={run.id}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {run.status === 'completed' && <CheckCircle2 size={16} className="text-success" />}
                    {run.status === 'failed' && <XCircle size={16} className="text-danger" />}
                    {run.status === 'cancelled' && <Square size={16} className="text-warning" />}
                    {run.status === 'interrupted' && <AlertTriangleIcon size={16} className="text-warning" />}
                    {(run.status === 'running' || run.status === 'starting') && (
                      <Clock size={16} className="text-accent animate-spin" />
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div
                        className="font-mono"
                        style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}
                      >
                        {run.commandDisplay}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', marginTop: '2px' }}>
                        <span>Project: {run.projectId}</span>
                        <span>Exit: {run.exitCode ?? (run.status === 'completed' ? 0 : '—')}</span>
                        {run.durationMs !== undefined && <span>{run.durationMs}ms</span>}
                        {run.startedAt && <span>{new Date(run.startedAt).toLocaleTimeString()}</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span
                      className="badge"
                      style={{
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        backgroundColor:
                          run.status === 'completed'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : run.status === 'failed'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(234, 179, 8, 0.15)',
                        color:
                          run.status === 'completed'
                            ? 'var(--color-success)'
                            : run.status === 'failed'
                            ? 'var(--color-danger)'
                            : 'var(--color-warning)',
                      }}
                    >
                      {run.status}
                    </span>
                    <CopyButton text={detailsText} label="Copy Run" compact />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {processRuns.length === 0 && (
        <div className="panel history-empty-panel">
          <div className="history-empty-state">
            <div className="history-empty-icon-wrap">
              <HistoryIcon size={36} className="text-secondary" strokeWidth={1.5} />
            </div>
            <h3 className="empty-title">No sessions yet</h3>
            <p className="empty-desc">
              When you run tasks in the Builder or Terminal, full chronological logs of script executions,
              source code diffs, and test assertions are securely archived locally.
            </p>
            <div className="history-meta-hint text-muted text-xs">
              Sessions are indexed locally under userData with zero cloud telemetry.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AlertTriangleIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
