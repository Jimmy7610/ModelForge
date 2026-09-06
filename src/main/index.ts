import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc';
import { PersistenceStore } from './store';
import { ModelRegistry } from './models/registry';

import { InferenceService, disposeLlamaInstance } from './inference';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '../..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let mainWindow: BrowserWindow | null = null;
let activeInferenceService: InferenceService | null = null;

function createWindow(): void {
  const store = new PersistenceStore(app.getPath('userData'));
  const registry = new ModelRegistry(app.getPath('userData'));
  const inferenceService = new InferenceService(registry);
  activeInferenceService = inferenceService;

  mainWindow = new BrowserWindow({
    title: 'Model Forge',
    width: 1600,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0d14',
    show: false,
    webPreferences: {
      preload: fs.existsSync(path.join(__dirname, '../preload/index.cjs'))
        ? path.join(__dirname, '../preload/index.cjs')
        : path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  registerIpcHandlers(mainWindow, store, registry, inferenceService);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    mainWindow = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  if (activeInferenceService) {
    try {
      await activeInferenceService.unloadModel();
    } catch {
      // Ignore on exit
    }
  }
  await disposeLlamaInstance();
});
