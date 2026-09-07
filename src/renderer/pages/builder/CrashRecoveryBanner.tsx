import React from 'react';
import { AlertTriangle, GitCompare, RotateCcw, Check, X } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './CrashRecoveryBanner.css';

export const CrashRecoveryBanner: React.FC = () => {
  const {
    pendingCheckpoint,
    setActiveTab,
    rollbackCheckpoint,
    acceptCheckpoint,
    dismissRecoveryBanner,
    isRecoveryBannerDismissed,
  } = useAppStore();

  if (!pendingCheckpoint || isRecoveryBannerDismissed) {
    return null;
  }

  const handleReviewDiff = () => {
    setActiveTab('diff');
  };

  const handleRollback = async () => {
    await rollbackCheckpoint();
  };

  const handleKeepChanges = async () => {
    await acceptCheckpoint();
  };

  return (
    <div className="crash-recovery-banner">
      <div className="banner-left">
        <AlertTriangle size={16} className="text-warning banner-icon" />
        <span className="banner-message font-medium">
          Unreviewed changes from an interrupted Edit session
        </span>
        <span className="banner-meta text-muted font-mono">
          ({pendingCheckpoint.filesCount} file(s) touched)
        </span>
      </div>

      <div className="banner-actions">
        <button
          className="btn btn-sm btn-secondary btn-review-diff"
          onClick={handleReviewDiff}
          title="Inspect changes in Diff tab"
        >
          <GitCompare size={13} />
          <span>Review Diff</span>
        </button>

        <button
          className="btn btn-sm btn-danger btn-rollback"
          onClick={handleRollback}
          title="Rollback all changes to baseline"
        >
          <RotateCcw size={13} />
          <span>Rollback</span>
        </button>

        <button
          className="btn btn-sm btn-success btn-keep-changes"
          onClick={handleKeepChanges}
          title="Keep current changes and mark accepted"
        >
          <Check size={13} />
          <span>Keep Changes</span>
        </button>

        <button
          className="icon-btn-ghost banner-dismiss"
          onClick={dismissRecoveryBanner}
          title="Dismiss banner"
          aria-label="Dismiss banner"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
