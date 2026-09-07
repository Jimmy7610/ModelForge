export type NavigationPage =
  | 'home'
  | 'models'
  | 'model-lab'
  | 'teams'
  | 'projects'
  | 'builder'
  | 'terminal'
  | 'history'
  | 'settings';

export type WorkspaceTab =
  | 'chat'
  | 'files'
  | 'terminal'
  | 'diff'
  | 'git'
  | 'history';

export interface HardwareInfo {
  os: string;
  osRelease: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGB: number;
  freeMemoryGB: number;
  usedMemoryGB: number;
  gpuName: string;
  gpuStatus: 'detected' | 'pending' | 'unavailable';
}

export interface AppSettings {
  schemaVersion: number;
  startupPage: NavigationPage;
  modelDirectories: string[];
  /** Backwards compatibility alias for the first directory */
  modelDirectory?: string;
  confirmDestructiveActions: boolean;
  compactMode: boolean;
  activeProjectId?: string | null;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  rootPath?: string;
  canonicalRootPath?: string;
  lastOpenedAt?: string;
  isGitRepository?: boolean;
  frameworkHints?: string[];
  languages?: string[];
  packageManager?: string | null;
}



export interface DriveStorageInfo {
  mountPath: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercentage: number;
  formattedUsed: string;
  formattedTotal: string;
}

export interface ModelMetadata {
  name?: string;
  architecture?: string;
  basename?: string;
  fileType?: number;
  quantizationVersion?: number;
  contextLength?: number;
  tokenizerModel?: string;
  rawKv?: Record<string, string | number | boolean>;
}

export interface ModelRecord {
  id: string;
  path: string;
  fileName: string;
  displayName: string;
  rootDirectory: string;
  sizeBytes: number;
  modifiedAt: string;
  mtimeMs: number;
  ggufVersion: number | null;
  architecture: string | null;
  quantization: string | null;
  quantizationSource: 'metadata' | 'filename' | null;
  contextLength: number | null;
  metadataStatus: 'available' | 'error';
  metadataError?: string;
  discoveredAt: string;
}

export interface ModelLibrary {
  path: string;
  modelCount: number;
  lastScannedAt: string | null;
  isScanning?: boolean;
}

export interface ModelScanProgress {
  phase: 'started' | 'discovering' | 'inspecting' | 'completed' | 'failed';
  totalFound?: number;
  inspectedCount?: number;
  currentFile?: string;
  error?: string;
}

// Local Inference Types (Pass 3)
export type InferenceRuntimeStatus = 'uninitialized' | 'initializing' | 'ready' | 'error';
export type ModelLoadStatus = 'unloaded' | 'loading' | 'loaded' | 'unloading' | 'error';
export type ChatGenerationStatus = 'idle' | 'generating' | 'stopping' | 'error';
export type InferenceBackendType = 'cuda' | 'vulkan' | 'metal' | 'cpu' | 'unknown';

export interface InferenceRuntimeInfo {
  status: InferenceRuntimeStatus;
  backend: InferenceBackendType;
  gpuName: string | null;
  vramTotalBytes: number;
  vramFreeBytes: number;
  vramUsedBytes: number;
  ramTotalBytes: number;
  ramFreeBytes: number;
  errorMessage?: string;
}

export interface ActiveModelInfo {
  modelId: string;
  name: string;
  filePath: string;
  architecture: string;
  quantization: string;
  contextLength: number;
  loadedAt: number;
  gpuLayers: number | string;
  totalLayers: number;
}

export interface ChatMetrics {
  totalTokens: number;
  tokensPerSecond: number;
  firstTokenMs: number;
  totalTimeMs: number;
}

export interface ChatGenerationChunk {
  requestId: string;
  runId?: string;
  text: string;
  isDone: boolean;
  error?: string;
  metrics?: ChatMetrics;
}

export interface SendChatMessagePayload {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface InferenceState {
  runtime: InferenceRuntimeInfo;
  modelState: ModelLoadStatus;
  activeModel: ActiveModelInfo | null;
  generationState: ChatGenerationStatus;
  activeRequestId: string | null;
  errorMessage?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metrics?: ChatMetrics;
  isStreaming?: boolean;
}

export interface BridgeInfo {
  available: boolean;
  version: string;
  preloadFormat: 'cjs';
  platform: string;
}

export type AgentActivityStatus = 'running' | 'done' | 'blocked' | 'error';

export interface AgentActivityItem {
  id: string;
  runId?: string;
  label: string;
  time: string;
  status: AgentActivityStatus;
  detail?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

export type AgentPlanStatus = 'idle' | 'running' | 'completed' | 'error';

export interface AgentPlanState {
  runId: string | null;
  status: AgentPlanStatus;
  activeProjectId: string | null;
  activities: AgentActivityItem[];
  currentActivity?: string;
  planContent?: string;
  error?: string;
  successfulToolCallsCount?: number;
}

export interface RunPlanPayload {
  projectId: string;
  prompt: string;
}

export interface ModelForgeAPI {
  // Diagnostics & Bridge Health
  getBridgeInfo: () => BridgeInfo;

  getHardwareInfo: () => Promise<HardwareInfo>;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>;
  getProjects: () => Promise<Project[]>;
  addProject: () => Promise<Project | null>;
  removeProject: (id: string) => Promise<boolean>;
  setActiveProject: (id: string | null) => Promise<boolean>;
  
  // Model Library Management
  getModelLibraries: () => Promise<ModelLibrary[]>;
  addModelLibrary: (dirPath?: string) => Promise<string | null>;
  removeModelLibrary: (dirPath: string) => Promise<boolean>;
  scanModelLibrary: (dirPath: string) => Promise<ModelRecord[]>;
  scanAllModelLibraries: () => Promise<ModelRecord[]>;
  getModels: () => Promise<ModelRecord[]>;
  getModelDetails: (modelId: string) => Promise<ModelRecord | null>;
  getPrimaryDriveStorage: () => Promise<DriveStorageInfo | null>;

  // Local Inference & Streaming Chat (Pass 3)
  getInferenceState: () => Promise<InferenceState>;
  getInferenceRuntimeInfo: () => Promise<InferenceRuntimeInfo>;
  loadModel: (modelId: string, contextSize?: number) => Promise<ActiveModelInfo>;
  unloadModel: () => Promise<boolean>;
  sendChatMessage: (payload: SendChatMessagePayload) => Promise<{ requestId: string }>;
  stopGeneration: () => Promise<boolean>;
  clearChat: () => Promise<boolean>;
  onInferenceChunk: (callback: (chunk: ChatGenerationChunk) => void) => () => void;
  onInferenceStateChange: (callback: (state: InferenceState) => void) => () => void;

  // Plan Agent & Workspace Intelligence (Pass 4)
  runPlanAgent: (payload: RunPlanPayload) => Promise<{ success: boolean; runId: string; sessionId: string }>;
  stopPlanAgent: () => Promise<boolean>;
  getAgentState: () => Promise<AgentPlanState>;
  onAgentActivity: (callback: (activity: AgentActivityItem) => void) => () => void;
  onAgentChunk: (callback: (chunk: ChatGenerationChunk) => void) => () => void;
  onAgentStateChange: (callback: (state: AgentPlanState) => void) => () => void;

  // Read-Only Workspace Inspection Tools
  getProjectOverview: (projectId?: string) => Promise<any>;
  listDirectory: (options?: { projectId?: string; path?: string; recursive?: boolean; maxDepth?: number }) => Promise<any>;
  readFile: (options: { projectId?: string; path: string; startLine?: number; endLine?: number }) => Promise<any>;
  searchText: (options: { projectId?: string; query: string; path?: string; caseSensitive?: boolean; maxMatches?: number }) => Promise<any>;

  // Window Controls
  windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onWindowStateChange: (callback: (isMaximized: boolean) => void) => () => void;
  onScanProgress?: (callback: (progress: ModelScanProgress) => void) => () => void;
}

declare global {
  interface Window {
    modelForge: ModelForgeAPI;
  }
}

