import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { InferenceService } from '../src/main/inference/service';
import { ModelRegistry } from '../src/main/models/registry';
import { MAX_PROMPT_CHARS } from '../src/shared/constants';
import { ModelRecord } from '../src/shared/types';

describe('InferenceService & State Machines', () => {
  let tempDir: string;
  let registry: ModelRegistry;
  let service: InferenceService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-inference-test-'));
    registry = new ModelRegistry(tempDir);
    service = new InferenceService(registry);
  });

  it('initializes with unloaded model and idle generation state', async () => {
    const state = await service.getState();
    expect(state.modelState).toBe('unloaded');
    expect(state.generationState).toBe('idle');
    expect(state.activeModel).toBeNull();
    expect(state.activeRequestId).toBeNull();
  });

  it('rejects invalid modelId on loadModel', async () => {
    await expect(service.loadModel('')).rejects.toThrow('Invalid modelId');
    // @ts-expect-error testing invalid input
    await expect(service.loadModel(null)).rejects.toThrow('Invalid modelId');
  });

  it('rejects loading non-existent modelId from registry', async () => {
    await expect(service.loadModel('non-existent-id')).rejects.toThrow('Model not found in registry');
  });

  it('rejects loading if model file is missing from disk', async () => {
    const fakeRecord: ModelRecord = {
      id: 'mock-123',
      path: path.join(tempDir, 'missing-file.gguf'),
      fileName: 'missing-file.gguf',
      displayName: 'Missing Model',
      rootDirectory: tempDir,
      sizeBytes: 1024,
      modifiedAt: new Date().toISOString(),
      mtimeMs: Date.now(),
      ggufVersion: 3,
      architecture: 'llama',
      quantization: 'Q4_K_M',
      quantizationSource: 'metadata',
      contextLength: 4096,
      metadataStatus: 'available',
      discoveredAt: new Date().toISOString(),
    };

    vi.spyOn(registry, 'getModel').mockReturnValue(fakeRecord);

    await expect(service.loadModel('mock-123')).rejects.toThrow('Model file does not exist on disk');
  });

  it('rejects chat message when no model is loaded', async () => {
    await expect(
      service.sendChatMessage({ prompt: 'Hello world' })
    ).rejects.toThrow('No model loaded');
  });

  it('rejects empty or whitespace-only prompts', async () => {
    // Fake a loaded state
    (service as any).modelState = 'loaded';
    (service as any).chatSession = { prompt: vi.fn() };

    await expect(service.sendChatMessage({ prompt: '' })).rejects.toThrow('Prompt cannot be empty');
    await expect(service.sendChatMessage({ prompt: '   \n\t  ' })).rejects.toThrow('Prompt cannot be empty');
  });

  it('rejects prompts exceeding maximum character length', async () => {
    (service as any).modelState = 'loaded';
    (service as any).chatSession = { prompt: vi.fn() };

    const oversizedPrompt = 'a'.repeat(MAX_PROMPT_CHARS + 1);
    await expect(service.sendChatMessage({ prompt: oversizedPrompt })).rejects.toThrow(
      `Prompt exceeds maximum length of ${MAX_PROMPT_CHARS} characters`
    );
  });

  it('rejects sending chat message if generation is already active', async () => {
    (service as any).modelState = 'loaded';
    (service as any).generationState = 'generating';
    (service as any).chatSession = { prompt: vi.fn() };

    await expect(
      service.sendChatMessage({ prompt: 'Concurrent message' })
    ).rejects.toThrow('Generation already in progress');
  });

  it('successfully aborts active generation via stopGeneration', async () => {
    (service as any).generationState = 'generating';
    const abortSpy = vi.fn();
    (service as any).activeAbortController = { abort: abortSpy };

    const stopped = await service.stopGeneration();
    expect(stopped).toBe(true);
    expect(abortSpy).toHaveBeenCalled();
  });

  it('returns false when stopGeneration is called while idle', async () => {
    const stopped = await service.stopGeneration();
    expect(stopped).toBe(false);
  });

  it('resets chat history on clearChat', async () => {
    const resetSpy = vi.fn();
    (service as any).chatSession = { resetChatHistory: resetSpy };

    const cleared = await service.clearChat();
    expect(cleared).toBe(true);
    expect(resetSpy).toHaveBeenCalled();
  });

  it('delivers streaming chunks and metrics on simulated generation loop', async () => {
    (service as any).modelState = 'loaded';
    (service as any).chatSession = {
      prompt: vi.fn().mockImplementation(async (_prompt: string, options: any) => {
        // Simulate streaming 3 response chunks
        options.onResponseChunk({ text: 'Hello', tokens: [1] });
        options.onResponseChunk({ text: ' world', tokens: [2] });
        options.onResponseChunk({ text: '!', tokens: [3] });
        return 'Hello world!';
      }),
    };

    const chunksReceived: any[] = [];
    service.setCallbacks((chunk) => {
      chunksReceived.push(chunk);
    });

    const { requestId } = await service.sendChatMessage({ prompt: 'Say hello' });
    expect(requestId).toBeDefined();

    // Allow microtasks to complete runGenerationLoop
    await new Promise((r) => setTimeout(r, 20));

    expect(chunksReceived.length).toBe(4); // 3 text chunks + 1 final done chunk
    expect(chunksReceived[0].text).toBe('Hello');
    expect(chunksReceived[0].isDone).toBe(false);
    expect(chunksReceived[1].text).toBe(' world');
    expect(chunksReceived[2].text).toBe('!');

    // Final chunk
    const finalChunk = chunksReceived[3];
    expect(finalChunk.isDone).toBe(true);
    expect(finalChunk.metrics).toBeDefined();
    expect(finalChunk.metrics.totalTokens).toBe(3);
    expect(finalChunk.metrics.tokensPerSecond).toBeGreaterThan(0);

    // State returns to idle
    expect(service.getGenerationState()).toBe('idle');
  });

  it('handles abort gracefully inside the generation loop', async () => {
    (service as any).modelState = 'loaded';
    (service as any).chatSession = {
      prompt: vi.fn().mockImplementation(async (_prompt: string, options: any) => {
        options.onTextChunk('First token');
        // Simulate abort triggered
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }),
    };

    const chunksReceived: any[] = [];
    service.setCallbacks((chunk) => {
      chunksReceived.push(chunk);
    });

    await service.sendChatMessage({ prompt: 'Stop me' });
    await new Promise((r) => setTimeout(r, 20));

    expect(chunksReceived.length).toBe(2);
    expect(chunksReceived[1].isDone).toBe(true);
    expect(service.getGenerationState()).toBe('idle');
  });

  it('unloads model and disposes references cleanly', async () => {
    const mockModelDispose = vi.fn();
    const mockContextDispose = vi.fn();
    const mockSessionDispose = vi.fn();

    (service as any).modelState = 'loaded';
    (service as any).loadedModel = { disposed: false, dispose: mockModelDispose };
    (service as any).loadedContext = { disposed: false, dispose: mockContextDispose };
    (service as any).chatSession = { dispose: mockSessionDispose };
    (service as any).activeModel = { modelId: 'test-1' };

    const unloaded = await service.unloadModel();
    expect(unloaded).toBe(true);
    expect(mockModelDispose).toHaveBeenCalled();
    expect(mockContextDispose).toHaveBeenCalled();
    expect(service.getModelState()).toBe('unloaded');
    expect(service.getActiveModel()).toBeNull();
  });
});
