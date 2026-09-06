import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ModelRegistry, createStableModelId } from '../src/main/models/registry';
import { GgufBuilder } from './fixtures/gguf-builder';
import { scanDirectoriesForGguf } from '../src/main/models/scanner';

describe('ModelRegistry and Metadata Cache', () => {
  let tempDir: string;
  let registry: ModelRegistry;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelforge-registry-test-'));
    registry = new ModelRegistry(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('generates deterministic stable model IDs', () => {
    const p1 = 'C:\\Models\\Qwen-14B.gguf';
    const p2 = 'c:/models/qwen-14b.gguf';

    const id1 = createStableModelId(p1);
    const id2 = createStableModelId(p2);

    if (process.platform === 'win32') {
      expect(id1).toBe(id2);
    }
    expect(id1).toHaveLength(16);
  });

  it('syncs discovered files and populates registry with parsed metadata', async () => {
    const modelPath = path.join(tempDir, 'Qwen-7B.gguf');
    new GgufBuilder()
      .setVersion(3)
      .addString('general.name', 'Qwen 7B Base')
      .addString('general.architecture', 'qwen2')
      .addUint32('general.file_type', 15) // Q4_K_M
      .writeToFile(modelPath);

    const discovered = await scanDirectoriesForGguf([tempDir]);
    const models = await registry.syncDiscovered(discovered);

    expect(models).toHaveLength(1);
    expect(models[0].displayName).toBe('Qwen 7B Base');
    expect(models[0].architecture).toBe('qwen2');
    expect(models[0].quantization).toBe('Q4_K_M');
    expect(models[0].metadataStatus).toBe('available');
  });

  it('reuses cached metadata when file size and timestamp are unchanged', async () => {
    const modelPath = path.join(tempDir, 'Cached-Model.gguf');
    new GgufBuilder()
      .setVersion(3)
      .addString('general.name', 'Original Model')
      .writeToFile(modelPath);

    const discovered1 = await scanDirectoriesForGguf([tempDir]);
    await registry.syncDiscovered(discovered1);

    const recordBefore = registry.getModel(createStableModelId(modelPath));
    expect(recordBefore?.displayName).toBe('Original Model');

    // Run sync again with same file
    const discovered2 = await scanDirectoriesForGguf([tempDir]);
    await registry.syncDiscovered(discovered2);

    const recordAfter = registry.getModel(createStableModelId(modelPath));
    expect(recordAfter?.displayName).toBe('Original Model');
    expect(recordAfter?.discoveredAt).toBe(recordBefore?.discoveredAt);
  });

  it('invalidates cache and re-parses when file is modified', async () => {
    const modelPath = path.join(tempDir, 'Evolving-Model.gguf');
    new GgufBuilder()
      .setVersion(3)
      .addString('general.name', 'V1 Model')
      .writeToFile(modelPath);

    const discovered1 = await scanDirectoriesForGguf([tempDir]);
    await registry.syncDiscovered(discovered1);
    expect(registry.getModels()[0].displayName).toBe('V1 Model');

    // Wait 15ms and rewrite with new metadata
    await new Promise((r) => setTimeout(r, 20));
    new GgufBuilder()
      .setVersion(3)
      .addString('general.name', 'V2 Model Updated')
      .writeToFile(modelPath);

    const discovered2 = await scanDirectoriesForGguf([tempDir]);
    await registry.syncDiscovered(discovered2);

    expect(registry.getModels()[0].displayName).toBe('V2 Model Updated');
  });

  it('removes disappeared files from active registry', async () => {
    const model1Path = path.join(tempDir, 'stay.gguf');
    const model2Path = path.join(tempDir, 'delete-me.gguf');

    new GgufBuilder().addString('general.name', 'Keep').writeToFile(model1Path);
    new GgufBuilder().addString('general.name', 'Delete').writeToFile(model2Path);

    const discovered1 = await scanDirectoriesForGguf([tempDir]);
    await registry.syncDiscovered(discovered1);
    expect(registry.getModels()).toHaveLength(2);

    // Delete one file
    fs.unlinkSync(model2Path);

    const discovered2 = await scanDirectoriesForGguf([tempDir]);
    const updated = await registry.syncDiscovered(discovered2);

    expect(updated).toHaveLength(1);
    expect(updated[0].displayName).toBe('Keep');
  });
});
