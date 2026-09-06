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
  modelDirectory: string;
  confirmDestructiveActions: boolean;
  compactMode: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

export interface LocalModelSummary {
  id: string;
  name: string;
  parameterSize: string;
  status: 'ready' | 'idle' | 'available';
  path: string;
  sizeBytes?: number;
}

export interface ModelForgeAPI {
  getHardwareInfo: () => Promise<HardwareInfo>;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>;
  getProjects: () => Promise<Project[]>;
  addProject: () => Promise<Project | null>;
  removeProject: (id: string) => Promise<boolean>;
  selectModelFolder: () => Promise<string | null>;
  windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onWindowStateChange: (callback: (isMaximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    modelForge: ModelForgeAPI;
  }
}
