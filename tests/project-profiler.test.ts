import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProjectProfiler } from '../src/main/workspace/project-profiler';
import { WorkspaceGuard } from '../src/main/workspace/guard';

describe('ProjectProfiler', () => {
  let tempProject: string;

  beforeEach(() => {
    tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-profile-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempProject, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('profiles a Node/React/Vite project with npm', () => {
    fs.mkdirSync(path.join(tempProject, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempProject, '.git'), { recursive: true });
    fs.writeFileSync(path.join(tempProject, 'package-lock.json'), '{}', 'utf8');
    fs.writeFileSync(
      path.join(tempProject, 'package.json'),
      JSON.stringify({
        name: 'super-forge',
        scripts: { dev: 'vite', build: 'tsc && vite build' },
        dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
        devDependencies: { vite: '^5.0.0', typescript: '^5.0.0', tailwindcss: '^3.0.0' },
      }),
      'utf8'
    );
    fs.writeFileSync(path.join(tempProject, 'src', 'App.tsx'), 'export const App = () => null;', 'utf8');
    fs.writeFileSync(path.join(tempProject, 'src', 'main.ts'), 'console.log("init");', 'utf8');
    fs.writeFileSync(path.join(tempProject, 'vite.config.ts'), 'export default {};', 'utf8');

    const guard = new WorkspaceGuard(tempProject);
    const profile = ProjectProfiler.profile(guard);

    expect(profile.name).toBe('super-forge');
    expect(profile.isGitRepository).toBe(true);
    expect(profile.packageManager).toBe('npm');
    expect(profile.languages).toContain('TypeScript');
    expect(profile.frameworkHints).toContain('React');
    expect(profile.frameworkHints).toContain('Vite');
    expect(profile.frameworkHints).toContain('Tailwind CSS');
    expect(profile.keyFiles).toContain('package.json');
    expect(profile.keyFiles).toContain('vite.config.ts');
    expect(profile.topLevelDirectories).toContain('src');
    expect(profile.scripts).toBeDefined();
    expect(profile.scripts?.dev).toBe('vite');
  });

  it('profiles a Rust project with Cargo', () => {
    fs.writeFileSync(path.join(tempProject, 'Cargo.toml'), '[package]\nname = "my_rust_app"', 'utf8');
    fs.writeFileSync(path.join(tempProject, 'Cargo.lock'), '', 'utf8');
    fs.mkdirSync(path.join(tempProject, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempProject, 'src', 'main.rs'), 'fn main() {}', 'utf8');

    const profile = ProjectProfiler.profile(tempProject);

    expect(profile.packageManager).toBe('cargo');
    expect(profile.languages).toContain('Rust');
    expect(profile.keyFiles).toContain('Cargo.toml');
  });

  it('profiles a Python project with poetry', () => {
    fs.writeFileSync(path.join(tempProject, 'pyproject.toml'), '[tool.poetry]\nname = "ai_tool"', 'utf8');
    fs.writeFileSync(path.join(tempProject, 'poetry.lock'), '', 'utf8');
    fs.writeFileSync(path.join(tempProject, 'app.py'), 'print("hello")', 'utf8');

    const profile = ProjectProfiler.profile(tempProject);

    expect(profile.packageManager).toBe('poetry');
    expect(profile.languages).toContain('Python');
    expect(profile.keyFiles).toContain('pyproject.toml');
  });
});
