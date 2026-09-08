import { CommandPolicyError } from './errors';
import { DiscoveredScriptInfo } from './types';

/**
 * Forbidden characters in script names to prevent any shell injection or path traversal attempt.
 */
const FORBIDDEN_SCRIPT_CHARS_REGEX = /[&;|<>`$\r\n\0\\/'"]|\.\./;

/**
 * Forbidden command patterns in scripts to prevent package installation, Git mutation, or raw shells.
 */
const FORBIDDEN_COMMAND_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(install|i|add|update|upgrade)\b/i,
  /\bgit\s+(commit|checkout|reset|push|merge|rebase|tag|branch\s+-[dD])\b/i,
  /\b(powershell|powershell\.exe|cmd|cmd\.exe|bash|sh|zsh)\b/i,
];

/**
 * Secret environment variable patterns that must be filtered from child processes.
 */
const SECRET_ENV_PATTERN = /(TOKEN|SECRET|API_KEY|PASSWORD|PRIVATE_KEY|AUTH)/i;

/**
 * Essential Windows / POSIX environment keys allowed to pass through to child processes.
 */
const ALLOWED_ENV_PREFIXES = [
  'PATH',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'COMSPEC',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'HOMEDRIVE',
  'HOMEPATH',
  'ALLUSERSPROFILE',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'COMMONPROGRAMFILES',
  'NODE_ENV',
  'LANG',
  'LC_',
  'TERM',
  'HOME',
  'SHELL',
];

export class CommandPolicy {
  /**
   * Validates script name against forbidden characters and shell injection patterns.
   */
  public static validateScriptName(scriptName: unknown): string {
    if (typeof scriptName !== 'string' || !scriptName.trim()) {
      throw new CommandPolicyError('Script name must be a non-empty string');
    }
    const trimmed = scriptName.trim();
    if (trimmed.length > 100) {
      throw new CommandPolicyError('Script name exceeds maximum allowed length of 100 characters');
    }
    if (FORBIDDEN_SCRIPT_CHARS_REGEX.test(trimmed)) {
      throw new CommandPolicyError(`Invalid characters or traversal detected in script name: "${trimmed}"`);
    }
    return trimmed;
  }

  /**
   * Asserts that a script command string does not violate safety policies
   * (no package installs, no git mutations, no raw shells).
   */
  public static assertSafeScriptCommand(command: string): void {
    if (typeof command !== 'string' || !command.trim()) {
      throw new CommandPolicyError('Script command must be a non-empty string');
    }
    for (const pattern of FORBIDDEN_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        throw new CommandPolicyError(`Command violates Model Forge security policy: "${command}"`);
      }
    }
  }

  /**
   * Categorizes a script by name.
   */
  public static categorizeScript(name: string): DiscoveredScriptInfo['category'] {
    const lower = name.toLowerCase();
    if (lower.includes('typecheck') || lower.includes('tsc')) return 'typecheck';
    if (lower.includes('test') || lower.includes('check') || lower.includes('coverage')) return 'test';
    if (lower.includes('build') || lower.includes('bundle') || lower.includes('compile')) return 'build';
    if (lower.includes('lint') || lower.includes('format') || lower.includes('prettier')) return 'lint';
    if (lower === 'dev' || lower.includes('dev:') || lower.includes('watch')) return 'dev';
    if (lower === 'start' || lower === 'serve' || lower === 'preview') return 'start';
    return 'other';
  }

  /**
   * Determines whether a script is intended to be persistent (e.g. dev server) or bounded batch.
   */
  public static isPersistentScript(name: string): boolean {
    const cat = this.categorizeScript(name);
    return cat === 'dev' || cat === 'start';
  }

  /**
   * Resolves timeout in milliseconds for the given script.
   * Default for batch scripts is 5 minutes (300,000 ms).
   * Persistent scripts return 0 (no automatic timeout; runs until user/agent stops).
   */
  public static resolveTimeoutMs(scriptName: string): number {
    if (this.isPersistentScript(scriptName)) {
      return 0;
    }
    return 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Builds a safe, controlled environment for child process execution.
   * Preserves necessary Windows tooling variables while strictly stripping secrets, API keys, and tokens.
   */
  public static buildControlledEnvironment(extraEnv?: Record<string, string>): NodeJS.ProcessEnv {
    const safeEnv: NodeJS.ProcessEnv = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue;

      // 1. Never pass secrets, API keys, or tokens
      if (SECRET_ENV_PATTERN.test(key)) {
        continue;
      }

      // 2. Allow essential system and user tooling variables
      const upper = key.toUpperCase();
      const isAllowed = ALLOWED_ENV_PREFIXES.some((prefix) => upper === prefix || upper.startsWith(prefix));

      if (isAllowed) {
        safeEnv[key] = value;
      }
    }

    // Merge any explicitly provided extra variables, ensuring they also do not contain secrets
    if (extraEnv) {
      for (const [k, v] of Object.entries(extraEnv)) {
        if (!SECRET_ENV_PATTERN.test(k)) {
          safeEnv[k] = v;
        }
      }
    }

    return safeEnv;
  }
}
