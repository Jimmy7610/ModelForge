import { contextBridge, ipcRenderer } from 'electron';
import {
  AppSettings,
  DriveStorageInfo,
  HardwareInfo,
  ModelForgeAPI,
  ModelLibrary,
  ModelRecord,
  ModelScanProgress,
  Project,
} from '../shared/types';
import { IPC_CHANNELS } from '../shared/constants';

const api: ModelForgeAPI = {
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
