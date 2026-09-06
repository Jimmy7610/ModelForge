import { BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppSettings, Project } from '../shared/types';
import { IPC_CHANNELS } from '../shared/constants';
import { PersistenceStore } from './store';
import { getHardwareInfo } from './hardware';

export function registerIpcHandlers(mainWindow: BrowserWindow, store: PersistenceStore): void {
  // Hardware information
  ipcMain.handle(IPC_CHANNELS.GET_HARDWARE_INFO, async () => {
    return await getHardwareInfo();
  });

  // Settings
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return store.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, (_event, partial: unknown) => {
    if (!partial || typeof partial !== 'object') {
      throw new Error('Invalid settings payload');
    }
    const sanitized: Partial<AppSettings> = {};
    const input = partial as Record<string, unknown>;

    const validPages = [
      'home',
      'models',
      'model-lab',
      'teams',
      'projects',
      'builder',
      'terminal',
      'history',
      'settings',
    ];

    if (typeof input.startupPage === 'string' && validPages.includes(input.startupPage)) {
      sanitized.startupPage = input.startupPage as AppSettings['startupPage'];
    }
    if (typeof input.modelDirectory === 'string') {
      sanitized.modelDirectory = input.modelDirectory.trim();
    }
    if (typeof input.confirmDestructiveActions === 'boolean') {
      sanitized.confirmDestructiveActions = input.confirmDestructiveActions;
    }
    if (typeof input.compactMode === 'boolean') {
      sanitized.compactMode = input.compactMode;
    }

    return store.updateSettings(sanitized);
  });

  // Projects
  ipcMain.handle(IPC_CHANNELS.GET_PROJECTS, () => {
    return store.getProjects();
  });

  ipcMain.handle(IPC_CHANNELS.ADD_PROJECT, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Project Directory',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedPath = result.filePaths[0];
    const projectName = path.basename(selectedPath) || selectedPath;

    const newProject: Project = {
      id: crypto.randomUUID(),
      name: projectName,
      path: selectedPath,
      createdAt: new Date().toISOString(),
    };

    store.addProject(newProject);
    return newProject;
  });

  ipcMain.handle(IPC_CHANNELS.REMOVE_PROJECT, (_event, id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) {
      return false;
    }
    store.removeProject(id);
    return true;
  });

  // Select Model Directory
  ipcMain.handle(IPC_CHANNELS.SELECT_MODEL_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Local Model Directory',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedPath = result.filePaths[0];
    store.updateSettings({ modelDirectory: selectedPath });
    return selectedPath;
  });

  // Window Controls
  ipcMain.handle(IPC_CHANNELS.WINDOW_CONTROL, (_event, action: unknown) => {
    if (typeof action !== 'string') return;

    switch (action) {
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'maximize':
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
        break;
      case 'close':
        mainWindow.close();
        break;
    }
  });

  ipcMain.handle(IPC_CHANNELS.IS_MAXIMIZED, () => {
    return mainWindow.isMaximized();
  });

  // Window state change events
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW_STATE_CHANGED, true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW_STATE_CHANGED, false);
  });
}
