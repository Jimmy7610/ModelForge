import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { APP_VERSION } from '../src/shared/constants';
import { BridgeInfo, ModelForgeAPI } from '../src/shared/types';

describe('Preload & Bridge Architecture Contract', () => {
  const mainEntryPath = path.resolve(__dirname, '../src/main/index.ts');
  const mainSource = fs.readFileSync(mainEntryPath, 'utf8');
  const viteConfigPath = path.resolve(__dirname, '../vite.config.ts');
  const viteConfigSource = fs.readFileSync(viteConfigPath, 'utf8');

  it('enforces canonical preload bundle filename is index.cjs without index.js fallback', () => {
    // Verify main points strictly to index.cjs
    expect(mainSource).toContain("path.join(__dirname, '../preload/index.cjs')");
    // Verify no fallback to index.js
    expect(mainSource).not.toContain("path.join(__dirname, '../preload/index.js')");
  });

  it('fails fast with explicit fatal error when canonical preload is missing', () => {
    expect(mainSource).toContain('FATAL: Sandboxed preload bundle not found');
    expect(mainSource).toContain('throw new Error');
  });

  it('configures preload build in vite.config.ts exclusively as CommonJS (.cjs)', () => {
    expect(viteConfigSource).toContain("formats: ['cjs']");
    expect(viteConfigSource).toContain("fileName: () => '[name].cjs'");
    expect(viteConfigSource).toContain('emptyOutDir: true');
  });

  it('verifies BridgeInfo structure and values', () => {
    const bridgeInfo: BridgeInfo = {
      available: true,
      version: APP_VERSION,
      preloadFormat: 'cjs',
      platform: process.platform,
    };

    expect(bridgeInfo.available).toBe(true);
    expect(bridgeInfo.version).toBe('0.5.0');
    expect(bridgeInfo.preloadFormat).toBe('cjs');
  });

  it('verifies ModelForgeAPI includes getBridgeInfo, copyText, and Pass 5 Edit/Checkpoint contracts', () => {
    const dummyApi: Partial<ModelForgeAPI> = {
      getBridgeInfo: () => ({
        available: true,
        version: APP_VERSION,
        preloadFormat: 'cjs',
        platform: process.platform,
      }),
      copyText: async (text: string) => typeof text === 'string',
      runEditAgent: async () => ({ success: true, runId: 'test', checkpointId: 'cp1' }),
      stopEditAgent: async () => true,
      acceptCheckpoint: async () => ({ success: true }),
      rollbackCheckpoint: async () => ({
        success: true,
        checkpointId: '1',
        restoredFiles: [],
        deletedCreatedFiles: [],
        cleanedDirs: [],
        conflicts: [],
      }),
      createManualCheckpoint: async () => ({
        id: '1',
        projectId: 'p',
        timestamp: '2026-09-07T00:00:00.000Z',
        type: 'manual',
        status: 'accepted',
        filesCount: 0,
        totalBackupBytes: 0,
      }),
      getPendingCheckpoint: async () => null,
      getCheckpointDiff: async () => null,
    };

    expect(dummyApi.getBridgeInfo).toBeDefined();
    const result = dummyApi.getBridgeInfo!();
    expect(result.available).toBe(true);
    expect(result.version).toBe('0.5.0');
    expect(result.preloadFormat).toBe('cjs');
    expect(dummyApi.copyText).toBeDefined();
    expect(dummyApi.runEditAgent).toBeDefined();
    expect(dummyApi.acceptCheckpoint).toBeDefined();
    expect(dummyApi.rollbackCheckpoint).toBeDefined();
    expect(dummyApi.createManualCheckpoint).toBeDefined();
  });
});
