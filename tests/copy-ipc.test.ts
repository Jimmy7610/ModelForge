import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { ipcMain, clipboard } from 'electron';
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
    clipboard: {
      writeText: vi.fn(),
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

describe('Electron Main Clipboard IPC Handler', () => {
  let tempDir: string;
  let store: PersistenceStore;
  let registry: ModelRegistry;
  let inferenceService: InferenceService;
  let mockWindow: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-copy-test-'));
    store = new PersistenceStore(tempDir);
    registry = new ModelRegistry(tempDir);
    inferenceService = new InferenceService(registry);

    mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: { send: vi.fn() },
      on: vi.fn(),
    };

    registerIpcHandlers(mockWindow, store, registry, inferenceService);
    vi.clearAllMocks();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('copies valid string to electron clipboard and returns true', async () => {
    const textToCopy = 'function helloWorld() { return "Model Forge"; }';
    const result = await (ipcMain as any)._callHandler(IPC_CHANNELS.COPY_TEXT, {}, textToCopy);

    expect(result).toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith(textToCopy);
  });

  it('rejects non-string payloads with false without invoking clipboard', async () => {
    expect(await (ipcMain as any)._callHandler(IPC_CHANNELS.COPY_TEXT, {}, null)).toBe(false);
    expect(await (ipcMain as any)._callHandler(IPC_CHANNELS.COPY_TEXT, {}, undefined)).toBe(false);
    expect(await (ipcMain as any)._callHandler(IPC_CHANNELS.COPY_TEXT, {}, 12345)).toBe(false);
    expect(await (ipcMain as any)._callHandler(IPC_CHANNELS.COPY_TEXT, {}, { text: 'malicious' })).toBe(false);
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('rejects payloads exceeding the 5 MB maximum limit with false', async () => {
    const overLimit = 'X'.repeat(5 * 1024 * 1024 + 1);
    const result = await (ipcMain as any)._callHandler(IPC_CHANNELS.COPY_TEXT, {}, overLimit);

    expect(result).toBe(false);
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });
});
