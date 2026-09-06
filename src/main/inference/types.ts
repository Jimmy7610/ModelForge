import {
  InferenceRuntimeStatus,
  ModelLoadStatus,
  ChatGenerationStatus,
  InferenceBackendType,
  InferenceRuntimeInfo,
  ActiveModelInfo,
  ChatMetrics,
  ChatGenerationChunk,
  SendChatMessagePayload,
  InferenceState,
  ChatMessage,
} from '../../shared/types';

export type {
  InferenceRuntimeStatus,
  ModelLoadStatus,
  ChatGenerationStatus,
  InferenceBackendType,
  InferenceRuntimeInfo,
  ActiveModelInfo,
  ChatMetrics,
  ChatGenerationChunk,
  SendChatMessagePayload,
  InferenceState,
  ChatMessage,
};

export interface LlamaInitOptions {
  gpu?: 'auto' | 'cuda' | 'vulkan' | 'metal' | false;
  build?: 'never';
  skipDownload?: boolean;
}

export interface ModelLoadOptions {
  modelId: string;
  contextSize?: number;
  gpuLayers?: 'auto' | number;
}
