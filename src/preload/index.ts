import { contextBridge, ipcRenderer } from 'electron';
import {
  AppSettings,
  BridgeInfo,
  DriveStorageInfo,
  HardwareInfo,
  ModelForgeAPI,
  ModelLibrary,
  ModelRecord,
  ModelScanProgress,
  Project,
  AgentActivityItem,
  AgentPlanState,
  RunPlanPayload,
  ToolCapabilityInfo,
} from '../shared/types';
import { APP_VERSION, IPC_CHANNELS } from '../shared/constants';


const api: ModelForgeAPI = {
  getBridgeInfo: (): BridgeInfo => {
    return {
      available: true,
      version: APP_VERSION,
      preloadFormat: 'cjs',
      platform: process.platform,
    };
  },

  getHardwareInfo: (): Promise<HardwareInfo> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_HARDWARE_INFO);
  },

  getSettings: (): Promise<AppSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS);
  },

  updateSettings: (partial: Partial<AppSettings>): Promise<AppSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, partial);
  },

  getProjects: (): Promise<Project[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_PROJECTS);
  },

  addProject: (): Promise<Project | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ADD_PROJECT);
  },

  removeProject: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REMOVE_PROJECT, id);
  },

  setActiveProject: (id: string | null): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SET_ACTIVE_PROJECT, id);
  },


  // Model Library Management
  getModelLibraries: (): Promise<ModelLibrary[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_MODEL_LIBRARIES);
  },

  addModelLibrary: (dirPath?: string): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ADD_MODEL_LIBRARY, dirPath);
  },

  removeModelLibrary: (dirPath: string): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REMOVE_MODEL_LIBRARY, dirPath);
  },

  scanModelLibrary: (dirPath: string): Promise<ModelRecord[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_MODEL_LIBRARY, dirPath);
  },

  scanAllModelLibraries: (): Promise<ModelRecord[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_ALL_MODEL_LIBRARIES);
  },

  getModels: (): Promise<ModelRecord[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_MODELS);
  },

  getModelDetails: (modelId: string): Promise<ModelRecord | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_MODEL_DETAILS, modelId);
  },

  getPrimaryDriveStorage: (): Promise<DriveStorageInfo | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_PRIMARY_DRIVE_STORAGE);
  },

  // Local Inference & Streaming Chat (Pass 3)
  getInferenceState: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_INFERENCE_STATE);
  },

  getInferenceRuntimeInfo: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_INFERENCE_RUNTIME_INFO);
  },

  loadModel: (modelId: string, contextSize?: number) => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOAD_MODEL, { modelId, contextSize });
  },

  unloadModel: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.UNLOAD_MODEL);
  },

  sendChatMessage: (payload) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SEND_CHAT_MESSAGE, payload);
  },

  stopGeneration: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.STOP_GENERATION);
  },

  clearChat: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.CLEAR_CHAT);
  },

  onInferenceChunk: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: any) => {
      callback(chunk);
    };
    ipcRenderer.on(IPC_CHANNELS.INFERENCE_CHUNK, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.INFERENCE_CHUNK, handler);
    };
  },

  onInferenceStateChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: any) => {
      callback(state);
    };
    ipcRenderer.on(IPC_CHANNELS.INFERENCE_STATE_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.INFERENCE_STATE_CHANGED, handler);
    };
  },

  // Plan Agent & Workspace Intelligence (Pass 4)
  runPlanAgent: (payload: RunPlanPayload): Promise<{ success: boolean; runId: string; sessionId: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.RUN_PLAN_AGENT, payload);
  },

  stopPlanAgent: (): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STOP_PLAN_AGENT);
  },

  getAgentState: (): Promise<AgentPlanState> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_AGENT_STATE);
  },

  checkToolCapability: (modelId?: string): Promise<ToolCapabilityInfo> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CHECK_TOOL_CAPABILITY, modelId);
  },

  onAgentActivity: (callback: (activity: AgentActivityItem) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, activity: AgentActivityItem) => {
      callback(activity);
    };
    ipcRenderer.on(IPC_CHANNELS.AGENT_ACTIVITY, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AGENT_ACTIVITY, handler);
    };
  },

  onAgentChunk: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: any) => {
      callback(chunk);
    };
    ipcRenderer.on(IPC_CHANNELS.AGENT_CHUNK, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AGENT_CHUNK, handler);
    };
  },

  onAgentStateChange: (callback: (state: AgentPlanState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AgentPlanState) => {
      callback(state);
    };
    ipcRenderer.on(IPC_CHANNELS.AGENT_STATE_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AGENT_STATE_CHANGED, handler);
    };
  },

  // Read-Only Workspace Inspection Tools
  getProjectOverview: (projectId?: string): Promise<unknown> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_PROJECT_OVERVIEW, projectId);
  },

  listDirectory: (options?: { projectId?: string; path?: string; recursive?: boolean; maxDepth?: number }): Promise<any> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIST_DIRECTORY, options);
  },

  readFile: (options: { projectId?: string; path: string; startLine?: number; endLine?: number }): Promise<any> => {
    return ipcRenderer.invoke(IPC_CHANNELS.READ_FILE, options);
  },

  searchText: (options: { projectId?: string; query: string; path?: string; caseSensitive?: boolean; maxMatches?: number }): Promise<any> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SEARCH_TEXT, options);
  },

  // System & Clipboard (Pass 4.1)
  copyText: (text: string): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.COPY_TEXT, text);
  },

  // Window Controls
  windowControl: (action: 'minimize' | 'maximize' | 'close'): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CONTROL, action);
  },

  isMaximized: (): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.IS_MAXIMIZED);
  },

  onWindowStateChange: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => {
      callback(isMaximized);
    };
    ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_STATE_CHANGED, handler);
    };
  },

  onScanProgress: (callback: (progress: ModelScanProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ModelScanProgress) => {
      callback(progress);
    };
    ipcRenderer.on(IPC_CHANNELS.MODEL_SCAN_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.MODEL_SCAN_PROGRESS, handler);
    };
  },
};

contextBridge.exposeInMainWorld('modelForge', api);
