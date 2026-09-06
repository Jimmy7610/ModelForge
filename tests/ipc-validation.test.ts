import { describe, it, expect } from 'vitest';
import { PersistenceStore } from '../src/main/store';
import { AppSettings, Project } from '../src/shared/types';

describe('IPC Payload and Schema Validation Helpers', () => {
  const dummyStore = new PersistenceStore('./test-dummy-dir');

  it('validates correct AppSettings structures', () => {
    const valid: AppSettings = {
      schemaVersion: 1,
      startupPage: 'builder',
      modelDirectory: 'C:\\Models',
      confirmDestructiveActions: true,
      compactMode: false,
    };

    expect(dummyStore.isValidSettings(valid)).toBe(true);
  });

  it('rejects invalid or incomplete AppSettings structures', () => {
    expect(dummyStore.isValidSettings(null)).toBe(false);
    expect(dummyStore.isValidSettings({})).toBe(false);
    expect(
      dummyStore.isValidSettings({
        schemaVersion: 1,
        startupPage: 'unknown-route',
        modelDirectory: '',
        confirmDestructiveActions: true,
        compactMode: false,
      })
    ).toBe(false);

    expect(
      dummyStore.isValidSettings({
        schemaVersion: -1,
        startupPage: 'builder',
        modelDirectory: '',
        confirmDestructiveActions: true,
        compactMode: false,
      })
    ).toBe(false);
  });

  it('validates Project structure correctly', () => {
    const validProject: Project = {
      id: 'uuid-123',
      name: 'GameEngine',
      path: 'C:\\Projects\\GameEngine',
      createdAt: new Date().toISOString(),
    };

    expect(dummyStore.isValidProject(validProject)).toBe(true);
    expect(dummyStore.isValidProject({ id: '123' })).toBe(false);
    expect(dummyStore.isValidProject(null)).toBe(false);
    expect(dummyStore.isValidProject({ id: 123, name: 'invalid' })).toBe(false);
  });
});
