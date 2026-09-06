import { contextBridge, ipcRenderer } from 'electron';
import { AppSettings, HardwareInfo, ModelForgeAPI, Project } from '../shared/types';
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

  selectModelFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SELECT_MODEL_FOLDER);
  },

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
};

contextBridge.exposeInMainWorld('modelForge', api);
