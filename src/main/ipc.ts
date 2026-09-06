import { BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { AppSettings, ModelLibrary, ModelRecord, Project, SendChatMessagePayload } from '../shared/types';
import { IPC_CHANNELS, MAX_PROMPT_CHARS } from '../shared/constants';
import { PersistenceStore } from './store';
import { getHardwareInfo } from './hardware';
import { ModelRegistry } from './models/registry';
import { normalizePath, scanDirectoriesForGguf } from './models/scanner';
import { getDriveStorageForPath } from './models/storage';
import { InferenceService } from './inference';

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  store: PersistenceStore,
  registry: ModelRegistry,
  inferenceService: InferenceService
): void {
  // Setup inference callbacks for streaming and state sync
  inferenceService.setCallbacks(
    (chunk) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_CHUNK, chunk);
      }
    },
    (state) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_STATE_CHANGED, state);
      }
    }
  );
  // Track last scan timestamps per directory
  const scanTimestamps = new Map<string, string>();

  // Helper to build ModelLibrary summaries
  const getLibrariesSummary = (): ModelLibrary[] => {
    const settings = store.getSettings();
    const models = registry.getModels();

    return settings.modelDirectories.map((dir) => {
      const normalizedDir = normalizePath(dir);
      const count = models.filter((m) => {
        const normRoot = normalizePath(m.rootDirectory);
        return normRoot === normalizedDir || normalizePath(m.path).startsWith(normalizedDir + '/');
      }).length;

      return {
        path: dir,
        modelCount: count,
        lastScannedAt: scanTimestamps.get(normalizedDir) || null,
      };
    });
  };

  // Helper to run full scan across directories
  const performScan = async (dirsToScan: string[]): Promise<ModelRecord[]> => {
    mainWindow.webContents.send(IPC_CHANNELS.MODEL_SCAN_PROGRESS, {
      phase: 'started',
    });

    try {
      const discovered = await scanDirectoriesForGguf(dirsToScan, (foundCount, currentName) => {
        mainWindow.webContents.send(IPC_CHANNELS.MODEL_SCAN_PROGRESS, {
          phase: 'discovering',
          totalFound: foundCount,
          currentFile: currentName,
        });
      });

      const updatedModels = await registry.syncDiscovered(
        discovered,
        (inspected, total, currentName) => {
          mainWindow.webContents.send(IPC_CHANNELS.MODEL_SCAN_PROGRESS, {
            phase: 'inspecting',
            inspectedCount: inspected,
            totalFound: total,
            currentFile: currentName,
          });
        }
      );

      const now = new Date().toISOString();
      for (const d of dirsToScan) {
        scanTimestamps.set(normalizePath(d), now);
      }

      mainWindow.webContents.send(IPC_CHANNELS.MODEL_SCAN_PROGRESS, {
        phase: 'completed',
        totalFound: updatedModels.length,
      });

      return updatedModels;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      mainWindow.webContents.send(IPC_CHANNELS.MODEL_SCAN_PROGRESS, {
        phase: 'failed',
        error: errMsg,
      });
      return registry.getModels();
    }
  };

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
    if (Array.isArray(input.modelDirectories)) {
      sanitized.modelDirectories = input.modelDirectories
        .filter((d): d is string => typeof d === 'string' && Boolean(d.trim()))
        .map((d) => path.resolve(d.trim()));
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

  // Model Library Roots
  ipcMain.handle(IPC_CHANNELS.GET_MODEL_LIBRARIES, () => {
    return getLibrariesSummary();
  });

  ipcMain.handle(IPC_CHANNELS.ADD_MODEL_LIBRARY, async (_event, manualPath?: unknown) => {
    let targetPath: string;

    if (typeof manualPath === 'string' && manualPath.trim()) {
      targetPath = path.resolve(manualPath.trim());
    } else {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Local Model Library Folder',
        properties: ['openDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      targetPath = result.filePaths[0];
    }

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Directory does not exist: ${targetPath}`);
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${targetPath}`);
    }

    store.addModelDirectory(targetPath);

    // Automatically scan the newly added library folder
    await performScan([targetPath]);

    return targetPath;
  });

  ipcMain.handle(IPC_CHANNELS.REMOVE_MODEL_LIBRARY, async (_event, dirPath: unknown) => {
    if (typeof dirPath !== 'string' || !dirPath.trim()) {
      return false;
    }

    store.removeModelDirectory(dirPath);

    // Rescan remaining directories to update active model registry
    const remaining = store.getSettings().modelDirectories;
    await performScan(remaining);

    return true;
  });

  ipcMain.handle(IPC_CHANNELS.SCAN_MODEL_LIBRARY, async (_event, dirPath: unknown) => {
    if (typeof dirPath !== 'string' || !dirPath.trim()) {
      throw new Error('Directory path must be provided');
    }
    return await performScan([dirPath]);
  });

  ipcMain.handle(IPC_CHANNELS.SCAN_ALL_MODEL_LIBRARIES, async () => {
    const dirs = store.getSettings().modelDirectories;
    return await performScan(dirs);
  });

  ipcMain.handle(IPC_CHANNELS.GET_MODELS, () => {
    return registry.getModels();
  });

  ipcMain.handle(IPC_CHANNELS.GET_MODEL_DETAILS, (_event, modelId: unknown) => {
    if (typeof modelId !== 'string' || !modelId.trim()) {
      return null;
    }
    return registry.getModel(modelId);
  });

  ipcMain.handle(IPC_CHANNELS.GET_PRIMARY_DRIVE_STORAGE, () => {
    const dirs = store.getSettings().modelDirectories;
    if (dirs.length === 0) {
      return null;
    }
    return getDriveStorageForPath(dirs[0]);
  });

  // Local Inference & Streaming Chat Handlers (Pass 3)
  ipcMain.handle(IPC_CHANNELS.GET_INFERENCE_STATE, async () => {
    return inferenceService.getState();
  });

  ipcMain.handle(IPC_CHANNELS.GET_INFERENCE_RUNTIME_INFO, async () => {
    return inferenceService.getRuntimeInfo();
  });

  ipcMain.handle(
    IPC_CHANNELS.LOAD_MODEL,
    async (_event, payload: { modelId?: string; contextSize?: number }) => {
      if (!payload || typeof payload.modelId !== 'string' || !payload.modelId.trim()) {
        throw new Error('Valid modelId is required to load a model');
      }
      return inferenceService.loadModel(payload.modelId.trim(), payload.contextSize);
    }
  );

  ipcMain.handle(IPC_CHANNELS.UNLOAD_MODEL, async () => {
    return inferenceService.unloadModel();
  });

  ipcMain.handle(
    IPC_CHANNELS.SEND_CHAT_MESSAGE,
    async (_event, payload: SendChatMessagePayload) => {
      if (!payload || typeof payload.prompt !== 'string') {
        throw new Error('Valid prompt string is required');
      }
      if (payload.prompt.trim().length === 0) {
        throw new Error('Prompt cannot be empty');
      }
      if (payload.prompt.length > MAX_PROMPT_CHARS) {
        throw new Error(`Prompt exceeds maximum character length of ${MAX_PROMPT_CHARS}`);
      }
      return inferenceService.sendChatMessage(payload);
    }
  );

  ipcMain.handle(IPC_CHANNELS.STOP_GENERATION, async () => {
    return inferenceService.stopGeneration();
  });

  ipcMain.handle(IPC_CHANNELS.CLEAR_CHAT, async () => {
    return inferenceService.clearChat();
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

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW_STATE_CHANGED, true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW_STATE_CHANGED, false);
  });
}
