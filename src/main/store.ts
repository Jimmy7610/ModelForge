import fs from 'node:fs';
import path from 'node:path';
import { AppSettings, Project } from '../shared/types';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../shared/constants';

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

      if (!this.isValidSettings(parsed)) {
        console.warn('Corrupted or outdated settings detected. Migrating to defaults.');
        const restored = { ...DEFAULT_SETTINGS };
        this.saveSettings(restored);
        return restored;
      }

      return parsed;
    } catch (err) {
      console.error('Failed to load settings, recovering to default:', err);
      this.saveSettings(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS };
    }
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated: AppSettings = {
      ...current,
      ...partial,
      schemaVersion: SCHEMA_VERSION,
    };

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
    if (typeof s.modelDirectory !== 'string') return false;
    if (typeof s.confirmDestructiveActions !== 'boolean') return false;
    if (typeof s.compactMode !== 'boolean') return false;

    return true;
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
    const existingIndex = projects.findIndex((p) => p.path === project.path);
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
