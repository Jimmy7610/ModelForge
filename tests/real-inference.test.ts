import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { InferenceService } from '../src/main/inference/service';
import { ModelRegistry, createStableModelId } from '../src/main/models/registry';
import { parseGgufHeaderSync } from '../src/main/gguf/parser';
import { ModelRecord } from '../src/shared/types';

describe('Real Local GGUF Inference Verification', () => {
  const realModelPath = process.env.MODEL_FORGE_TEST_GGUF;

  it('genuinely loads real model, streams tokens on local hardware, and unloads cleanly', async () => {
    if (!realModelPath || !fs.existsSync(realModelPath)) {
      console.info('MODEL_FORGE_TEST_GGUF not set or file not found, skipping real inference test');
      return;
    }

    console.info('=== STARTING REAL LOCAL INFERENCE TEST ===');
    console.info('Target model:', realModelPath);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-real-infer-'));
    const registry = new ModelRegistry(tempDir);

    // 1. Inspect header and register model
    const headerResult = parseGgufHeaderSync(realModelPath);
    expect(headerResult.status).toBe('available');
    const stat = fs.statSync(realModelPath);
    const modelId = createStableModelId(realModelPath);

    const record: ModelRecord = {
      id: modelId,
      path: realModelPath,
      fileName: path.basename(realModelPath),
      displayName: headerResult.data?.name || path.basename(realModelPath),
      rootDirectory: path.dirname(realModelPath),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs,
      ggufVersion: headerResult.data?.ggufVersion ?? null,
      architecture: headerResult.data?.architecture ?? null,
      quantization: headerResult.data?.quantization ?? null,
      quantizationSource: headerResult.data?.quantizationSource ?? null,
      contextLength: headerResult.data?.contextLength ?? null,
      metadataStatus: 'available',
      discoveredAt: new Date().toISOString(),
    };

    // Store in registry map
    (registry as any).records.set(modelId, record);

    // 2. Initialize InferenceService
    const service = new InferenceService(registry);

    // 3. Load the model with safe context length (2048 tokens)
    const loadStartTime = Date.now();
    console.info('Loading model into native runtime...');
    const loadedModel = await service.loadModel(modelId, 2048);
    const loadTimeMs = Date.now() - loadStartTime;
    console.info(`Model loaded in ${(loadTimeMs / 1000).toFixed(2)}s:`, loadedModel.name);

    expect(loadedModel).toBeDefined();
    expect(loadedModel.modelId).toBe(modelId);
    expect(service.getModelState()).toBe('loaded');

    const state = await service.getState();
    console.info('Compute backend:', state.runtime.backend);
    console.info('GPU device:', state.runtime.gpuName);
    console.info('VRAM state (MB):', {
      total: Math.round(state.runtime.vramTotalBytes / (1024 * 1024)),
      free: Math.round(state.runtime.vramFreeBytes / (1024 * 1024)),
      used: Math.round(state.runtime.vramUsedBytes / (1024 * 1024)),
    });

    // 4. Test real token streaming
    console.info('Sending test prompt: "Hello. Tell me what model you are."');
    const streamedChunks: string[] = [];
    let finalMetrics: any = null;

    const completionPromise = new Promise<void>((resolve, reject) => {
      service.setCallbacks((chunk) => {
        if (chunk.text) {
          process.stdout.write(chunk.text);
          streamedChunks.push(chunk.text);
        }
        if (chunk.isDone) {
          finalMetrics = chunk.metrics;
          if (chunk.error) {
            reject(new Error(chunk.error));
          } else {
            resolve();
          }
        }
      });
    });

    await service.sendChatMessage({
      prompt: 'Hello. Tell me what model you are.',
      temperature: 0.7,
      maxTokens: 150,
    });

    await completionPromise;
    console.info('\n--- Generation Finished ---');
    console.info('Tokens received:', streamedChunks.length);
    console.info('Metrics:', finalMetrics);

    expect(streamedChunks.length).toBeGreaterThan(0);
    const fullText = streamedChunks.join('');
    expect(fullText.length).toBeGreaterThan(0);
    expect(finalMetrics).toBeDefined();
    expect(finalMetrics.totalTokens).toBeGreaterThan(0);

    // 5. Test Conversational Memory
    console.info('\nTesting Conversational Memory: Turn 1 (Remember BLUEFORGE)...');
    let turn1Promise = new Promise<void>((resolve) => {
      service.setCallbacks((chunk) => {
        if (chunk.isDone) resolve();
      });
    });
    await service.sendChatMessage({
      prompt: 'Remember this secret word: BLUEFORGE. Acknowledge with OK.',
      temperature: 0.7,
      maxTokens: 50,
    });
    await turn1Promise;

    console.info('Testing Conversational Memory: Turn 2 (Recall BLUEFORGE)...');
    const recallChunks: string[] = [];
    let turn2Promise = new Promise<void>((resolve) => {
      service.setCallbacks((chunk) => {
        if (chunk.text) recallChunks.push(chunk.text);
        if (chunk.isDone) resolve();
      });
    });
    await service.sendChatMessage({
      prompt: 'What was the secret word I told you to remember?',
      temperature: 0.7,
      maxTokens: 100,
    });
    await turn2Promise;
    const recalledText = recallChunks.join('');
    console.info('Recall response:', recalledText);
    expect(recalledText).toContain('BLUEFORGE');

    // 6. Test Stop Generation (Cancellation)
    console.info('\nTesting Stop Generation...');
    let stoppedSuccessfully = false;
    let stopPromise = new Promise<void>((resolve) => {
      service.setCallbacks((chunk) => {
        if (chunk.isDone) resolve();
      });
    });
    await service.sendChatMessage({
      prompt: 'Write a very long 1000-word essay about the history of mathematics.',
      temperature: 0.7,
      maxTokens: 500,
    });
    // Wait a brief moment for generation to start, then stop
    await new Promise((r) => setTimeout(r, 2000));
    stoppedSuccessfully = await service.stopGeneration();
    await stopPromise;
    expect(stoppedSuccessfully).toBe(true);
    expect(service.getGenerationState()).toBe('idle');
    console.info('Stop generation verified!');

    // 7. Test clean model unloading
    console.info('Unloading model...');
    const unloaded = await service.unloadModel();
    expect(unloaded).toBe(true);
    expect(service.getModelState()).toBe('unloaded');
    expect(service.getActiveModel()).toBeNull();
    console.info('Model unloaded cleanly!');
  }, 300000); // 5 minutes timeout
});
