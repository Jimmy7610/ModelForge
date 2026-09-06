import fs from 'node:fs';
import path from 'node:path';
import { AppSettings, Project } from '../shared/types';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../shared/constants';
import { normalizePath } from './models/scanner';

export class PersistenceStore {
  private dataDir: string;
  private settingsFile: string;
  private projectsFile: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.settingsFile = path.join(dataDir, 'modelforge-settings.json');
    this.projectsFile = path.join(dataDir, 'modelforge-projects.json');
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (err) {
        console.error('Failed to create storage directory:', err);
      }
    }
  }

  public getSettings(): AppSettings {
    try {
      if (!fs.existsSync(this.settingsFile)) {
        this.saveSettings(DEFAULT_SETTINGS);
        return { ...DEFAULT_SETTINGS };
      }

      const content = fs.readFileSync(this.settingsFile, 'utf-8');
      const parsed = JSON.parse(content);

      // Check if migration is needed (e.g. from v1 with modelDirectory)
      if (this.needsMigration(parsed)) {
        const migrated = this.migrateSettings(parsed);
        this.saveSettings(migrated);
        return migrated;
      }

      if (!this.isValidSettings(parsed)) {
        console.warn('Corrupted or outdated settings detected. Migrating to defaults.');
        const restored = { ...DEFAULT_SETTINGS };
        this.saveSettings(restored);
        return restored;
      }

      // Ensure modelDirectory alias is present
      parsed.modelDirectory = parsed.modelDirectories?.[0] || '';
      return parsed;
    } catch (err) {
      console.error('Failed to load settings, recovering to default:', err);
      this.saveSettings(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS };
    }
  }

  public needsMigration(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const s = obj as Record<string, unknown>;
    // v1 schema check: schemaVersion === 1 or single modelDirectory exists without modelDirectories array
    if (s.schemaVersion === 1) return true;
    if (typeof s.modelDirectory === 'string' && !Array.isArray(s.modelDirectories)) return true;
    return false;
  }

  public migrateSettings(old: Record<string, unknown>): AppSettings {
    const modelDirectories: string[] = [];

    if (Array.isArray(old.modelDirectories)) {
      for (const d of old.modelDirectories) {
        if (typeof d === 'string' && d.trim()) {
          modelDirectories.push(path.resolve(d.trim()));
        }
      }
    } else if (typeof old.modelDirectory === 'string' && old.modelDirectory.trim()) {
      modelDirectories.push(path.resolve(old.modelDirectory.trim()));
    }

    const validPages = [
      'home',
      'models',
      'model-lab',
      'teams',
      'projects',
      'builder',
      'terminal',
      'history',
      'settings',
    ];

    const startupPage =
      typeof old.startupPage === 'string' && validPages.includes(old.startupPage)
        ? (old.startupPage as AppSettings['startupPage'])
        : DEFAULT_SETTINGS.startupPage;

    const confirmDestructiveActions =
      typeof old.confirmDestructiveActions === 'boolean'
        ? old.confirmDestructiveActions
        : DEFAULT_SETTINGS.confirmDestructiveActions;

    const compactMode =
      typeof old.compactMode === 'boolean' ? old.compactMode : DEFAULT_SETTINGS.compactMode;

    const migrated: AppSettings = {
      schemaVersion: SCHEMA_VERSION,
      startupPage,
      modelDirectories,
      modelDirectory: modelDirectories[0] || '',
      confirmDestructiveActions,
      compactMode,
    };

    return migrated;
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated: AppSettings = {
      ...current,
      ...partial,
      schemaVersion: SCHEMA_VERSION,
    };

    if (updated.modelDirectories) {
      updated.modelDirectory = updated.modelDirectories[0] || '';
    }

    this.saveSettings(updated);
    return updated;
  }

  public saveSettings(settings: AppSettings): void {
    try {
      this.ensureDir();
      fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  public isValidSettings(obj: unknown): obj is AppSettings {
    if (!obj || typeof obj !== 'object') return false;
    const s = obj as Record<string, unknown>;

    const validPages = [
      'home',
      'models',
      'model-lab',
      'teams',
      'projects',
      'builder',
      'terminal',
      'history',
      'settings',
    ];

    if (typeof s.schemaVersion !== 'number' || s.schemaVersion < 1) return false;
    if (typeof s.startupPage !== 'string' || !validPages.includes(s.startupPage)) return false;
    if (!Array.isArray(s.modelDirectories)) return false;
    if (typeof s.confirmDestructiveActions !== 'boolean') return false;
    if (typeof s.compactMode !== 'boolean') return false;

    return true;
  }

  public addModelDirectory(dirPath: string): string[] {
    const settings = this.getSettings();
    const resolved = path.resolve(dirPath);
    const normalizedNew = normalizePath(resolved);

    const exists = settings.modelDirectories.some(
      (existing) => normalizePath(existing) === normalizedNew
    );

    if (!exists) {
      const updatedDirs = [...settings.modelDirectories, resolved];
      this.updateSettings({ modelDirectories: updatedDirs });
      return updatedDirs;
    }

    return settings.modelDirectories;
  }

  public removeModelDirectory(dirPath: string): string[] {
    const settings = this.getSettings();
    const normalizedTarget = normalizePath(dirPath);

    const filtered = settings.modelDirectories.filter(
      (existing) => normalizePath(existing) !== normalizedTarget
    );

    this.updateSettings({ modelDirectories: filtered });
    return filtered;
  }

  public getProjects(): Project[] {
    try {
      if (!fs.existsSync(this.projectsFile)) {
        return [];
      }

      const content = fs.readFileSync(this.projectsFile, 'utf-8');
      const parsed = JSON.parse(content);

      if (!Array.isArray(parsed)) {
        console.warn('Corrupted projects file detected, resetting.');
        this.saveProjects([]);
        return [];
      }

      return parsed.filter((item): item is Project => this.isValidProject(item));
    } catch (err) {
      console.error('Failed to load projects:', err);
      return [];
    }
  }

  public addProject(project: Project): Project[] {
    const projects = this.getProjects();
    const existingIndex = projects.findIndex((p) => normalizePath(p.path) === normalizePath(project.path));
    if (existingIndex >= 0) {
      projects[existingIndex] = project;
    } else {
      projects.push(project);
    }
    this.saveProjects(projects);
    return projects;
  }

  public removeProject(id: string): Project[] {
    const projects = this.getProjects().filter((p) => p.id !== id);
    this.saveProjects(projects);
    return projects;
  }

  public saveProjects(projects: Project[]): void {
    try {
      this.ensureDir();
      fs.writeFileSync(this.projectsFile, JSON.stringify(projects, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save projects:', err);
    }
  }

  public isValidProject(obj: unknown): obj is Project {
    if (!obj || typeof obj !== 'object') return false;
    const p = obj as Record<string, unknown>;
    return (
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.path === 'string' &&
      typeof p.createdAt === 'string'
    );
  }
}
