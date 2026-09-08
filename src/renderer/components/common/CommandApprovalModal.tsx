import React, { useState } from 'react';
import { Terminal, X, AlertTriangle, Play, Ban } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './EditPermissionModal.css';

export const CommandApprovalModal: React.FC = () => {
  const {
    pendingCommandRequest,
    approveCommandRequest,
    denyCommandRequest,
  } = useAppStore();

  const [denyReason, setDenyReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!pendingCommandRequest) {
    return null;
  }

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await approveCommandRequest(pendingCommandRequest.requestId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeny = async () => {
    setIsSubmitting(true);
    try {
      await denyCommandRequest(pendingCommandRequest.requestId, denyReason.trim() || undefined);
    } finally {
      setIsSubmitting(false);
      setDenyReason('');
    }
  };

  const commandLine = `${pendingCommandRequest.resolvedExecutable} ${pendingCommandRequest.resolvedArgs.join(' ')}`;

  return (
    <div className="modal-backdrop" onClick={handleDeny}>
      <div className="modal-dialog edit-permission-dialog" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Terminal size={18} className="text-accent" />
            <span className="modal-title">Process Execution Approval</span>
            <span className="badge badge-accent" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
              {pendingCommandRequest.initiator === 'agent' ? 'Agent Requested' : 'Manual Run'}
            </span>
          </div>
          <button
            className="icon-btn-ghost"
            onClick={handleDeny}
            aria-label="Close"
            disabled={isSubmitting}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body edit-permission-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Script Name:
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                npm run {pendingCommandRequest.scriptName}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Resolved Command (shell: false):
              </div>
              <div
                className="font-mono"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  padding: '8px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  border: '1px solid var(--border-subtle)',
                  wordBreak: 'break-all',
                }}
              >
                {commandLine}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Working Directory:
              </div>
              <div
                className="font-mono text-secondary"
                style={{ fontSize: '11px', wordBreak: 'break-all' }}
              >
                {pendingCommandRequest.cwd}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Reason:
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                {pendingCommandRequest.reason}
              </div>
            </div>

            {/* Truthful Security Notice */}
            <div
              style={{
                backgroundColor: 'rgba(234, 179, 8, 0.08)',
                border: '1px solid rgba(234, 179, 8, 0.25)',
                borderRadius: '6px',
                padding: '8px 10px',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
              }}
            >
              <AlertTriangle size={15} className="text-warning" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                <strong>Truthful security notice:</strong> Model Forge supervises execution and captures a pre-process safety snapshot, but processes run directly on your system with your normal Windows user permissions.
              </div>
            </div>

            <div>
              <input
                type="text"
                placeholder="Optional denial feedback to Agent..."
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: '11px',
                  backgroundColor: 'rgba(0,0,0,0.25)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer edit-permission-footer" style={{ justifyContent: 'space-between' }}>
          <button
            className="btn btn-danger"
            onClick={handleDeny}
            disabled={isSubmitting}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Ban size={14} />
            <span>Deny Command</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={handleApprove}
            disabled={isSubmitting}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Play size={14} />
            <span>Approve & Run</span>
          </button>
        </div>
      </div>
    </div>
  );
};
