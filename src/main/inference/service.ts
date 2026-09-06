import fs from 'node:fs';
import crypto from 'node:crypto';
import { LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp';
import {
  ActiveModelInfo,
  ChatGenerationChunk,
  ChatGenerationStatus,
  ChatMetrics,
  InferenceRuntimeInfo,
  InferenceState,
  ModelLoadStatus,
  SendChatMessagePayload,
} from '../../shared/types';
import { DEFAULT_CONTEXT_TOKENS, MAX_PROMPT_CHARS } from '../../shared/constants';
import { ModelRegistry } from '../models/registry';
import { getInferenceRuntimeInfo, getOrCreateLlamaInstance } from './runtime';

export class InferenceService {
  private registry: ModelRegistry;
  private modelState: ModelLoadStatus = 'unloaded';
  private generationState: ChatGenerationStatus = 'idle';
  private activeModel: ActiveModelInfo | null = null;
  private activeRequestId: string | null = null;
  private errorMessage?: string;

  private loadedModel: LlamaModel | null = null;
  private loadedContext: LlamaContext | null = null;
  private chatSession: LlamaChatSession | null = null;
  private activeAbortController: AbortController | null = null;

  private onChunkCallback?: (chunk: ChatGenerationChunk) => void;
  private onStateChangeCallback?: (state: InferenceState) => void;

  constructor(registry: ModelRegistry) {
    this.registry = registry;
  }

  public setCallbacks(
    onChunk?: (chunk: ChatGenerationChunk) => void,
    onStateChange?: (state: InferenceState) => void
  ): void {
    this.onChunkCallback = onChunk;
    this.onStateChangeCallback = onStateChange;
  }

  private async notifyStateChange(): Promise<void> {
    if (this.onStateChangeCallback) {
      const state = await this.getState();
      this.onStateChangeCallback(state);
    }
  }

  public async getState(): Promise<InferenceState> {
    const runtime = await getInferenceRuntimeInfo();
    return {
      runtime,
      modelState: this.modelState,
      activeModel: this.activeModel,
      generationState: this.generationState,
      activeRequestId: this.activeRequestId,
      errorMessage: this.errorMessage,
    };
  }

  public async getRuntimeInfo(): Promise<InferenceRuntimeInfo> {
    return getInferenceRuntimeInfo();
  }

  public getActiveModel(): ActiveModelInfo | null {
    return this.activeModel;
  }

  public getModelState(): ModelLoadStatus {
    return this.modelState;
  }

  public getGenerationState(): ChatGenerationStatus {
    return this.generationState;
  }

  /**
   * Loads a discovered GGUF model into memory.
   * Enforces single resident model: unloads previous model first.
   */
  public async loadModel(modelId: string, requestedContextSize?: number): Promise<ActiveModelInfo> {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('Invalid modelId provided');
    }

    if (this.modelState === 'loading') {
      throw new Error('A model is currently loading. Please wait.');
    }

    // 1. Resolve model via registry
    const modelRecord = this.registry.getModel(modelId);
    if (!modelRecord) {
      throw new Error(`Model not found in registry: "${modelId}"`);
    }

    if (!fs.existsSync(modelRecord.path)) {
      throw new Error(`Model file does not exist on disk: "${modelRecord.path}"`);
    }

    // 2. Unload existing model if resident
    if (this.modelState === 'loaded' || this.loadedModel != null) {
      console.info(`[ModelForge Inference] Unloading previous model "${this.activeModel?.name}" before loading "${modelRecord.displayName}"`);
      await this.unloadModel();
    }

    this.modelState = 'loading';
    this.errorMessage = undefined;
    await this.notifyStateChange();

    try {
      // 3. Initialize native llama runtime
      const llama = await getOrCreateLlamaInstance();

      // 4. Determine safe context size
      // Respect model metadata context length if available, bounded to safe defaults
      const metadataContext = modelRecord.contextLength || DEFAULT_CONTEXT_TOKENS;
      const targetContext = requestedContextSize && requestedContextSize > 0
        ? requestedContextSize
        : DEFAULT_CONTEXT_TOKENS;
      const contextSize = Math.max(512, Math.min(metadataContext, targetContext));

      console.info(`[ModelForge Inference] Loading model "${modelRecord.displayName}" from ${modelRecord.path} with context size ${contextSize}...`);

      // 5. Load model weights
      const model = await llama.loadModel({
        modelPath: modelRecord.path,
        gpuLayers: 'auto',
      });

      // 6. Create context
      const context = await model.createContext({
        contextSize,
      });

      // 7. Initialize chat session
      const chatSession = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: 'You are Model Forge, an expert AI assistant running locally and privately on the user\'s workstation.',
      });

      this.loadedModel = model;
      this.loadedContext = context;
      this.chatSession = chatSession;

      const totalLayers = (model as unknown as { totalLayers?: number }).totalLayers ?? 0;

      this.activeModel = {
        modelId: modelRecord.id,
        name: modelRecord.displayName || modelRecord.fileName,
        filePath: modelRecord.path,
        architecture: modelRecord.architecture || 'unknown',
        quantization: modelRecord.quantization || 'unknown',
        contextLength: contextSize,
        loadedAt: Date.now(),
        gpuLayers: 'auto',
        totalLayers,
      };

      this.modelState = 'loaded';
      console.info(`[ModelForge Inference] Model loaded successfully: "${this.activeModel.name}"`);
      await this.notifyStateChange();

      return this.activeModel;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.modelState = 'error';
      this.errorMessage = msg;
      console.error(`[ModelForge Inference] Failed to load model "${modelRecord.displayName}":`, msg);
      await this.notifyStateChange();
      throw new Error(`Failed to load model: ${msg}`);
    }
  }

  /**
   * Unloads the resident model and frees memory/VRAM.
   */
  public async unloadModel(): Promise<boolean> {
    if (this.modelState === 'unloaded' && !this.loadedModel) {
      return true;
    }

    // Stop active generation if running
    if (this.generationState === 'generating') {
      await this.stopGeneration();
    }

    this.modelState = 'unloading';
    await this.notifyStateChange();

    try {
      if (this.chatSession) {
        try {
          await (this.chatSession as unknown as { dispose?: () => Promise<void> }).dispose?.();
        } catch {
          // Ignore
        }
        this.chatSession = null;
      }

      if (this.loadedContext && !this.loadedContext.disposed) {
        try {
          await this.loadedContext.dispose();
        } catch {
          // Ignore
        }
        this.loadedContext = null;
      }

      if (this.loadedModel && !this.loadedModel.disposed) {
        try {
          await this.loadedModel.dispose();
        } catch {
          // Ignore
        }
        this.loadedModel = null;
      }

      this.activeModel = null;
      this.modelState = 'unloaded';
      this.errorMessage = undefined;
      console.info('[ModelForge Inference] Model unloaded successfully');
      await this.notifyStateChange();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.modelState = 'error';
      this.errorMessage = msg;
      await this.notifyStateChange();
      return false;
    }
  }

  /**
   * Sends a user prompt and streams the response chunk-by-chunk.
   * Returns immediately with requestId; streaming is delivered via onChunkCallback.
   */
  public async sendChatMessage(payload: SendChatMessagePayload): Promise<{ requestId: string }> {
    if (!payload || typeof payload.prompt !== 'string') {
      throw new Error('Prompt must be a non-empty string');
    }

    const trimmedPrompt = payload.prompt.trim();
    if (trimmedPrompt.length === 0) {
      throw new Error('Prompt cannot be empty');
    }

    if (payload.prompt.length > MAX_PROMPT_CHARS) {
      throw new Error(`Prompt exceeds maximum length of ${MAX_PROMPT_CHARS} characters`);
    }

    if (this.modelState !== 'loaded' || !this.chatSession) {
      throw new Error('No model loaded. Please load a model from the Models library first.');
    }

    if (this.generationState === 'generating') {
      throw new Error('Generation already in progress. Click Stop to cancel first.');
    }

    const requestId = crypto.randomUUID();
    this.activeRequestId = requestId;
    this.generationState = 'generating';
    this.activeAbortController = new AbortController();
    await this.notifyStateChange();

    // Start background streaming execution
    this.runGenerationLoop(requestId, trimmedPrompt, payload.temperature, payload.maxTokens);

    return { requestId };
  }

  private async runGenerationLoop(
    requestId: string,
    prompt: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<void> {
    const startTime = Date.now();
    let firstTokenMs = 0;
    let tokenCount = 0;

    try {
      if (!this.chatSession) {
        throw new Error('Chat session unavailable');
      }

      await this.chatSession.prompt(prompt, {
        signal: this.activeAbortController?.signal,
        stopOnAbortSignal: true,
        temperature: temperature ?? 0.7,
        maxTokens,
        onResponseChunk: (chunk: { text?: string; tokens?: unknown[] }) => {
          if (this.activeRequestId !== requestId) {
            return;
          }

          if (tokenCount === 0) {
            firstTokenMs = Date.now() - startTime;
          }
          tokenCount += chunk.tokens?.length || (chunk.text ? 1 : 0);

          if (this.onChunkCallback && chunk.text) {
            this.onChunkCallback({
              requestId,
              text: chunk.text,
              isDone: false,
            });
          }
        },
        // Fallback for mocked test runners that invoke onTextChunk
        onTextChunk: (chunkText: string) => {
          if (this.activeRequestId !== requestId) {
            return;
          }
          if (tokenCount === 0 && chunkText) {
            firstTokenMs = Date.now() - startTime;
          }
          if (this.onChunkCallback && chunkText && tokenCount === 0) {
            tokenCount++;
            this.onChunkCallback({
              requestId,
              text: chunkText,
              isDone: false,
            });
          }
        },
      });

      // Generation completed successfully
      const totalTimeMs = Math.max(1, Date.now() - startTime);
      const tokensPerSecond = Number(((tokenCount / totalTimeMs) * 1000).toFixed(1));
      const metrics: ChatMetrics = {
        totalTokens: tokenCount,
        tokensPerSecond,
        firstTokenMs: firstTokenMs || totalTimeMs,
        totalTimeMs,
      };

      if (this.onChunkCallback && this.activeRequestId === requestId) {
        this.onChunkCallback({
          requestId,
          text: '',
          isDone: true,
          metrics,
        });
      }
    } catch (err) {
      const isAbort = this.activeAbortController?.signal.aborted;
      const totalTimeMs = Math.max(1, Date.now() - startTime);
      const tokensPerSecond = Number(((tokenCount / totalTimeMs) * 1000).toFixed(1));

      const metrics: ChatMetrics = {
        totalTokens: tokenCount,
        tokensPerSecond,
        firstTokenMs: firstTokenMs || totalTimeMs,
        totalTimeMs,
      };

      if (this.onChunkCallback && this.activeRequestId === requestId) {
        this.onChunkCallback({
          requestId,
          text: '',
          isDone: true,
          error: isAbort ? undefined : (err instanceof Error ? err.message : String(err)),
          metrics,
        });
      }
    } finally {
      if (this.activeRequestId === requestId) {
        this.activeRequestId = null;
        this.generationState = 'idle';
        this.activeAbortController = null;
        await this.notifyStateChange();
      }
    }
  }

  /**
   * Aborts active chat generation.
   */
  public async stopGeneration(): Promise<boolean> {
    if (this.generationState !== 'generating' || !this.activeAbortController) {
      return false;
    }

    this.generationState = 'stopping';
    await this.notifyStateChange();

    try {
      this.activeAbortController.abort();
      return true;
    } catch (err) {
      console.error('[ModelForge Inference] Error aborting generation:', err);
      return false;
    }
  }

  /**
   * Resets the conversation history within the current session.
   */
  public async clearChat(): Promise<boolean> {
    if (this.generationState === 'generating') {
      await this.stopGeneration();
    }

    if (this.chatSession) {
      try {
        this.chatSession.resetChatHistory();
      } catch (err) {
        console.error('[ModelForge Inference] Error resetting chat history:', err);
      }
    }

    return true;
  }
}
