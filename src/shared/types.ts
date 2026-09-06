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
}

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
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

export interface ModelForgeAPI {
  getHardwareInfo: () => Promise<HardwareInfo>;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>;
  getProjects: () => Promise<Project[]>;
  addProject: () => Promise<Project | null>;
  removeProject: (id: string) => Promise<boolean>;
  
  // Model Library Management
  getModelLibraries: () => Promise<ModelLibrary[]>;
  addModelLibrary: (dirPath?: string) => Promise<string | null>;
  removeModelLibrary: (dirPath: string) => Promise<boolean>;
  scanModelLibrary: (dirPath: string) => Promise<ModelRecord[]>;
  scanAllModelLibraries: () => Promise<ModelRecord[]>;
  getModels: () => Promise<ModelRecord[]>;
  getModelDetails: (modelId: string) => Promise<ModelRecord | null>;
  getPrimaryDriveStorage: () => Promise<DriveStorageInfo | null>;

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
