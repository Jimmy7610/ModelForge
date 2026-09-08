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

export type ToolCompatibilityStatus = 'unknown' | 'testing' | 'supported' | 'unsupported';

export interface ToolCapabilityInfo {
  status: ToolCompatibilityStatus;
  testedAt?: string;
  wrapperName?: string;
  isJinja?: boolean;
  usingNoJinjaFallback?: boolean;
  reason?: string;
}

export interface InferenceState {
  runtime: InferenceRuntimeInfo;
  modelState: ModelLoadStatus;
  activeModel: ActiveModelInfo | null;
  generationState: ChatGenerationStatus;
  activeRequestId: string | null;
  errorMessage?: string;
  toolCapability?: ToolCapabilityInfo;
}

export type MessageKind = 'chat' | 'plan' | 'edit-result';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  kind?: MessageKind;
  metrics?: ChatMetrics;
  isStreaming?: boolean;
}

export interface BridgeInfo {
  available: boolean;
  version: string;
  preloadFormat: 'cjs';
  platform: string;
}

export type PermissionLevel = 'READ' | 'EDIT' | 'AGENT' | 'YOLO';

export type AgentActivityStatus = 'running' | 'done' | 'blocked' | 'error';

export interface AgentActivityItem {
  id: string;
  runId?: string;
  runKind?: 'plan' | 'edit';
  label: string;
  time: string;
  status: AgentActivityStatus;
  detail?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

export type AgentPlanStatus = 'idle' | 'running' | 'completed' | 'error' | 'incomplete';

export interface PlanExecutionSummary {
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  blockedToolCalls: number;
  distinctToolTypes: number;
  distinctToolNames: string[];
  filesRead: string[];
  searchesPerformed: string[];
  durationMs: number;
  isFullyInspected: boolean;
}

export interface AgentPlanState {
  runId: string | null;
  status: AgentPlanStatus;
  activeProjectId: string | null;
  activities: AgentActivityItem[];
  currentActivity?: string;
  planContent?: string;
  error?: string;
  successfulToolCallsCount?: number;
  toolSummary?: PlanExecutionSummary;
}

export interface RunPlanPayload {
  projectId: string;
  prompt: string;
}

// Checkpoint & Diff Types (Pass 5)
export type CheckpointStatus = 'armed' | 'pending' | 'accepted' | 'rolled_back' | 'interrupted' | 'conflict';

export interface CheckpointFileEntry {
  relativePath: string;
  existedBefore: boolean;
  originalSha256?: string;
  originalSizeBytes?: number;
  backupFileName?: string;
  lastAgentSha256?: string;
  createdParentDirs?: string[];
  newlineStyle?: 'lf' | 'crlf';
  hasBom?: boolean;
}

export interface CheckpointManifest {
  schemaVersion: number;
  id: string;
  projectId: string;
  projectRoot: string;
  timestamp: string;
  type: 'automatic' | 'manual';
  status: CheckpointStatus;
  description?: string;
  files: Record<string, CheckpointFileEntry>;
  totalBackupBytes: number;
}

export interface CheckpointSummary {
  id: string;
  projectId: string;
  timestamp: string;
  type: 'automatic' | 'manual';
  status: CheckpointStatus;
  description?: string;
  filesCount: number;
  totalBackupBytes: number;
}

export type FileDiffStatus = 'modified' | 'created' | 'deleted' | 'unchanged';

export interface FileDiffItem {
  relativePath: string;
  status: FileDiffStatus;
  insertions: number;
  deletions: number;
  unifiedDiff: string;
  hasConflict?: boolean;
  conflictReason?: string;
}

export interface CheckpointDiffResult {
  checkpointId: string;
  projectId: string;
  files: FileDiffItem[];
  totalFilesChanged: number;
  totalInsertions: number;
  totalDeletions: number;
  hasConflict: boolean;
}

export interface RollbackVerificationFailure {
  relativePath: string;
  expectedSha256?: string;
  actualSha256?: string;
  reason: string;
}

export interface RollbackResult {
  success: boolean;
  checkpointId: string;
  restoredFiles: string[];
  deletedCreatedFiles: string[];
  cleanedDirs: string[];
  conflicts: Array<{ relativePath: string; reason: string }>;
  verified?: boolean;
  verifiedFiles?: string[];
  verificationFailures?: RollbackVerificationFailure[];
  error?: string;
}

export interface EditExecutionSummary {
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  blockedToolCalls: number;
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];
  distinctToolNames: string[];
  durationMs: number;
}

export interface EditAgentState {
  runId: string | null;
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped';
  activeProjectId: string | null;
  checkpointId: string | null;
  activities: AgentActivityItem[];
  currentActivity?: string;
  resultMessage?: string;
  error?: string;
  summary?: EditExecutionSummary;
}

export interface RunEditPayload {
  projectId: string;
  prompt: string;
}

// Process & Agent Execution Types (Pass 6)
export type ProcessKind = 'package_script';
export type ProcessStatus =
  | 'requested'
  | 'approved'
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'denied'
  | 'cancelled'
  | 'timed_out'
  | 'interrupted';

export type PackageManagerType = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface DiscoveredScriptInfo {
  name: string;
  command: string;
  category: 'test' | 'build' | 'lint' | 'typecheck' | 'dev' | 'start' | 'other';
  isPersistent: boolean;
}

export interface PendingCommandRequest {
  requestId: string;
  runId?: string;
  projectId: string;
  kind: ProcessKind;
  packageManager: PackageManagerType;
  scriptName: string;
  resolvedExecutable: string;
  resolvedArgs: string[];
  cwd: string;
  reason: string;
  initiator?: 'manual' | 'agent';
  timestamp: string;
  riskSummary: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled' | 'timed_out';
}

export interface ProcessSessionInfo {
  id: string;
  requestId: string;
  runId?: string;
  projectId: string;
  commandDisplay: string;
  packageManager?: PackageManagerType;
  executable: string;
  args: string[];
  cwd: string;
  pid?: number;
  status: ProcessStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  exitCode?: number | null;
  retainedStdout: string;
  retainedStderr: string;
  retainedOutput: string;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  outputTruncated: boolean;
}

export interface ProcessOutputChunk {
  sessionId: string;
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: string;
}

export interface SessionAuthorizationState {
  permissionLevel: PermissionLevel;
  authorizedProjectId: string | null;
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
  checkToolCapability: (modelId?: string) => Promise<ToolCapabilityInfo>;
  onAgentActivity: (callback: (activity: AgentActivityItem) => void) => () => void;
  onAgentChunk: (callback: (chunk: ChatGenerationChunk) => void) => () => void;
  onAgentStateChange: (callback: (state: AgentPlanState) => void) => () => void;

  // Edit Agent & Checkpoints (Pass 5)
  runEditAgent: (payload: RunEditPayload) => Promise<{ success: boolean; runId: string; checkpointId: string }>;
  stopEditAgent: () => Promise<boolean>;
  getEditAgentState: () => Promise<EditAgentState>;
  getPendingCheckpoint: (projectId: string) => Promise<CheckpointSummary | null>;
  getCheckpointDiff: (checkpointId: string, projectId: string) => Promise<CheckpointDiffResult | null>;
  acceptCheckpoint: (checkpointId: string, projectId: string) => Promise<{ success: boolean }>;
  rollbackCheckpoint: (checkpointId: string, projectId: string) => Promise<RollbackResult>;
  createManualCheckpoint: (projectId: string, description?: string) => Promise<CheckpointSummary>;
  enableEditForProject: (projectId: string) => Promise<{ authorized: boolean; authorizedProjectId: string | null }>;
  disableEdit: () => Promise<void>;
  getEditAuthorizationState: () => Promise<{ authorized: boolean; authorizedProjectId: string | null }>;
  onEditAgentActivity: (callback: (activity: AgentActivityItem) => void) => () => void;
  onEditAgentChunk: (callback: (chunk: ChatGenerationChunk) => void) => () => void;
  onEditAgentStateChange: (callback: (state: EditAgentState) => void) => () => void;

  // Session Authorization & Agent Process (Pass 6)
  enableAgentForProject: (projectId: string) => Promise<{ authorized: boolean; authorizedProjectId: string | null; permissionLevel: PermissionLevel }>;
  disableAgent: () => Promise<void>;
  getSessionAuthorizationState: () => Promise<SessionAuthorizationState>;
  getProjectScripts: (projectId: string) => Promise<{ packageManager: PackageManagerType; scripts: DiscoveredScriptInfo[] }>;
  getPendingCommandRequest: () => Promise<PendingCommandRequest | null>;
  approveCommandRequest: (requestId: string) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
  denyCommandRequest: (requestId: string, reason?: string) => Promise<{ success: boolean }>;
  stopActiveProcess: () => Promise<boolean>;
  getActiveProcess: () => Promise<ProcessSessionInfo | null>;
  getProcessHistory: (projectId?: string) => Promise<ProcessSessionInfo[]>;
  runProjectScript: (projectId: string, script: string) => Promise<{ success: boolean; requestId?: string; error?: string }>;
  onProcessStreamChunk: (callback: (chunk: ProcessOutputChunk) => void) => () => void;
  onProcessStateChange: (callback: (session: ProcessSessionInfo) => void) => () => void;
  onCommandRequestCreated: (callback: (req: PendingCommandRequest) => void) => () => void;

  // Read-Only Workspace Inspection Tools
  getProjectOverview: (projectId?: string) => Promise<any>;
  listDirectory: (options?: { projectId?: string; path?: string; recursive?: boolean; maxDepth?: number }) => Promise<any>;
  readFile: (options: { projectId?: string; path: string; startLine?: number; endLine?: number }) => Promise<any>;
  searchText: (options: { projectId?: string; query: string; path?: string; caseSensitive?: boolean; maxMatches?: number }) => Promise<any>;

  // System & Clipboard (Pass 4.1)
  copyText: (text: string) => Promise<boolean>;

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

