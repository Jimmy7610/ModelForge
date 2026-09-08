import React, { useState, useMemo } from 'react';
import { Activity, Trash2, CheckCircle2, Eye, ShieldCheck, AlertCircle, Loader2, ShieldAlert } from 'lucide-react';

import { useAppStore } from '@/store/AppStoreContext';
import { CopyButton } from '@/components/CopyButton';
import './AgentActivity.css';

interface ActivityStep {
  id: string;
  label: string;
  time: string;
  status: 'done' | 'running' | 'error' | 'blocked';
  detail?: string;
}

const PREVIEW_STEPS: ActivityStep[] = [
  { id: '1', label: 'Inspected project overview', time: '10:31:02', status: 'done', detail: 'ModelForge (TypeScript)' },
  { id: '2', label: 'Listed src', time: '10:31:04', status: 'done', detail: '14 files' },
  { id: '3', label: 'Read package.json', time: '10:31:05', status: 'done' },
  { id: '4', label: 'Read src/App.tsx', time: '10:31:07', status: 'done' },
  { id: '5', label: 'Searched "achievement"', time: '10:31:09', status: 'done', detail: '3 matches' },
  { id: '6', label: 'Read src/game.ts', time: '10:31:11', status: 'done' },
  { id: '7', label: 'Created architecture plan', time: '10:31:15', status: 'done' },
];

export const AgentActivity: React.FC = () => {
  const {
    agentActivities,
    clearAgentActivities,
    isPlanning,
    isEditing,
    editAgentState,
    permissionLevel,
    addToast,
  } = useAppStore();
  const [showPreview, setShowPreview] = useState(false);

  // Determine run kind: check explicit active flags or activities
  const isEditRun = useMemo(() => {
    if (isEditing) return true;
    if (isPlanning) return false;
    if (agentActivities.length > 0) {
      const last = agentActivities[agentActivities.length - 1];
      if (last.runKind === 'edit') return true;
      if (last.runKind === 'plan') return false;
      return agentActivities.some(
        (a) =>
          a.toolName === 'replace_in_file' ||
          a.toolName === 'create_file' ||
          a.toolName === 'write_file' ||
          a.toolName === 'delete_file' ||
          a.label.includes('Modifying') ||
          a.label.includes('Creating') ||
          a.label.includes('Writing') ||
          a.label.includes('Deleted') ||
          a.label.includes('Edit')
      );
    }
    return false;
  }, [isEditing, isPlanning, agentActivities]);

  const { successfulMutations, blockedMutations, readsCount } = useMemo(() => {
    let successfulMutations = 0;
    let blockedMutations = 0;
    let readsCount = 0;

    for (const a of agentActivities) {
      const isMutationTool =
        a.toolName === 'replace_in_file' ||
        a.toolName === 'create_file' ||
        a.toolName === 'write_file' ||
        a.toolName === 'delete_file';

      if (isMutationTool) {
        if (a.status === 'done') successfulMutations++;
        else if (a.status === 'blocked') blockedMutations++;
      } else if (
        a.toolName === 'read_file' ||
        a.toolName === 'list_dir' ||
        a.toolName === 'file_search' ||
        a.toolName === 'find_in_files' ||
        a.toolName === 'get_project_overview'
      ) {
        if (a.status === 'done') readsCount++;
      }
    }

    if (editAgentState?.summary) {
      successfulMutations =
        editAgentState.summary.filesModified.length +
        editAgentState.summary.filesCreated.length +
        editAgentState.summary.filesDeleted.length;
      blockedMutations = editAgentState.summary.blockedToolCalls;
    }

    return { successfulMutations, blockedMutations, readsCount };
  }, [agentActivities, editAgentState]);

  const displaySteps: ActivityStep[] = showPreview
    ? PREVIEW_STEPS
    : agentActivities.map((a) => ({
        id: a.id,
        label: a.label,
        time: a.time,
        status: a.status,
        detail: a.detail,
      }));

  const getActivityLogSummary = (): string => {
    if (displaySteps.length === 0) return '';
    return displaySteps
      .map((s) => `[${s.time}] [${s.status.toUpperCase()}] ${s.label}${s.detail ? ` (${s.detail})` : ''}`)
      .join('\n');
  };

  const handleClear = () => {
    if (showPreview) {
      setShowPreview(false);
      addToast('Preview cleared.', 'info');
      return;
    }

    if (agentActivities.length > 0) {
      clearAgentActivities();
      addToast('Agent activity log cleared.', 'info');
    } else {
      addToast('Agent activity log is already empty.', 'info');
    }
  };

  const hasContent = displaySteps.length > 0;

  return (
    <div className="panel agent-activity-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <Activity size={14} className="text-secondary" />
          <span>Agent Activity</span>
          {isPlanning && <span className="badge badge-accent">Plan Running</span>}
          {isEditing && <span className="badge badge-accent">Edit Running</span>}
          {!isPlanning && !isEditing && hasContent && (
            <span className="badge badge-secondary">{isEditRun ? 'Edit Run' : 'Plan Run'}</span>
          )}
          {showPreview && <span className="badge badge-local">Preview</span>}
        </div>
        <div className="activity-header-actions">
          <CopyButton
            text={getActivityLogSummary}
            label="Copy Log"
            compact
            disabled={!hasContent}
            tooltip="Copy activity log to clipboard"
            ariaLabel="Copy activity log"
          />
          <button
            className="btn-ghost-sm"
            onClick={() => setShowPreview((p) => !p)}
            title="Toggle between real activity and preview layout"
          >
            <Eye size={12} />
            <span>{showPreview ? 'Show Real Log' : 'Preview Layout'}</span>
          </button>
          <button
            className="btn-ghost-sm"
            onClick={handleClear}
            title="Clear activity log"
          >
            <Trash2 size={12} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Body: Either Empty State OR Real Timeline */}
      {!hasContent ? (
        <div className="activity-empty-state">
          <div className="activity-empty-graphic">
            <div className="pulse-ring" />
            <Activity size={24} className="text-secondary" />
          </div>
          <div className="activity-empty-title">Agent ready</div>
          <div className="activity-empty-sub">
            Activity will appear here when a plan or task runs.
          </div>
        </div>
      ) : (
        <div className="activity-timeline-container">
          <div className="activity-steps">
            {displaySteps.map((step, idx) => {
              const isLast = idx === displaySteps.length - 1;
              return (
                <div key={step.id} className="timeline-item">
                  <div className="timeline-connector-col">
                    <div className="timeline-node">
                      {step.status === 'done' ? (
                        <CheckCircle2 size={14} className="node-icon done" />
                      ) : step.status === 'running' ? (
                        <Loader2 size={14} className="node-icon running spinner" />
                      ) : step.status === 'blocked' ? (
                        <ShieldAlert size={14} className="node-icon blocked" />
                      ) : (
                        <AlertCircle size={14} className="node-icon error" />
                      )}
                    </div>
                    {!isLast && <div className="timeline-line" />}
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-label-row">
                      <span className={`timeline-label ${step.status === 'running' ? 'running' : step.status === 'blocked' ? 'blocked' : ''}`}>
                        {step.label}
                      </span>
                      <span className="timeline-time font-mono">{step.time}</span>
                    </div>
                    {step.detail && (
                      <div className="timeline-detail-row">
                        <span className="timeline-detail text-muted font-mono">{step.detail}</span>
                        <CopyButton
                          text={step.detail}
                          compact
                          tooltip="Copy step detail"
                          ariaLabel={`Copy detail for ${step.label}`}
                          className="timeline-copy-btn"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Safe Mode Status Card */}
          {permissionLevel === 'AGENT' ? (
            <div className="test-metric-card">
              <div className="test-metric-left">
                <div className="test-pass-badge" style={{ background: 'rgba(56, 189, 248, 0.15)', borderColor: 'rgba(56, 189, 248, 0.4)' }}>
                  <ShieldCheck size={22} style={{ color: '#38bdf8' }} />
                </div>
                <div className="test-pass-info">
                  <div className="test-pass-score font-mono" style={{ color: '#38bdf8' }}>AGENT — SUPERVISED RUN</div>
                  <div className="test-pass-sub">
                    {displaySteps.length} action{displaySteps.length === 1 ? '' : 's'} recorded · {successfulMutations} mutation{successfulMutations === 1 ? '' : 's'} applied
                  </div>
                </div>
              </div>

              <div className="test-metric-stats font-mono">
                <div className="metric-stat-row">
                  <span className="stat-label">Mode</span>
                  <span className="stat-value text-accent">Agent (Supervised)</span>
                </div>
                <div className="metric-stat-row">
                  <span className="stat-label">File Tools</span>
                  <span className="stat-value text-success">Workspace Jailed</span>
                </div>
                <div className="metric-stat-row">
                  <span className="stat-label">Processes</span>
                  <span className="stat-value text-accent">Windows Perms</span>
                </div>
                <div className="metric-stat-row">
                  <span className="stat-label">Mutations</span>
                  <span className="stat-value text-success">
                    {successfulMutations} applied{blockedMutations > 0 ? ` (${blockedMutations} blocked)` : ''}
                  </span>
                </div>
                {readsCount > 0 && (
                  <div className="metric-stat-row">
                    <span className="stat-label">Reads</span>
                    <span className="stat-value text-muted">{readsCount} inspected</span>
                  </div>
                )}
              </div>
            </div>
          ) : isEditRun ? (
            <div className="test-metric-card">
              <div className="test-metric-left">
                <div className="test-pass-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.4)' }}>
                  <ShieldCheck size={22} style={{ color: '#34d399' }} />
                </div>
                <div className="test-pass-info">
                  <div className="test-pass-score font-mono" style={{ color: '#34d399' }}>EDIT SAFE JAIL</div>
                  <div className="test-pass-sub">
                    {displaySteps.length} action{displaySteps.length === 1 ? '' : 's'} recorded · {successfulMutations} mutation{successfulMutations === 1 ? '' : 's'} applied
                  </div>
                </div>
              </div>

              <div className="test-metric-stats font-mono">
                <div className="metric-stat-row">
                  <span className="stat-label">Mode</span>
                  <span className="stat-value text-success">Edit</span>
                </div>
                <div className="metric-stat-row">
                  <span className="stat-label">Jail Root</span>
                  <span className="stat-value text-success">Contained</span>
                </div>
                <div className="metric-stat-row">
                  <span className="stat-label">Mutations</span>
                  <span className="stat-value text-success">
                    {successfulMutations} applied{blockedMutations > 0 ? ` (${blockedMutations} blocked)` : ''}
                  </span>
                </div>
                {readsCount > 0 && (
                  <div className="metric-stat-row">
                    <span className="stat-label">Reads</span>
                    <span className="stat-value text-muted">{readsCount} inspected</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="test-metric-card">
              <div className="test-metric-left">
                <div className="test-pass-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.4)' }}>
                  <ShieldCheck size={22} style={{ color: '#60a5fa' }} />
                </div>
                <div className="test-pass-info">
                  <div className="test-pass-score font-mono">READ-ONLY SAFE JAIL</div>
                  <div className="test-pass-sub">
                    {displaySteps.length} action{displaySteps.length === 1 ? '' : 's'} recorded · 0 mutations allowed
                  </div>
                </div>
              </div>

              <div className="test-metric-stats font-mono">
                <div className="metric-stat-row">
                  <span className="stat-label">Mode</span>
                  <span className="stat-value text-primary">Plan / Read</span>
                </div>
                <div className="metric-stat-row">
                  <span className="stat-label">Jail Root</span>
                  <span className="stat-value text-success">Contained</span>
                </div>
                <div className="metric-stat-row">
                  <span className="stat-label">Mutations</span>
                  <span className="stat-value">0 allowed</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
