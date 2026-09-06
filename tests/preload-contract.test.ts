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
    expect(bridgeInfo.version).toBe('0.3.2');
    expect(bridgeInfo.preloadFormat).toBe('cjs');
  });

  it('verifies ModelForgeAPI includes getBridgeInfo health check', () => {
    const dummyApi: Partial<ModelForgeAPI> = {
      getBridgeInfo: () => ({
        available: true,
        version: APP_VERSION,
        preloadFormat: 'cjs',
        platform: process.platform,
      }),
    };

    expect(dummyApi.getBridgeInfo).toBeDefined();
    const result = dummyApi.getBridgeInfo!();
    expect(result.available).toBe(true);
    expect(result.preloadFormat).toBe('cjs');
  });
});
