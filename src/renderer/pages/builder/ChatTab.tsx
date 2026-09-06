import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import {
  Send,
  Square,
  Trash2,
  Cpu,
  Zap,
  Bot,
  User,
  Sparkles,
  ArrowUpRight,
  Loader2,
  HardDrive,
} from 'lucide-react';
import { useAppStore } from '@/store/AppStoreContext';
import './ChatTab.css';

const SUGGESTIONS = [
  'Hello. Tell me what model you are.',
  'Explain what a GGUF model is.',
  'Write a TypeScript function to debounce an event.',
];

export const ChatTab: React.FC = () => {
  const {
    activeModel,
    inferenceState,
    chatMessages,
    isGenerating,
    sendChatMessage,
    stopGeneration,
    clearChat,
    setCurrentPage,
    models,
    loadModel,
  } = useAppStore();

  const [inputPrompt, setInputPrompt] = useState('');
  const [selectedQuickModelId, setSelectedQuickModelId] = useState<string>('');
  const [isLoadingQuickModel, setIsLoadingQuickModel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll on message updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isGenerating]);

  // Focus textarea when model becomes active
  useEffect(() => {
    if (activeModel) {
      textareaRef.current?.focus();
    }
  }, [activeModel]);

  const handleSend = async () => {
    const trimmed = inputPrompt.trim();
    if (!trimmed || isGenerating || !activeModel) return;

    setInputPrompt('');
    await sendChatMessage(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickLoad = async () => {
    const targetId = selectedQuickModelId || models[0]?.id;
    if (!targetId) return;
    setIsLoadingQuickModel(true);
    try {
      await loadModel(targetId);
    } finally {
      setIsLoadingQuickModel(false);
    }
  };

  const backendName = inferenceState?.runtime.backend?.toUpperCase() || 'CPU';

  // State: No Model Loaded
  if (!activeModel) {
    return (
      <div className="chat-empty-container">
        <div className="chat-empty-card">
          <div className="chat-empty-icon-wrap">
            <Cpu size={32} className="text-accent" />
          </div>
          <h3 className="chat-empty-title">No Local Model Loaded</h3>
          <p className="chat-empty-sub">
            Model Forge runs completely offline with its built-in inference core. Load any of your
            discovered GGUF models into memory to begin streaming conversations.
          </p>

          {models.length > 0 ? (
            <div className="chat-quick-load-box">
              <div className="chat-quick-load-row">
                <select
                  className="chat-quick-select"
                  value={selectedQuickModelId || models[0]?.id}
                  onChange={(e) => setSelectedQuickModelId(e.target.value)}
                  disabled={isLoadingQuickModel}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} ({m.quantization || 'GGUF'} · {(m.sizeBytes / (1024 ** 3)).toFixed(1)} GB)
                    </option>
                  ))}
                </select>
                <button
                  className="btn-primary chat-quick-load-btn"
                  onClick={handleQuickLoad}
                  disabled={isLoadingQuickModel}
                >
                  {isLoadingQuickModel ? (
                    <>
                      <Loader2 size={14} className="spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      <span>Load Model</span>
                    </>
                  )}
                </button>
              </div>
              <button
                className="btn-ghost-sm mt-3"
                onClick={() => setCurrentPage('models')}
              >
                <span>Browse Full Model Library</span>
                <ArrowUpRight size={13} />
              </button>
            </div>
          ) : (
            <div className="chat-no-models-box">
              <HardDrive size={18} className="text-muted" />
              <span>No GGUF models discovered yet.</span>
              <button
                className="btn-primary btn-sm ml-2"
                onClick={() => setCurrentPage('models')}
              >
                Configure Model Library
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // State: Model Loaded - Interactive Streaming Chat
  return (
    <div className="chat-tab-container">
      {/* Top Session Bar */}
      <div className="chat-session-header">
        <div className="chat-model-badge">
          <span className="chat-status-dot active" />
          <span className="chat-model-name">{activeModel.name}</span>
          <span className="chat-model-meta">
            {activeModel.architecture} · {activeModel.quantization} · {activeModel.contextLength} ctx
          </span>
        </div>

        <div className="chat-header-actions">
          <span className="chat-backend-tag">
            <Cpu size={12} />
            <span>Built-in Core: {backendName}</span>
          </span>

          {chatMessages.length > 0 && (
            <button
              className="chat-clear-btn"
              onClick={clearChat}
              title="Clear conversation history"
              disabled={isGenerating}
            >
              <Trash2 size={13} />
              <span>Clear Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="chat-messages-area">
        {chatMessages.length === 0 ? (
          <div className="chat-welcome">
            <div className="chat-welcome-badge">
              <Sparkles size={16} className="text-accent" />
              <span>Session Ready</span>
            </div>
            <h4>Ready to chat with {activeModel.name}</h4>
            <p>
              Inference is executing directly inside Model Forge on your local{' '}
              <strong>{inferenceState?.runtime.gpuName || backendName}</strong>.
            </p>

            <div className="chat-suggestions-grid">
              {SUGGESTIONS.map((sug, idx) => (
                <button
                  key={idx}
                  className="chat-suggestion-chip"
                  onClick={() => setInputPrompt(sug)}
                >
                  <span>{sug}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-messages-list">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message-row ${msg.role === 'user' ? 'user-row' : 'assistant-row'}`}
              >
                <div className="chat-message-avatar">
                  {msg.role === 'user' ? (
                    <User size={14} />
                  ) : (
                    <Bot size={14} className="text-accent" />
                  )}
                </div>

                <div className="chat-bubble-container">
                  <div className="chat-bubble-header">
                    <span className="chat-bubble-author">
                      {msg.role === 'user' ? 'You' : activeModel.name}
                    </span>
                    <span className="chat-bubble-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="chat-bubble-content">
                    {msg.content}
                    {msg.isStreaming && (
                      <span className="chat-stream-caret" aria-hidden="true">
                        ▋
                      </span>
                    )}
                  </div>

                  {msg.metrics && !msg.isStreaming && (
                    <div className="chat-metrics-bar">
                      <span className="metric-item">
                        ⚡ {msg.metrics.tokensPerSecond} tok/s
                      </span>
                      <span className="metric-dot">·</span>
                      <span className="metric-item">
                        TTFT: {msg.metrics.firstTokenMs}ms
                      </span>
                      <span className="metric-dot">·</span>
                      <span className="metric-item">
                        {msg.metrics.totalTokens} tokens ({(msg.metrics.totalTimeMs / 1000).toFixed(2)}s)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Form */}
      <div className="chat-input-wrapper">
        <div className="chat-input-container">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder={
              isGenerating
                ? 'Generation in progress...'
                : 'Send a message to local model... (Enter to send, Shift+Enter for new line)'
            }
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            rows={1}
          />

          <div className="chat-input-controls">
            <div className="chat-input-meta">
              <span className="char-count">
                {inputPrompt.length > 0 ? `${inputPrompt.length}/16000` : ''}
              </span>
            </div>

            <div className="chat-buttons-row">
              {isGenerating ? (
                <button
                  className="btn-stop-generation"
                  onClick={stopGeneration}
                  title="Stop generating"
                >
                  <Square size={13} fill="currentColor" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  className="btn-send-message"
                  onClick={handleSend}
                  disabled={!inputPrompt.trim() || isGenerating}
                  title="Send message (Enter)"
                >
                  <Send size={13} />
                  <span>Send</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
