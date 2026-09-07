import { BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { AppSettings, ModelLibrary, ModelRecord, SendChatMessagePayload } from '../shared/types';

import { IPC_CHANNELS, MAX_PROMPT_CHARS } from '../shared/constants';
import { PersistenceStore } from './store';
import { getHardwareInfo } from './hardware';
import { ModelRegistry } from './models/registry';
import { normalizePath, scanDirectoriesForGguf } from './models/scanner';
import { getDriveStorageForPath } from './models/storage';
import { InferenceService } from './inference';
import { PlanAgent } from './agent';
import { WorkspaceGuard, WorkspaceTools } from './workspace';

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  store: PersistenceStore,
  registry: ModelRegistry,
  inferenceService: InferenceService,
  existingPlanAgent?: PlanAgent
): void {
  const planAgent = existingPlanAgent || new PlanAgent(inferenceService);

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
    const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    if (targetWindow) {
      targetWindow.focus();
    }
    const result = targetWindow
      ? await dialog.showOpenDialog(targetWindow, {
          title: 'Select Project Directory',
          properties: ['openDirectory', 'dontAddToRecent'],
        })
      : await dialog.showOpenDialog({
          title: 'Select Project Directory',
          properties: ['openDirectory', 'dontAddToRecent'],
        });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedPath = result.filePaths[0];
    const projectName = path.basename(selectedPath) || selectedPath;
    const newId = crypto.randomUUID();

    store.addProject({
      id: newId,
      name: projectName,
      rootPath: selectedPath,
      path: selectedPath,
    });

    const updatedProjects = store.getProjects();
    const created = updatedProjects.find((p) => p.id === newId) || updatedProjects[updatedProjects.length - 1];
    if (created) {
      store.setActiveProjectId(created.id);
    }
    return created || null;
  });

  ipcMain.handle(IPC_CHANNELS.REMOVE_PROJECT, (_event, id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) {
      return false;
    }
    store.removeProject(id);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.SET_ACTIVE_PROJECT, (_event, id: unknown) => {
    if (typeof id !== 'string' && id !== null) {
      return false;
    }
    store.setActiveProjectId(id);
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
      const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
      if (targetWindow) {
        targetWindow.focus();
      }
      const result = targetWindow
        ? await dialog.showOpenDialog(targetWindow, {
            title: 'Select Local Model Library Folder',
            properties: ['openDirectory', 'dontAddToRecent'],
          })
        : await dialog.showOpenDialog({
            title: 'Select Local Model Library Folder',
            properties: ['openDirectory', 'dontAddToRecent'],
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

  // Plan Agent & Workspace Intelligence (Pass 4)
  ipcMain.handle(IPC_CHANNELS.RUN_PLAN_AGENT, async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid runPlan payload');
    }
    const { projectId, prompt } = payload as { projectId?: string; prompt?: string };
    if (!projectId || typeof projectId !== 'string' || !prompt || typeof prompt !== 'string') {
      throw new Error('projectId and non-empty prompt are required');
    }

    const projects = store.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      throw new Error(`Project not found with id: "${projectId}"`);
    }

    const runId = crypto.randomUUID();

    // Launch plan execution asynchronously and stream updates to renderer
    planAgent
      .startPlanning(
        project,
        prompt,
        {
          onActivity: (activity) => {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC_CHANNELS.AGENT_ACTIVITY, activity);
            }
          },
          onChunk: (chunk) => {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC_CHANNELS.AGENT_CHUNK, chunk);
              // Also forward to INFERENCE_CHUNK so existing Chat tab can display it seamlessly
              mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_CHUNK, chunk);
            }
          },
          onStateChange: (state) => {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC_CHANNELS.AGENT_STATE_CHANGED, state);
            }
          },
        },
        runId
      )
      .catch((err) => {
        console.error('[ModelForge PlanAgent] Error executing plan agent:', err);
      });

    return { success: true, runId, sessionId: runId };
  });

  ipcMain.handle(IPC_CHANNELS.STOP_PLAN_AGENT, async () => {
    return planAgent.stopPlanning();
  });

  ipcMain.handle(IPC_CHANNELS.GET_AGENT_STATE, () => {
    return planAgent.getState();
  });

  ipcMain.handle(IPC_CHANNELS.CHECK_TOOL_CAPABILITY, async (_event, modelId?: unknown) => {
    const targetModelId = typeof modelId === 'string' ? modelId : undefined;
    return inferenceService.getToolCapability(targetModelId);
  });

  // Read-Only Workspace Inspection Tools
  const resolveProjectGuard = (projectId?: string): WorkspaceGuard => {
    const targetId = projectId || store.getActiveProjectId();
    const projects = store.getProjects();
    const project = projects.find((p) => p.id === targetId);
    if (!project) {
      throw new Error(projectId ? `Project not found with id: "${projectId}"` : 'No active project found for inspection');
    }
    return new WorkspaceGuard(project.rootPath || project.path);
  };


  ipcMain.handle(IPC_CHANNELS.GET_PROJECT_OVERVIEW, async (_event, projectId?: unknown) => {
    const guard = resolveProjectGuard(typeof projectId === 'string' ? projectId : undefined);
    const tools = new WorkspaceTools(guard);
    return tools.getProjectOverview();
  });

  ipcMain.handle(IPC_CHANNELS.LIST_DIRECTORY, async (_event, options?: unknown) => {
    const opts = (options && typeof options === 'object' ? options : {}) as {
      path?: string;
      recursive?: boolean;
      maxDepth?: number;
      projectId?: string;
    };
    const guard = resolveProjectGuard(opts.projectId);
    const tools = new WorkspaceTools(guard);
    return tools.listDirectory(opts);
  });

  ipcMain.handle(IPC_CHANNELS.READ_FILE, async (_event, options?: unknown) => {
    if (!options || typeof options !== 'object') {
      throw new Error('Missing read options');
    }
    const opts = options as { path: string; startLine?: number; endLine?: number; projectId?: string };
    const guard = resolveProjectGuard(opts.projectId);
    const tools = new WorkspaceTools(guard);
    return tools.readFile(opts);
  });

  ipcMain.handle(IPC_CHANNELS.SEARCH_TEXT, async (_event, options?: unknown) => {
    if (!options || typeof options !== 'object') {
      throw new Error('Missing search options');
    }
    const opts = options as {
      query: string;
      path?: string;
      caseSensitive?: boolean;
      maxMatches?: number;
      projectId?: string;
    };
    const guard = resolveProjectGuard(opts.projectId);
    const tools = new WorkspaceTools(guard);
    return tools.searchText(opts);
  });

  // System & Clipboard (Pass 4.1)
  ipcMain.handle(IPC_CHANNELS.COPY_TEXT, (_event, text: unknown) => {
    if (typeof text !== 'string') {
      return false;
    }
    // Sane limit: 5MB maximum
    if (text.length > 5 * 1024 * 1024) {
      return false;
    }
    clipboard.writeText(text);
    return true;
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
