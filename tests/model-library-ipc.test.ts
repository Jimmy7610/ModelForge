import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PersistenceStore } from '../src/main/store';
import { ModelRegistry } from '../src/main/models/registry';
import { GgufBuilder } from './fixtures/gguf-builder';
import { scanDirectoriesForGguf } from '../src/main/models/scanner';

describe('Model Library IPC and Orchestration Logic', () => {
  let tempDir: string;
  let store: PersistenceStore;
  let registry: ModelRegistry;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelforge-lib-ipc-test-'));
    store = new PersistenceStore(tempDir);
    registry = new ModelRegistry(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('handles dialog cancellation cleanly returning null without altering state', async () => {
    // Simulate dialog returning canceled: true
    const showOpenDialogMock = vi.fn().mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    const handleAddModelLibrary = async (manualPath?: string) => {
      let targetPath: string;
      if (manualPath && manualPath.trim()) {
        targetPath = path.resolve(manualPath.trim());
      } else {
        const res = await showOpenDialogMock();
        if (res.canceled || res.filePaths.length === 0) {
          return null;
        }
        targetPath = res.filePaths[0];
      }
      store.addModelDirectory(targetPath);
      return targetPath;
    };

    const result = await handleAddModelLibrary();
    expect(result).toBeNull();
    expect(showOpenDialogMock).toHaveBeenCalledOnce();
    expect(store.getSettings().modelDirectories).toHaveLength(0);
  });

  it('validates selected folder and rejects non-existent paths', async () => {
    const nonExistentPath = path.join(tempDir, 'does-not-exist');

    const handleAddModelLibrary = async (targetPath: string) => {
      if (!fs.existsSync(targetPath)) {
        throw new Error(`Directory does not exist: ${targetPath}`);
      }
      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${targetPath}`);
      }
      store.addModelDirectory(targetPath);
      return targetPath;
    };

    await expect(handleAddModelLibrary(nonExistentPath)).rejects.toThrow('Directory does not exist');
    expect(store.getSettings().modelDirectories).toHaveLength(0);
  });

  it('validates selected folder and rejects files', async () => {
    const filePath = path.join(tempDir, 'test-file.txt');
    fs.writeFileSync(filePath, 'sample content');

    const handleAddModelLibrary = async (targetPath: string) => {
      if (!fs.existsSync(targetPath)) {
        throw new Error(`Directory does not exist: ${targetPath}`);
      }
      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${targetPath}`);
      }
      store.addModelDirectory(targetPath);
      return targetPath;
    };

    await expect(handleAddModelLibrary(filePath)).rejects.toThrow('Path is not a directory');
    expect(store.getSettings().modelDirectories).toHaveLength(0);
  });

  it('persists validated folder path and deduplicates roots', async () => {
    const modelsFolder = path.join(tempDir, 'models');
    fs.mkdirSync(modelsFolder, { recursive: true });

    // Add once
    store.addModelDirectory(modelsFolder);
    expect(store.getSettings().modelDirectories).toHaveLength(1);

    // Attempt duplicate add
    store.addModelDirectory(modelsFolder);
    expect(store.getSettings().modelDirectories).toHaveLength(1);
  });

  it('triggers scan upon successful folder selection and populates registry', async () => {
    const modelsFolder = path.join(tempDir, 'models');
    fs.mkdirSync(modelsFolder, { recursive: true });

    // Create a dummy GGUF
    const ggufPath = path.join(modelsFolder, 'TestModel.gguf');
    new GgufBuilder()
      .setVersion(3)
      .addString('general.name', 'Integration Test Model')
      .addString('general.architecture', 'llama')
      .addUint32('general.file_type', 2) // Q4_0
      .writeToFile(ggufPath);

    // Simulate IPC add flow
    store.addModelDirectory(modelsFolder);
    const discovered = await scanDirectoriesForGguf([modelsFolder]);
    const records = await registry.syncDiscovered(discovered);

    expect(records).toHaveLength(1);
    expect(records[0].displayName).toBe('Integration Test Model');
    expect(records[0].architecture).toBe('llama');
    expect(records[0].quantization).toBe('Q4_0');
  });

  it('retains registered libraries across store reload/restart', () => {
    const folderA = path.join(tempDir, 'folderA');
    fs.mkdirSync(folderA, { recursive: true });
    store.addModelDirectory(folderA);

    // Simulate app restart by loading new store instance from same dataDir
    const restartedStore = new PersistenceStore(tempDir);
    expect(restartedStore.getSettings().modelDirectories).toContain(folderA);
  });
});
