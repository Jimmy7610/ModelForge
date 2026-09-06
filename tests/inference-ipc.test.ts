import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS, MAX_PROMPT_CHARS, DEFAULT_CONTEXT_TOKENS } from '../src/shared/constants';

describe('Inference IPC Constants & Validation Rules', () => {
  it('defines all required Pass 3 inference IPC channels', () => {
    expect(IPC_CHANNELS.GET_INFERENCE_STATE).toBe('modelforge:get-inference-state');
    expect(IPC_CHANNELS.GET_INFERENCE_RUNTIME_INFO).toBe('modelforge:get-inference-runtime-info');
    expect(IPC_CHANNELS.LOAD_MODEL).toBe('modelforge:load-model');
    expect(IPC_CHANNELS.UNLOAD_MODEL).toBe('modelforge:unload-model');
    expect(IPC_CHANNELS.SEND_CHAT_MESSAGE).toBe('modelforge:send-chat-message');
    expect(IPC_CHANNELS.STOP_GENERATION).toBe('modelforge:stop-generation');
    expect(IPC_CHANNELS.CLEAR_CHAT).toBe('modelforge:clear-chat');
    expect(IPC_CHANNELS.INFERENCE_CHUNK).toBe('modelforge:inference-chunk');
    expect(IPC_CHANNELS.INFERENCE_STATE_CHANGED).toBe('modelforge:inference-state-changed');
  });

  it('specifies safe limits for prompt length and context tokens', () => {
    expect(MAX_PROMPT_CHARS).toBe(16000);
    expect(DEFAULT_CONTEXT_TOKENS).toBe(4096);
  });
});
