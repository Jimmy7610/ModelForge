import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PersistenceStore } from '../src/main/store';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../src/shared/constants';
import { Project } from '../src/shared/types';

describe('PersistenceStore', () => {
  let tempDir: string;
  let store: PersistenceStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelforge-test-'));
    store = new PersistenceStore(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('initializes with default settings when file does not exist', () => {
    const settings = store.getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.schemaVersion).toBe(SCHEMA_VERSION);
    expect(settings.startupPage).toBe('builder');
  });

  it('persists and updates partial settings', () => {
    const updated = store.updateSettings({
      startupPage: 'home',
      modelDirectory: 'C:\\AI\\models',
      compactMode: true,
    });

    expect(updated.startupPage).toBe('home');
    expect(updated.modelDirectory).toBe('C:\\AI\\models');
    expect(updated.compactMode).toBe(true);
    expect(updated.confirmDestructiveActions).toBe(true);

    // Read fresh from disk
    const freshStore = new PersistenceStore(tempDir);
    const reloaded = freshStore.getSettings();
    expect(reloaded.startupPage).toBe('home');
    expect(reloaded.modelDirectory).toBe('C:\\AI\\models');
    expect(reloaded.compactMode).toBe(true);
  });

  it('recovers gracefully to defaults if settings file contains corrupted JSON', () => {
    const settingsFile = path.join(tempDir, 'modelforge-settings.json');
    fs.writeFileSync(settingsFile, '{ bad-json: !!! }', 'utf-8');

    const settings = store.getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('recovers gracefully to defaults if settings file has invalid schema', () => {
    const settingsFile = path.join(tempDir, 'modelforge-settings.json');
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({ schemaVersion: 0, startupPage: 'invalid-page-name' }),
      'utf-8'
    );

    const settings = store.getSettings();
    expect(settings.startupPage).toBe('builder');
  });

  it('persists, adds, and removes registered projects', () => {
    const project1: Project = {
      id: 'proj-1',
      name: 'AlphaApp',
      path: 'C:\\Projects\\AlphaApp',
      createdAt: '2026-09-06T12:00:00.000Z',
    };

    const project2: Project = {
      id: 'proj-2',
      name: 'BetaCore',
      path: 'C:\\Projects\\BetaCore',
      createdAt: '2026-09-06T13:00:00.000Z',
    };

    store.addProject(project1);
    store.addProject(project2);

    let projects = store.getProjects();
    expect(projects).toHaveLength(2);
    expect(projects[0].name).toBe('AlphaApp');
    expect(projects[1].name).toBe('BetaCore');

    // Remove proj-1
    store.removeProject('proj-1');
    projects = store.getProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe('proj-2');
  });

  it('recovers gracefully if projects file contains corrupted JSON', () => {
    const projectsFile = path.join(tempDir, 'modelforge-projects.json');
    fs.writeFileSync(projectsFile, 'CORRUPT DATA', 'utf-8');

    const projects = store.getProjects();
    expect(projects).toEqual([]);
  });
});
