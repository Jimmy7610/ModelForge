import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { InferenceService } from '../src/main/inference/service';
import { ModelRegistry } from '../src/main/models/registry';

const mockAgentPromptFn = vi.fn();
vi.mock('node-llama-cpp', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
    LlamaChatSession: vi.fn().mockImplementation((_config: any) => {
      return {
        prompt: mockAgentPromptFn.mockImplementation(async (_prompt: string, options?: any) => {
          options?.onTextChunk?.('# Agent Plan Output');
          return '# Agent Plan Output';
        }),
        dispose: vi.fn(),
      };
    }),
  };
});

describe('Chat & Plan Agent Session Isolation (Single Model Weight Residence)', () => {
  let tempDir: string;
  let registry: ModelRegistry;
  let service: InferenceService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-isolation-test-'));
    registry = new ModelRegistry(tempDir);
    service = new InferenceService(registry);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('preserves normal chat history completely isolated from plan agent execution on the same resident model', async () => {
    // Mock resident model and dual-sequence context
    const mockModel = {
      createContext: vi.fn(),
      disposed: false,
    };

    const mockAgentSequence = { disposed: false, dispose: vi.fn() };

    const mockContext = {
      sequencesLeft: 2,
      getSequence: vi.fn().mockReturnValue(mockAgentSequence),
      disposed: false,
    };

    // Chat history tracker
    const chatSessionHistory: Array<{ role: string; content: string }> = [];

    const mockChatSession = {
      prompt: vi.fn().mockImplementation(async (text: string, options?: any) => {
        chatSessionHistory.push({ role: 'user', content: text });
        const reply = text.includes('What is the code word')
          ? 'The code word is ORANGECHAT.'
          : text.includes('code word')
          ? 'Understood, code word ORANGECHAT registered.'
          : 'Normal chat reply';
        chatSessionHistory.push({ role: 'assistant', content: reply });
        options?.onResponseChunk?.({ text: reply, tokens: [1, 2] });
        return reply;
      }),
      getChatHistory: vi.fn().mockImplementation(() => [...chatSessionHistory]),
      resetChatHistory: vi.fn().mockImplementation(() => {
        chatSessionHistory.length = 0;
      }),
    };

    (service as any).modelState = 'loaded';
    (service as any).loadedModel = mockModel;
    (service as any).loadedContext = mockContext;
    (service as any).chatSession = mockChatSession;
    (service as any).activeModel = { modelId: 'test-model-id' };

    // 1. User sends message in normal chat with secret code word
    await service.sendChatMessage({ prompt: 'Remember this secret code word: ORANGECHAT' });
    await new Promise((r) => setTimeout(r, 20));

    expect(chatSessionHistory.length).toBe(2);
    expect(chatSessionHistory[0].content).toContain('ORANGECHAT');
    expect(chatSessionHistory[1].content).toContain('ORANGECHAT');

    // 2. Plan Agent executes autonomous prompt on isolated sequence
    const agentChunks: string[] = [];
    const agentResult = await service.executeAgentPrompt({
      systemPrompt: 'You are a read-only architecture planner with tools.',
      prompt: 'Analyze this project and plan achievements.',
      functions: {
        read_file: {
          description: 'read file',
          handler: vi.fn().mockResolvedValue('file contents'),
        },
      },
      onChunk: (chunk) => agentChunks.push(chunk),
    });

    expect(agentResult).toBeDefined();

    // 3. CRITICAL VERIFICATION: Chat history is 100% UNTOUCHED by Plan Agent
    expect(chatSessionHistory.length).toBe(2);
    expect(chatSessionHistory[0].content).toBe('Remember this secret code word: ORANGECHAT');
    expect(chatSessionHistory[1].content).toBe('Understood, code word ORANGECHAT registered.');

    // 4. Normal chat continues and recalls the code word without any agent contamination
    await service.sendChatMessage({ prompt: 'What is the code word?' });
    await new Promise((r) => setTimeout(r, 20));

    expect(chatSessionHistory.length).toBe(4);
    expect(chatSessionHistory[2].content).toBe('What is the code word?');
    expect(chatSessionHistory[3].content).toBe('The code word is ORANGECHAT.');

    // Verify not a single tool definition or agent planning prompt leaked into chat history
    for (const msg of chatSessionHistory) {
      expect(msg.content).not.toContain('read-only architecture planner');
      expect(msg.content).not.toContain('Analyze this project');
      expect(msg.content).not.toContain('read_file');
    }
  });

  it('disposes the isolated agent sequence after execution without affecting normal chat session', async () => {
    const mockAgentSequence = { disposed: false, dispose: vi.fn() };
    const mockContext = {
      sequencesLeft: 1,
      getSequence: vi.fn().mockReturnValue(mockAgentSequence),
      disposed: false,
    };

    (service as any).modelState = 'loaded';
    (service as any).loadedModel = { disposed: false };
    (service as any).loadedContext = mockContext;
    (service as any).chatSession = { prompt: vi.fn() };

    await service.executeAgentPrompt({
      prompt: 'Test prompt',
    });

    // Agent sequence must be disposed in finally block
    expect(mockAgentSequence.dispose).toHaveBeenCalled();
  });
});
