import fs from 'node:fs';
import path from 'node:path';
import { CommandPolicyError } from './errors';
import { CommandPolicy } from './command-policy';
import { PackageManagerType, DiscoveredScriptInfo } from './types';

export interface ResolvedScriptInvocation {
  packageManager: PackageManagerType;
  executable: string;
  args: string[];
  cwd: string;
  scriptCommand: string;
}

export class ExecutableResolver {
  /**
   * Detects package manager for a project directory based on packageManager field or lockfiles.
   */
  public static detectPackageManager(projectDir: string): PackageManagerType {
    const pkgJsonPath = path.join(projectDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const rawContent = fs.readFileSync(pkgJsonPath, 'utf8');
        const content = rawContent.charCodeAt(0) === 0xFEFF ? rawContent.slice(1) : rawContent;
        const pkg = JSON.parse(content);
        if (typeof pkg.packageManager === 'string' && pkg.packageManager.trim()) {
          const lower = pkg.packageManager.toLowerCase();
          if (lower.startsWith('pnpm')) return 'pnpm';
          if (lower.startsWith('yarn')) return 'yarn';
          if (lower.startsWith('bun')) return 'bun';
          if (lower.startsWith('npm')) return 'npm';
        }
      } catch {
        // Fall through to lockfile detection
      }
    }

    if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) {
      return 'yarn';
    }
    if (fs.existsSync(path.join(projectDir, 'bun.lock')) || fs.existsSync(path.join(projectDir, 'bun.lockb'))) {
      return 'bun';
    }
    if (fs.existsSync(path.join(projectDir, 'package-lock.json'))) {
      return 'npm';
    }

    return 'npm';
  }

  /**
   * Reads package.json scripts from the project root and categorizes them.
   */
  public static discoverScripts(projectDir: string): {
    packageManager: PackageManagerType;
    scripts: DiscoveredScriptInfo[];
  } {
    const pm = this.detectPackageManager(projectDir);
    const pkgJsonPath = path.join(projectDir, 'package.json');

    if (!fs.existsSync(pkgJsonPath)) {
      return { packageManager: pm, scripts: [] };
    }

    try {
      const rawContent = fs.readFileSync(pkgJsonPath, 'utf8');
      const content = rawContent.charCodeAt(0) === 0xFEFF ? rawContent.slice(1) : rawContent;
      const pkg = JSON.parse(content);
      if (!pkg.scripts || typeof pkg.scripts !== 'object') {
        return { packageManager: pm, scripts: [] };
      }

      const scripts: DiscoveredScriptInfo[] = Object.entries(pkg.scripts)
        .filter(([name, cmd]) => typeof name === 'string' && typeof cmd === 'string')
        .map(([name, cmd]) => ({
          name,
          command: String(cmd),
          category: CommandPolicy.categorizeScript(name),
          isPersistent: CommandPolicy.isPersistentScript(name),
        }));

      return { packageManager: pm, scripts };
    } catch {
      return { packageManager: pm, scripts: [] };
    }
  }

  /**
   * Resolves the exact executable name on the host OS.
   * On Windows, batch commands like npm, pnpm, yarn require npm.cmd etc. when shell: false.
   */
  public static resolveExecutableName(pm: PackageManagerType): string {
    if (process.platform === 'win32') {
      switch (pm) {
        case 'npm':
          return 'npm.cmd';
        case 'pnpm':
          return 'pnpm.cmd';
        case 'yarn':
          return 'yarn.cmd';
        case 'bun':
          return 'bun.exe';
      }
    }
    return pm;
  }

  /**
   * Resolves the immutable execution parameters for a given package script.
   */
  public static resolveScriptInvocation(
    projectDir: string,
    rawScriptName: string,
    initiator: 'agent' | 'manual' = 'manual'
  ): ResolvedScriptInvocation {
    const scriptName = CommandPolicy.validateScriptName(rawScriptName);
    const canonicalCwd = path.resolve(projectDir);

    const { packageManager, scripts } = this.discoverScripts(canonicalCwd);
    const targetScript = scripts.find((s) => s.name === scriptName);

    if (!targetScript) {
      throw new CommandPolicyError(
        `Script "${scriptName}" is not defined in package.json for project at "${canonicalCwd}"`
      );
    }

    // Enforce global safety policy against dependency install, Git mutation, or raw shell patterns
    CommandPolicy.assertSafeScriptCommand(targetScript.command);

    // Enforce stricter category and command content restrictions when initiated by Agent
    if (initiator === 'agent') {
      CommandPolicy.assertAllowedAgentScriptCategory(scriptName);
      CommandPolicy.assertSafeAgentScriptCommand(targetScript.command);
    }

    const executable = this.resolveExecutableName(packageManager);
    const args = ['run', scriptName];

    return {
      packageManager,
      executable,
      args,
      cwd: canonicalCwd,
      scriptCommand: targetScript.command,
    };
  }

  private static cachedNodePath?: string;
  private static cachedCliPaths: Map<string, string> = new Map();

  public static findNodeExecutable(): string {
    if (this.cachedNodePath && fs.existsSync(this.cachedNodePath)) {
      return this.cachedNodePath;
    }

    if (
      process.execPath &&
      (process.execPath.toLowerCase().endsWith('node.exe') ||
        process.execPath.toLowerCase().endsWith('node'))
    ) {
      this.cachedNodePath = process.execPath;
      return process.execPath;
    }

    const adjacent = path.join(path.dirname(process.execPath), 'node.exe');
    if (fs.existsSync(adjacent)) {
      this.cachedNodePath = adjacent;
      return adjacent;
    }

    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of pathDirs) {
      const candidate = path.join(dir, 'node.exe');
      if (fs.existsSync(candidate)) {
        this.cachedNodePath = candidate;
        return candidate;
      }
    }

    const commonNode = 'C:\\Program Files\\nodejs\\node.exe';
    if (fs.existsSync(commonNode)) {
      this.cachedNodePath = commonNode;
      return commonNode;
    }

    return 'node.exe';
  }

  public static findPackageCliPath(pm: PackageManagerType): string | null {
    if (this.cachedCliPaths.has(pm)) {
      return this.cachedCliPaths.get(pm)!;
    }

    const nodeExe = this.findNodeExecutable();
    const nodeDir = path.dirname(nodeExe);

    if (pm === 'npm') {
      const candidates = [
        path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
        path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          this.cachedCliPaths.set(pm, cand);
          return cand;
        }
      }
    } else if (pm === 'pnpm') {
      const candidates = [
        path.join(nodeDir, 'node_modules', 'corepack', 'dist', 'pnpm.js'),
        'C:\\Program Files\\nodejs\\node_modules\\corepack\\dist\\pnpm.js',
        path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          this.cachedCliPaths.set(pm, cand);
          return cand;
        }
      }
    } else if (pm === 'yarn') {
      const candidates = [
        path.join(nodeDir, 'node_modules', 'corepack', 'dist', 'yarn.js'),
        'C:\\Program Files\\nodejs\\node_modules\\corepack\\dist\\yarn.js',
        path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'yarn', 'bin', 'yarn.js'),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          this.cachedCliPaths.set(pm, cand);
          return cand;
        }
      }
    }

    return null;
  }

  /**
   * Resolves execution parameters to a native executable with shell: false.
   * On Windows, .cmd batch wrappers (npm.cmd, pnpm.cmd, yarn.cmd) throw EINVAL
   * when spawned with shell: false. This resolves them directly to node.exe with
   * the corresponding CLI script, eliminating shell wrappers while strictly
   * adhering to shell: false.
   */
  public static resolveNativeInvocation(
    executable: string,
    args: string[]
  ): { executable: string; args: string[] } {
    if (process.platform === 'win32') {
      const lower = executable.toLowerCase();
      if (lower.includes('npm')) {
        const cli = this.findPackageCliPath('npm');
        if (cli) {
          return { executable: this.findNodeExecutable(), args: [cli, ...args] };
        }
      } else if (lower.includes('pnpm')) {
        const cli = this.findPackageCliPath('pnpm');
        if (cli) {
          return { executable: this.findNodeExecutable(), args: [cli, ...args] };
        }
      } else if (lower.includes('yarn')) {
        const cli = this.findPackageCliPath('yarn');
        if (cli) {
          return { executable: this.findNodeExecutable(), args: [cli, ...args] };
        }
      }
    }

    return { executable, args };
  }
}
