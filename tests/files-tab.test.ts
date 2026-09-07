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
    })),
    dialog: {
      showOpenDialog: vi.fn(),
    },
  };
});

describe('Files Tab Backend & Hard Workspace Jail (projectId + relativePath)', () => {
  let tempDir: string;
  let tempWorkspace: string;
  let store: PersistenceStore;
  let registry: ModelRegistry;
  let inferenceService: InferenceService;
  let mockWindow: any;
  const PROJECT_ID = 'test-proj-files-1';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-files-tab-store-'));
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-files-tab-ws-'));

    // Create realistic folder structure
    fs.mkdirSync(path.join(tempWorkspace, 'src', 'components'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkspace, 'assets'), { recursive: true });

    fs.writeFileSync(
      path.join(tempWorkspace, 'package.json'),
      JSON.stringify({ name: 'files-tab-app', version: '0.1.0' }, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'index.ts'),
      'console.log("Hello from index");\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'components', 'Button.tsx'),
      'export const Button = () => <button>Click</button>;\n',
      'utf8'
    );

    // Create a binary file (PNG header)
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    fs.writeFileSync(path.join(tempWorkspace, 'assets', 'logo.png'), pngHeader);

    store = new PersistenceStore(tempDir);
    registry = new ModelRegistry(tempDir);
    inferenceService = new InferenceService(registry);

    store.addProject({
      id: PROJECT_ID,
      name: 'Files Tab Test Project',
      path: tempWorkspace,
    });

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

  it('lists root directory using projectId even when another project is active', async () => {
    // Add second project and set it active
    const secondWs = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-files-tab-ws2-'));
    store.addProject({
      id: 'second-proj',
      name: 'Second Project',
      path: secondWs,
    });
    store.setActiveProjectId('second-proj');
    expect(store.getActiveProjectId()).toBe('second-proj');

    // Query first project by explicit projectId
    const res = await (ipcMain as any)._callHandler(IPC_CHANNELS.LIST_DIRECTORY, {}, {
      projectId: PROJECT_ID,
      path: '',
    });

    expect(res.entries).toBeDefined();
    const entryNames = res.entries.map((e: any) => e.name);
    expect(entryNames).toContain('src');
    expect(entryNames).toContain('assets');
    expect(entryNames).toContain('package.json');

    const srcEntry = res.entries.find((e: any) => e.name === 'src');
    expect(srcEntry.type).toBe('directory');

    try {
      fs.rmSync(secondWs, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('lazy loads nested directory via projectId and relativePath', async () => {
    const res = await (ipcMain as any)._callHandler(IPC_CHANNELS.LIST_DIRECTORY, {}, {
      projectId: PROJECT_ID,
      path: 'src',
    });

    expect(res.entries).toBeDefined();
    const entryNames = res.entries.map((e: any) => e.name);
    expect(entryNames).toContain('index.ts');
    expect(entryNames).toContain('components');

    const indexEntry = res.entries.find((e: any) => e.name === 'index.ts');
    expect(indexEntry.type).toBe('file');
  });

  it('reads source file contents with line numbers and metadata', async () => {
    const res = await (ipcMain as any)._callHandler(IPC_CHANNELS.READ_FILE, {}, {
      projectId: PROJECT_ID,
      path: 'src/components/Button.tsx',
    });

    expect(res.content).toContain('export const Button');
    expect(res.totalLines).toBeGreaterThanOrEqual(1);
    expect(res.isBinary).toBe(false);
    expect(res.truncated).toBe(false);
  });

  it('blocks reading binary files and flags isBinary: true', async () => {
    const res = await (ipcMain as any)._callHandler(IPC_CHANNELS.READ_FILE, {}, {
      projectId: PROJECT_ID,
      path: 'assets/logo.png',
    });

    expect(res.isBinary).toBe(true);
    expect(res.content).toContain('Binary file cannot be displayed');
  });

  it('strictly rejects any path escaping the workspace jail', async () => {
    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.READ_FILE, {}, {
        projectId: PROJECT_ID,
        path: '../../etc/passwd',
      })
    ).rejects.toThrow('escapes workspace jail');

    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.LIST_DIRECTORY, {}, {
        projectId: PROJECT_ID,
        path: '../../../Windows',
      })
    ).rejects.toThrow('escapes workspace jail');
  });

  it('rejects operations on non-existent projectId', async () => {
    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.READ_FILE, {}, {
        projectId: 'ghost-project',
        path: 'package.json',
      })
    ).rejects.toThrow('Project not found');
  });
});
