import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc';
import { PersistenceStore } from './store';
import { ModelRegistry } from './models/registry';
import { InferenceService, disposeLlamaInstance } from './inference';
import { configureQaDebugging } from './qa-debug';
export { configureQaDebugging };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '../..');

if (typeof app !== 'undefined' && app?.commandLine) {
  configureQaDebugging(app);
}

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let mainWindow: BrowserWindow | null = null;
let activeInferenceService: InferenceService | null = null;

async function resolveCanonicalPreload(): Promise<string> {
  const canonicalPreload = path.join(__dirname, '../preload/index.cjs');
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

  console.info(`[ModelForge Main] Model Forge v${app.getVersion?.() || '0.4.0'} | Electron v${process.versions.electron} | Node v${process.versions.node}`);
  console.info(`[ModelForge Main] Canonical preload path: ${canonicalPreload}`);

  // In development, wait up to 3000ms for preload compilation if main process started slightly earlier
  if (isDev && !fs.existsSync(canonicalPreload)) {
    console.info('[ModelForge Main] Dev startup: waiting for preload compilation...');
    const start = Date.now();
    while (!fs.existsSync(canonicalPreload) && Date.now() - start < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  if (!fs.existsSync(canonicalPreload)) {
    const errorMsg = `[ModelForge Main] FATAL: Sandboxed preload bundle not found at: ${canonicalPreload}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const stat = fs.statSync(canonicalPreload);
  console.info(`[ModelForge Main] Preload verified on disk: ${canonicalPreload} (${stat.size} bytes)`);
  return canonicalPreload;
}

async function createWindow(): Promise<void> {
  const preloadPath = await resolveCanonicalPreload();

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
      preload: preloadPath,
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

if (typeof app !== 'undefined' && app.whenReady) {
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
}
