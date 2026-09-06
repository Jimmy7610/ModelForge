import fs from 'node:fs';
import path from 'node:path';
import { WorkspaceGuard } from './guard';
import { ProjectProfile } from './types';
import { isIgnoredDirectory } from './file-policy';

export class ProjectProfiler {
  /**
   * Profiles a workspace directory and returns its project intelligence summary.
   */
  public static profile(guardOrPath: WorkspaceGuard | string): ProjectProfile {
    const guard = typeof guardOrPath === 'string' ? new WorkspaceGuard(guardOrPath) : guardOrPath;
    const root = guard.canonicalRootPath;

    let projectName = path.basename(root);
    const isGit = fs.existsSync(path.join(root, '.git'));
    let packageManager: string | null = null;
    const frameworkHintsSet = new Set<string>();
    const languagesSet = new Set<string>();
    const keyFiles: string[] = [];
    const topLevelDirectories: string[] = [];
    let scripts: Record<string, string> | undefined;
    let dependencies: string[] | undefined;
    let devDependencies: string[] | undefined;

    // Detect package managers from lock files
    if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    } else if (fs.existsSync(path.join(root, 'yarn.lock'))) {
      packageManager = 'yarn';
    } else if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) {
      packageManager = 'bun';
    } else if (fs.existsSync(path.join(root, 'package-lock.json'))) {
      packageManager = 'npm';
    } else if (fs.existsSync(path.join(root, 'Cargo.lock')) || fs.existsSync(path.join(root, 'Cargo.toml'))) {
      packageManager = 'cargo';
    } else if (fs.existsSync(path.join(root, 'poetry.lock')) || fs.existsSync(path.join(root, 'pyproject.toml'))) {
      packageManager = 'poetry';
    } else if (fs.existsSync(path.join(root, 'go.mod'))) {
      packageManager = 'go';
    } else if (fs.existsSync(path.join(root, 'package.json'))) {
      packageManager = 'npm';
    }

    // Inspect package.json if present
    const packageJsonPath = path.join(root, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      keyFiles.push('package.json');
      try {
        const content = fs.readFileSync(packageJsonPath, 'utf8');
        const pkg = JSON.parse(content);
        if (typeof pkg.name === 'string' && pkg.name.trim()) {
          projectName = pkg.name.trim();
        }

        const allDeps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
          ...(pkg.peerDependencies || {}),
        };

        if (pkg.scripts && typeof pkg.scripts === 'object') {
          scripts = pkg.scripts;
        }

        if (pkg.dependencies && typeof pkg.dependencies === 'object') {
          dependencies = Object.keys(pkg.dependencies);
        }

        if (pkg.devDependencies && typeof pkg.devDependencies === 'object') {
          devDependencies = Object.keys(pkg.devDependencies);
        }

        // Framework and library hints
        if (allDeps['react'] || allDeps['react-dom']) frameworkHintsSet.add('React');
        if (allDeps['next']) frameworkHintsSet.add('Next.js');
        if (allDeps['vue']) frameworkHintsSet.add('Vue');
        if (allDeps['svelte']) frameworkHintsSet.add('Svelte');
        if (allDeps['@angular/core']) frameworkHintsSet.add('Angular');
        if (allDeps['vite']) frameworkHintsSet.add('Vite');
        if (allDeps['electron']) frameworkHintsSet.add('Electron');
        if (allDeps['express']) frameworkHintsSet.add('Express');
        if (allDeps['@nestjs/core']) frameworkHintsSet.add('NestJS');
        if (allDeps['tailwindcss']) frameworkHintsSet.add('Tailwind CSS');
        if (allDeps['vitest']) frameworkHintsSet.add('Vitest');
        if (allDeps['jest']) frameworkHintsSet.add('Jest');
        if (allDeps['typescript']) languagesSet.add('TypeScript');
      } catch {
        // Ignore JSON parse errors in project analysis
      }
    }

    // Known configuration files to watch for
    const candidateConfigFiles = [
      'tsconfig.json',
      'jsconfig.json',
      'README.md',
      'readme.md',
      'vite.config.ts',
      'vite.config.js',
      'next.config.js',
      'next.config.mjs',
      'tailwind.config.js',
      'tailwind.config.ts',
      'Cargo.toml',
      'pyproject.toml',
      'requirements.txt',
      'go.mod',
      'Dockerfile',
      'Makefile',
    ];

    for (const candidate of candidateConfigFiles) {
      if (fs.existsSync(path.join(root, candidate)) && !keyFiles.includes(candidate)) {
        keyFiles.push(candidate);
      }
    }

    // Scan top-level and first-level directories for language detection
    try {
      const topEntries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of topEntries) {
        if (entry.isDirectory()) {
          if (!isIgnoredDirectory(entry.name)) {
            topLevelDirectories.push(entry.name);
            // Shallow scan inside directory
            try {
              const subPath = path.join(root, entry.name);
              const subEntries = fs.readdirSync(subPath, { withFileTypes: true });
              for (const sub of subEntries) {
                if (sub.isFile()) {
                  this.detectLanguageFromFilename(sub.name, languagesSet);
                }
              }
            } catch {
              // Ignore read errors
            }
          }
        } else if (entry.isFile()) {
          this.detectLanguageFromFilename(entry.name, languagesSet);
        }
      }
    } catch {
      // Ignore top-level read errors
    }

    // Fallback if no languages were detected from extensions
    if (languagesSet.size === 0) {
      if (packageManager === 'cargo') languagesSet.add('Rust');
      else if (packageManager === 'poetry' || packageManager === 'pip') languagesSet.add('Python');
      else if (packageManager === 'go') languagesSet.add('Go');
      else if (packageManager) languagesSet.add('JavaScript');
    }

    return {
      name: projectName,
      rootPath: guard.rootPath,
      canonicalRootPath: root,
      isGitRepository: isGit,
      packageManager,
      languages: Array.from(languagesSet),
      frameworkHints: Array.from(frameworkHintsSet),
      keyFiles,
      topLevelDirectories,
      scripts,
      dependencies,
      devDependencies,
    };
  }

  private static detectLanguageFromFilename(fileName: string, langSet: Set<string>): void {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
      case '.mts':
      case '.cts':
        langSet.add('TypeScript');
        break;
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        langSet.add('JavaScript');
        break;
      case '.py':
      case '.pyw':
        langSet.add('Python');
        break;
      case '.rs':
        langSet.add('Rust');
        break;
      case '.go':
        langSet.add('Go');
        break;
      case '.c':
      case '.h':
      case '.cpp':
      case '.hpp':
      case '.cc':
        langSet.add('C/C++');
        break;
      case '.html':
      case '.css':
      case '.scss':
        langSet.add('HTML/CSS');
        break;
      case '.java':
        langSet.add('Java');
        break;
      case '.cs':
        langSet.add('C#');
        break;
      case '.rb':
        langSet.add('Ruby');
        break;
      case '.php':
        langSet.add('PHP');
        break;
    }
  }
}
