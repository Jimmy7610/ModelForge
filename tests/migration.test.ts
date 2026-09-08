import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PersistenceStore } from '../src/main/store';
import { SCHEMA_VERSION } from '../src/shared/constants';

describe('Settings Schema v2 & Model Library Migration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelforge-migration-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('migrates Pass 1 single modelDirectory to modelDirectories array', () => {
    const settingsFile = path.join(tempDir, 'modelforge-settings.json');
    const legacyPass1 = {
      schemaVersion: 1,
      startupPage: 'home',
      modelDirectory: path.join(tempDir, 'LegacyModels'),
      confirmDestructiveActions: true,
      compactMode: false,
    };
    fs.writeFileSync(settingsFile, JSON.stringify(legacyPass1, null, 2), 'utf-8');

    const store = new PersistenceStore(tempDir);
    const migrated = store.getSettings();

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.modelDirectories).toHaveLength(1);
    expect(migrated.modelDirectories[0]).toContain('Models');
    expect(migrated.startupPage).toBe('home');
  });

  it('persists multiple model library roots and avoids duplicates', () => {
    const store = new PersistenceStore(tempDir);

    const dir1 = path.join(tempDir, 'models1');
    const dir2 = path.join(tempDir, 'models2');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    store.addModelDirectory(dir1);
    store.addModelDirectory(dir2);

    let settings = store.getSettings();
    expect(settings.modelDirectories).toHaveLength(2);

    // Try adding duplicate
    store.addModelDirectory(dir1);
    settings = store.getSettings();
    expect(settings.modelDirectories).toHaveLength(2);

    // Remove one
    store.removeModelDirectory(dir1);
    settings = store.getSettings();
    expect(settings.modelDirectories).toHaveLength(1);
    expect(settings.modelDirectories[0]).toBe(path.resolve(dir2));

    // Confirm folder on disk was NOT deleted
    expect(fs.existsSync(dir1)).toBe(true);
  });
});
