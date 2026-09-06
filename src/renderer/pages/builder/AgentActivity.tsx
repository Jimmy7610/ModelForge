import React, { useState } from 'react';
import { Activity, Trash2, CheckCircle2, Circle, Eye } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './AgentActivity.css';

interface ActivityStep {
  id: string;
  label: string;
  time: string;
  status: 'done' | 'running';
}

const PREVIEW_STEPS: ActivityStep[] = [
  { id: '1', label: 'Scanned project', time: '10:31:02', status: 'done' },
  { id: '2', label: 'Read 47 files', time: '10:31:04', status: 'done' },
  { id: '3', label: 'Created architecture plan', time: '10:31:07', status: 'done' },
  { id: '4', label: 'Modified src/game.ts', time: '10:31:11', status: 'done' },
  { id: '5', label: 'Created src/bosses.ts', time: '10:31:15', status: 'done' },
  { id: '6', label: 'Added 31 tests', time: '10:31:22', status: 'done' },
  { id: '7', label: 'Running npm test...', time: '10:31:25', status: 'running' },
];

export const AgentActivity: React.FC = () => {
  const { addToast } = useAppStore();
  const [showPreview, setShowPreview] = useState(false);

  const handleClear = () => {
    if (showPreview) {
      setShowPreview(false);
      addToast('Activity timeline cleared.', 'info');
    } else {
      addToast('Agent activity log is already empty.', 'info');
    }
  };

  return (
    <div className="panel agent-activity-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <Activity size={14} className="text-secondary" />
          <span>Agent Activity</span>
          {showPreview && <span className="badge badge-accent">Demo Preview</span>}
        </div>
        <div className="activity-header-actions">
          <button
            className="btn-ghost-sm"
            onClick={() => setShowPreview((p) => !p)}
            title="Toggle between honest empty state and preview activity"
          >
            <Eye size={12} />
            <span>{showPreview ? 'Show Empty State' : 'Preview Layout'}</span>
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

      {/* Body: Either Honest Empty State OR Layout Preview */}
      {!showPreview ? (
        <div className="activity-empty-state">
          <div className="activity-empty-graphic">
            <div className="pulse-ring" />
            <Activity size={24} className="text-secondary" />
          </div>
          <div className="activity-empty-title">Agent ready</div>
          <div className="activity-empty-sub">
            Activity will appear here when a task runs.
          </div>
        </div>
      ) : (
        <div className="activity-timeline-container">
          <div className="activity-steps">
            {PREVIEW_STEPS.map((step, idx) => {
              const isLast = idx === PREVIEW_STEPS.length - 1;
              return (
                <div key={step.id} className="timeline-item">
                  <div className="timeline-connector-col">
                    <div className="timeline-node">
                      {step.status === 'done' ? (
                        <CheckCircle2 size={14} className="node-icon done" />
                      ) : (
                        <Circle size={14} className="node-icon running" />
                      )}
                    </div>
                    {!isLast && <div className="timeline-line" />}
                  </div>
                  <div className="timeline-content">
                    <span className={`timeline-label ${step.status === 'running' ? 'running' : ''}`}>
                      {step.label}
                    </span>
                    <span className="timeline-time font-mono">{step.time}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Test Pass Metric Card matching mockup */}
          <div className="test-metric-card">
            <div className="test-metric-left">
              <div className="test-pass-badge">
                <CheckCircle2 size={24} className="text-success" />
              </div>
              <div className="test-pass-info">
                <div className="test-pass-score font-mono">198 / 198 PASS</div>
                <div className="test-pass-sub">All tests passed</div>
              </div>
            </div>

            <div className="test-metric-stats font-mono">
              <div className="metric-stat-row">
                <span className="stat-label">Duration</span>
                <span className="stat-value">00:18:42</span>
              </div>
              <div className="metric-stat-row">
                <span className="stat-label">Test Files</span>
                <span className="stat-value">31</span>
              </div>
              <div className="metric-stat-row">
                <span className="stat-label">Assertions</span>
                <span className="stat-value">1,248</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
