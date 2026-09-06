import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanDirectoriesForGguf, normalizePath } from '../src/main/models/scanner';

describe('Recursive GGUF Model Scanner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelforge-scanner-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('recursively discovers .gguf and .GGUF files across nested directories', async () => {
    // Structure:
    // root/
    //   model1.gguf
    //   MODEL2.GGUF (uppercase)
    //   nested/
    //     deep/
    //       model3.gguf
    //   other/
    //     readme.txt (ignored)
    //     data.bin (ignored)

    fs.writeFileSync(path.join(tempDir, 'model1.gguf'), 'dummy gguf 1');
    fs.writeFileSync(path.join(tempDir, 'MODEL2.GGUF'), 'dummy gguf 2');

    const deepDir = path.join(tempDir, 'nested', 'deep');
    fs.mkdirSync(deepDir, { recursive: true });
    fs.writeFileSync(path.join(deepDir, 'model3.gguf'), 'dummy gguf 3');

    const otherDir = path.join(tempDir, 'other');
    fs.mkdirSync(otherDir, { recursive: true });
    fs.writeFileSync(path.join(otherDir, 'readme.txt'), 'text file');
    fs.writeFileSync(path.join(otherDir, 'data.bin'), 'binary file');

    const discovered = await scanDirectoriesForGguf([tempDir]);

    expect(discovered).toHaveLength(3);
    const fileNames = discovered.map((d) => d.fileName);
    expect(fileNames).toContain('model1.gguf');
    expect(fileNames).toContain('MODEL2.GGUF');
    expect(fileNames).toContain('model3.gguf');
    expect(fileNames).not.toContain('readme.txt');
    expect(fileNames).not.toContain('data.bin');
  });

  it('deduplicates files when overlapping root directories are configured', async () => {
    const subDir = path.join(tempDir, 'subfolder');
    fs.mkdirSync(subDir, { recursive: true });

    fs.writeFileSync(path.join(tempDir, 'root-model.gguf'), 'root model');
    fs.writeFileSync(path.join(subDir, 'sub-model.gguf'), 'sub model');

    // Scan both parent and child directory
    const discovered = await scanDirectoriesForGguf([tempDir, subDir]);

    // sub-model.gguf should only be present once
    expect(discovered).toHaveLength(2);
    const names = discovered.map((d) => d.fileName);
    expect(names.filter((n) => n === 'sub-model.gguf')).toHaveLength(1);
  });

  it('normalizes paths consistently', () => {
    const p1 = 'C:\\AI\\Models\\test.gguf';
    const p2 = 'c:/ai/models/test.gguf';

    if (process.platform === 'win32') {
      expect(normalizePath(p1)).toBe(normalizePath(p2));
    } else {
      expect(normalizePath('/ai/models/test.gguf')).toBe('/ai/models/test.gguf');
    }
  });

  it('handles non-existent or invalid directory paths safely', async () => {
    const nonExistent = path.join(tempDir, 'does-not-exist');
    const discovered = await scanDirectoriesForGguf([nonExistent, '']);
    expect(discovered).toEqual([]);
  });
});
