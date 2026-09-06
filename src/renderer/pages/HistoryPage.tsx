import React from 'react';
import { History as HistoryIcon, Filter } from 'lucide-react';
import './HistoryPage.css';

export const HistoryPage: React.FC = () => {
  return (
    <div className="history-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-subtitle">Past agent runs, diff logs, and task checkpoints</p>
        </div>
        <button className="btn btn-secondary" disabled>
          <Filter size={13} />
          <span>Filter</span>
        </button>
      </div>

      <div className="panel history-empty-panel">
        <div className="history-empty-state">
          <div className="history-empty-icon-wrap">
            <HistoryIcon size={36} className="text-secondary" strokeWidth={1.5} />
          </div>
          <h3 className="empty-title">No sessions yet</h3>
          <p className="empty-desc">
            When you run tasks in the Builder, full chronological logs of agent tool calls,
            source code diffs, and test assertions will be securely archived locally.
          </p>
          <div className="history-meta-hint text-muted text-xs">
            Sessions are indexed in a local database with zero cloud telemetry.
          </div>
        </div>
      </div>
    </div>
  );
};
