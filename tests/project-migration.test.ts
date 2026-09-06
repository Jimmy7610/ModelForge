import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PersistenceStore } from '../src/main/store';

describe('Project Persistence, Schema Migration & Active Project Tracking', () => {
  let tempDir: string;
  let store: PersistenceStore;
  let dummyProjectFolder: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-proj-store-'));
    dummyProjectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-dummy-proj-'));

    // Create realistic files in dummy folder
    fs.mkdirSync(path.join(dummyProjectFolder, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(dummyProjectFolder, 'package.json'),
      JSON.stringify({ name: 'migrated-sample', dependencies: { react: '^18.0.0' } }),
      'utf8'
    );

    store = new PersistenceStore(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(dummyProjectFolder, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('migrates legacy projects with shape { id, name, path, createdAt } to upgraded schema', () => {
    const projectsFile = path.join(tempDir, 'modelforge-projects.json');
    const legacyProjects = [
      {
        id: 'legacy-proj-1',
        name: 'Legacy Alpha',
        path: dummyProjectFolder,
        createdAt: '2026-09-06T10:00:00.000Z',
      },
    ];

    fs.writeFileSync(projectsFile, JSON.stringify(legacyProjects, null, 2), 'utf8');

    // Reload projects via store
    const loaded = store.getProjects();
    expect(loaded).toHaveLength(1);

    const migrated = loaded[0];
    expect(migrated.id).toBe('legacy-proj-1');
    expect(migrated.name).toBe('Legacy Alpha');
    expect(migrated.path).toBe(path.resolve(dummyProjectFolder));
    expect(migrated.rootPath).toBe(path.resolve(dummyProjectFolder));
    expect(migrated.canonicalRootPath).toBeDefined();
    expect(migrated.isGitRepository).toBe(true);
    expect(migrated.frameworkHints).toContain('React');
    expect(migrated.lastOpenedAt).toBeDefined();

    // Verify migrated data was persisted to disk
    const onDisk = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
    expect(onDisk[0].canonicalRootPath).toBeDefined();
    expect(onDisk[0].frameworkHints).toContain('React');
  });

  it('tracks exactly ONE active project across operations', () => {
    store.addProject({
      id: 'proj-a',
      name: 'Project A',
      path: dummyProjectFolder,
    });

    // First added project automatically becomes active
    expect(store.getActiveProjectId()).toBe('proj-a');

    store.addProject({
      id: 'proj-b',
      name: 'Project B',
      path: tempDir,
    });

    // Explicitly switch active project
    store.setActiveProjectId('proj-b');
    expect(store.getActiveProjectId()).toBe('proj-b');

    // Removing active project automatically switches to remaining project
    store.removeProject('proj-b');
    expect(store.getActiveProjectId()).toBe('proj-a');
  });

  it('proves non-destructive project removal: removing project NEVER deletes files on disk', () => {
    const testFilePath = path.join(dummyProjectFolder, 'important-code.ts');
    fs.writeFileSync(testFilePath, 'const value = 42;', 'utf8');

    store.addProject({
      id: 'proj-safe',
      name: 'Safe Project',
      path: dummyProjectFolder,
    });

    expect(store.getProjects().some((p) => p.id === 'proj-safe')).toBe(true);

    // Remove from store
    store.removeProject('proj-safe');

    // Verify removed from registry
    expect(store.getProjects().some((p) => p.id === 'proj-safe')).toBe(false);

    // PROOF: Files on disk still exist untouched!
    expect(fs.existsSync(dummyProjectFolder)).toBe(true);
    expect(fs.existsSync(testFilePath)).toBe(true);
    expect(fs.readFileSync(testFilePath, 'utf8')).toBe('const value = 42;');
  });
});
