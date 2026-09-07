import React, { useState } from 'react';
import { Edit3, Play, ListOrdered, Bookmark, ChevronDown, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import { CopyButton } from '@/components/CopyButton';
import './PromptComposer.css';

export const PromptComposer: React.FC = () => {
  const {
    activeProject,
    activeModel,
    addToast,
    isPlanning,
    runPlanAgent,
    stopPlanAgent,
    isEditing,
    permissionLevel,
    setEditPermissionModalOpen,
    runEditAgent,
    stopEditAgent,
    createManualCheckpoint,
  } = useAppStore();

  const [prompt, setPrompt] = useState('');
  const [activeMessage, setActiveMessage] = useState<string | null>(null);

  const maxChars = 4000;

  const handleRunAgent = () => {
    if (isEditing) {
      stopEditAgent();
      return;
    }

    if (!activeModel) {
      const msg = 'No model loaded. Open Models library to load a GGUF model first.';
      setActiveMessage(msg);
      addToast(msg, 'warning');
      return;
    }
    if (!activeProject) {
      const msg = 'Select an active project first.';
      setActiveMessage(msg);
      addToast(msg, 'warning');
      return;
    }
    if (!prompt.trim()) {
      const msg = 'Enter instructions for what you want the Edit Agent to build or modify.';
      setActiveMessage(msg);
      addToast(msg, 'warning');
      return;
    }

    if (permissionLevel !== 'EDIT') {
      setEditPermissionModalOpen(true);
      return;
    }

    setActiveMessage(null);
    runEditAgent(prompt.trim());
  };

  const handlePlan = () => {
    if (!activeProject) {
      const msg = 'Select an active project first to generate an architecture plan.';
      setActiveMessage(msg);
      addToast(msg, 'warning');
      return;
    }
    if (!activeModel) {
      const msg = 'Planning engine requires a loaded local model. Open Models to load a GGUF model.';
      setActiveMessage(msg);
      addToast(msg, 'warning');
      return;
    }
    if (!prompt.trim()) {
      const msg = 'Enter a prompt describing what to analyze or plan (e.g. "Analyze this project and explain its architecture").';
      setActiveMessage(msg);
      addToast(msg, 'warning');
      return;
    }

    if (isPlanning) {
      stopPlanAgent();
      return;
    }

    setActiveMessage(null);
    runPlanAgent(prompt.trim());
  };

  const handleCheckpoint = async () => {
    if (!activeProject) {
      const msg = 'No active project selected. Open or add a project to create checkpoints.';
      setActiveMessage(msg);
      addToast(msg, 'warning');
      return;
    }
    await createManualCheckpoint(`Manual checkpoint for ${activeProject.name}`);
  };


  return (
    <div className="panel prompt-composer-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <Edit3 size={14} className="text-secondary" />
          <span>Prompt / Composer</span>
        </div>
        {prompt.trim().length > 0 && (
          <CopyButton
            text={prompt}
            label="Copy Prompt"
            compact
            tooltip="Copy prompt text to clipboard"
            ariaLabel="Copy prompt text"
          />
        )}
      </div>

      {/* Contextual Feedback Banner if triggered */}
      {activeMessage && (
        <div className="composer-feedback-banner">
          <AlertCircle size={14} className="feedback-icon" />
          <span className="feedback-text">{activeMessage}</span>
          <CopyButton
            text={activeMessage}
            compact
            tooltip="Copy notice"
            ariaLabel="Copy notice details"
          />
          <button
            className="feedback-dismiss"
            onClick={() => setActiveMessage(null)}
            title="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="composer-input-container">
        <textarea
          className="composer-textarea"
          placeholder="Describe what you want Model Forge to build..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, maxChars))}
          rows={5}
        />
        <div className="composer-counter font-mono">
          {prompt.length} / {maxChars}
        </div>
      </div>

      {/* Actions Toolbar */}
      <div className="composer-actions">
        <div className="action-button-group">
          <button
            className={`btn ${isEditing ? 'btn-danger' : 'btn-primary'} btn-run-agent`}
            onClick={handleRunAgent}
            title={isEditing ? 'Stop running Edit Agent' : 'Run autonomous Edit Agent with active model'}
          >
            <Play size={13} fill="currentColor" />
            <span>{isEditing ? 'Stop Agent' : 'Run Agent'}</span>
          </button>

          <button
            className={`btn ${isPlanning ? 'btn-danger' : 'btn-secondary'}`}
            onClick={handlePlan}
            title={isPlanning ? 'Stop current planning run' : 'Generate step-by-step implementation plan'}
          >
            <ListOrdered size={13} />
            <span>{isPlanning ? 'Stop Plan' : 'Plan'}</span>
          </button>


          <button
            className="btn btn-secondary"
            onClick={handleCheckpoint}
            title="Create a workspace snapshot"
          >
            <Bookmark size={13} />
            <span>Checkpoint</span>
            <ChevronDown size={12} className="text-muted" />
          </button>
        </div>
      </div>
    </div>
  );
};
