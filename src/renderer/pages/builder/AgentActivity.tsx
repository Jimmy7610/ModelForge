import React, { useState } from 'react';
import { Activity, Trash2, CheckCircle2, Eye, ShieldCheck, AlertCircle, Loader2, ShieldAlert } from 'lucide-react';

import { useAppStore } from '@/store/AppStoreContext';
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
  const { agentActivities, clearAgentActivities, isPlanning, addToast } = useAppStore();
  const [showPreview, setShowPreview] = useState(false);

  const displaySteps: ActivityStep[] = showPreview
    ? PREVIEW_STEPS
    : agentActivities.map((a) => ({
        id: a.id,
        label: a.label,
        time: a.time,
        status: a.status,
        detail: a.detail,
      }));

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
          {isPlanning && <span className="badge badge-accent">Running</span>}
          {showPreview && <span className="badge badge-local">Preview</span>}
        </div>
        <div className="activity-header-actions">
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
                      <span className="timeline-detail text-muted font-mono">{step.detail}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Safe Mode Status Card */}
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
                <span className="stat-value">0 blocked</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
