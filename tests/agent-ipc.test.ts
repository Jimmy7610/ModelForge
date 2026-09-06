import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ipcMain } from 'electron';
import { registerIpcHandlers } from '../src/main/ipc';
import { PersistenceStore } from '../src/main/store';
import { ModelRegistry } from '../src/main/models/registry';
import { InferenceService } from '../src/main/inference/service';
import { IPC_CHANNELS } from '../src/shared/constants';

vi.mock('electron', () => {
  const handlers = new Map<string, Function>();
  return {
    app: {
      getPath: vi.fn().mockReturnValue(os.tmpdir()),
    },
    ipcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        handlers.set(channel, handler);
      }),
      _callHandler: async (channel: string, event: any, ...args: any[]) => {
        const handler = handlers.get(channel);
        if (!handler) throw new Error(`No handler registered for ${channel}`);
        return handler(event, ...args);
      },
    },
    BrowserWindow: vi.fn().mockImplementation(() => ({
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn(),
      },
      on: vi.fn(),
      minimize: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn().mockReturnValue(false),
    })),
    dialog: {
      showOpenDialog: vi.fn(),
    },
  };
});

describe('Agent & Workspace IPC Handlers', () => {
  let tempDir: string;
  let tempWorkspace: string;
  let store: PersistenceStore;
  let registry: ModelRegistry;
  let inferenceService: InferenceService;
  let mockWindow: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-ipc-test-'));
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-ipc-workspace-'));

    fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempWorkspace, 'package.json'), '{"name":"ipc-test"}', 'utf8');
    fs.writeFileSync(path.join(tempWorkspace, 'src', 'App.tsx'), 'export const App = () => null;', 'utf8');

    store = new PersistenceStore(tempDir);
    registry = new ModelRegistry(tempDir);
    inferenceService = new InferenceService(registry);

    mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn(),
      },
      on: vi.fn(),
    };

    registerIpcHandlers(mockWindow, store, registry, inferenceService);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('handles GET_PROJECTS and SET_ACTIVE_PROJECT', async () => {
    store.addProject({
      id: 'proj-1',
      name: 'IPC Project',
      path: tempWorkspace,
    });

    const projects = await (ipcMain as any)._callHandler(IPC_CHANNELS.GET_PROJECTS, {});
    expect(projects.length).toBe(1);

    const setResult = await (ipcMain as any)._callHandler(IPC_CHANNELS.SET_ACTIVE_PROJECT, {}, 'proj-1');
    expect(setResult).toBe(true);
    expect(store.getActiveProjectId()).toBe('proj-1');
  });

  it('handles read-only workspace inspection IPC tools', async () => {
    store.addProject({
      id: 'proj-inspect',
      name: 'Inspection Project',
      path: tempWorkspace,
    });
    store.setActiveProjectId('proj-inspect');

    // 1. GET_PROJECT_OVERVIEW
    const overview = await (ipcMain as any)._callHandler(IPC_CHANNELS.GET_PROJECT_OVERVIEW, {});
    expect(overview.name).toBe('ipc-test');

    // 2. LIST_DIRECTORY
    const dirList = await (ipcMain as any)._callHandler(IPC_CHANNELS.LIST_DIRECTORY, {}, { path: 'src' });
    expect(dirList.entries.some((e: any) => e.name === 'App.tsx')).toBe(true);

    // 3. READ_FILE
    const fileContent = await (ipcMain as any)._callHandler(IPC_CHANNELS.READ_FILE, {}, { path: 'package.json' });
    expect(fileContent.content).toContain('ipc-test');

    // 4. SEARCH_TEXT
    const searchRes = await (ipcMain as any)._callHandler(IPC_CHANNELS.SEARCH_TEXT, {}, { query: 'App' });
    expect(searchRes.matches.length).toBeGreaterThan(0);
  });

  it('rejects RUN_PLAN_AGENT if payload is invalid or project missing', async () => {
    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.RUN_PLAN_AGENT, {}, null)
    ).rejects.toThrow('Invalid runPlan payload');

    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.RUN_PLAN_AGENT, {}, { projectId: 'non-existent', prompt: 'test' })
    ).rejects.toThrow('Project not found');
  });
});
