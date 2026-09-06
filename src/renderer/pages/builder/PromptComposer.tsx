import React, { useState } from 'react';
import { Edit3, Play, ListOrdered, Bookmark, ChevronDown, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './PromptComposer.css';

export const PromptComposer: React.FC = () => {
  const { activeProject, activeModel, addToast, setActiveTab } = useAppStore();
  const [prompt, setPrompt] = useState('');
  const [activeMessage, setActiveMessage] = useState<string | null>(null);

  const maxChars = 4000;

  const handleRunAgent = () => {
    if (!activeModel) {
      const msg = 'No model loaded. Open Models library to load a GGUF model first.';
      setActiveMessage(msg);
      addToast(msg, 'warning');
      return;
    }
    const msg = 'Autonomous agent execution loop is scheduled for Pass 4. Use the Chat tab below for direct real-time model interaction.';
    setActiveMessage(msg);
    addToast(msg, 'info');
    setActiveTab('chat');
  };

  const handlePlan = () => {
    if (!activeProject) {
      const msg = 'Select a project first to generate an architecture plan.';
      setActiveMessage(msg);
      addToast(msg, 'warning');
      return;
    }
    const msg = 'Planning engine requires a loaded local model.';
    setActiveMessage(msg);
    addToast(msg, 'info');
  };

  const handleCheckpoint = () => {
    if (!activeProject) {
      const msg = 'No active project selected. Open or add a project to create git checkpoints.';
      setActiveMessage(msg);
      addToast(msg, 'warning');
      return;
    }
    const msg = `Checkpoint engine ready for project "${activeProject.name}". (Git integration active in next pass)`;
    setActiveMessage(msg);
    addToast(msg, 'info');
  };

  return (
    <div className="panel prompt-composer-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <Edit3 size={14} className="text-secondary" />
          <span>Prompt / Composer</span>
        </div>
      </div>

      {/* Contextual Feedback Banner if triggered */}
      {activeMessage && (
        <div className="composer-feedback-banner">
          <AlertCircle size={14} className="feedback-icon" />
          <span className="feedback-text">{activeMessage}</span>
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
            className="btn btn-primary btn-run-agent"
            onClick={handleRunAgent}
            title="Run autonomous agent with active model"
          >
            <Play size={13} fill="currentColor" />
            <span>Run Agent</span>
            <div className="btn-divider" />
            <ChevronDown size={13} />
          </button>

          <button
            className="btn btn-secondary"
            onClick={handlePlan}
            title="Generate step-by-step implementation plan"
          >
            <ListOrdered size={13} />
            <span>Plan</span>
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
