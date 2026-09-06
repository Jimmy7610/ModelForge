import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ModelRecord } from '../../shared/types';
import { DiscoveredFileInfo, normalizePath } from './scanner';
import { cleanDisplayName, parseGgufHeaderSync } from '../gguf/parser';

export function createStableModelId(filePath: string): string {
  const norm = normalizePath(filePath);
  return crypto.createHash('sha256').update(norm).digest('hex').substring(0, 16);
}

export class ModelRegistry {
  private cacheFile: string;
  private records: Map<string, ModelRecord> = new Map();

  constructor(dataDir: string) {
    this.cacheFile = path.join(dataDir, 'modelforge-models.json');
    this.load();
  }

  public getModels(): ModelRecord[] {
    return Array.from(this.records.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
  }

  public getModel(id: string): ModelRecord | null {
    return this.records.get(id) || null;
  }

  public async syncDiscovered(
    discovered: DiscoveredFileInfo[],
    onProgress?: (inspected: number, total: number, currentName: string) => void
  ): Promise<ModelRecord[]> {
    const activeIds = new Set<string>();
    const total = discovered.length;
    let inspected = 0;

    for (const file of discovered) {
      const id = createStableModelId(file.path);
      activeIds.add(id);

      const existing = this.records.get(id);

      // Check if cache is still valid
      if (existing && existing.sizeBytes === file.sizeBytes && Math.abs(existing.mtimeMs - file.mtimeMs) < 1000) {
        // Up to date! Update rootDirectory if needed
        existing.rootDirectory = file.rootDirectory;
        inspected++;
        if (onProgress) {
          onProgress(inspected, total, file.fileName);
        }
        continue;
      }

      // Re-inspect metadata via chunked GGUF parser
      const parsed = parseGgufHeaderSync(file.path);
      const isError = parsed.status === 'error';

      const record: ModelRecord = {
        id,
        path: file.path,
        fileName: file.fileName,
        displayName: cleanDisplayName(file.fileName, parsed.data?.name || parsed.data?.basename),
        rootDirectory: file.rootDirectory,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
        mtimeMs: file.mtimeMs,
        ggufVersion: parsed.data?.ggufVersion ?? null,
        architecture: parsed.data?.architecture ?? null,
        quantization: parsed.data?.quantization ?? null,
        quantizationSource: parsed.data?.quantizationSource ?? null,
        contextLength: parsed.data?.contextLength ?? null,
        metadataStatus: isError ? 'error' : 'available',
        metadataError: parsed.error,
        discoveredAt: existing?.discoveredAt || new Date().toISOString(),
      };

      this.records.set(id, record);
      inspected++;

      if (onProgress) {
        onProgress(inspected, total, file.fileName);
      }

      // Yield control briefly every 10 files to keep main thread responsive
      if (inspected % 10 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    // Remove models that no longer exist on disk
    for (const [id] of this.records) {
      if (!activeIds.has(id)) {
        this.records.delete(id);
      }
    }

    this.save();
    return this.getModels();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.cacheFile)) return;
      const content = fs.readFileSync(this.cacheFile, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.id === 'string' && typeof item.path === 'string') {
            this.records.set(item.id, item);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load models cache, initializing empty:', err);
    }
  }

  public save(): void {
    try {
      const arr = Array.from(this.records.values());
      fs.writeFileSync(this.cacheFile, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save models cache:', err);
    }
  }
}
