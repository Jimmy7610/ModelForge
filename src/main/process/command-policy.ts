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
 * Script categories permitted for Agent mode in v0.6.0.
 * Human manual Terminal may additionally execute 'dev', 'start', 'serve', 'preview', etc.
 */
export const AGENT_ALLOWED_SCRIPT_CATEGORIES = new Set<DiscoveredScriptInfo['category']>([
  'test',
  'build',
  'lint',
  'typecheck',
]);

/**
 * Stricter forbidden command patterns enforced specifically when initiated by the Agent (Fix 4).
 * Prevents model from using process wrappers, downloaders, package runners, or inline code evaluators.
 */
const AGENT_FORBIDDEN_COMMAND_PATTERNS = [
  // Shells and execution environments
  /\b(powershell|powershell\.exe|cmd|cmd\.exe|bash|sh|zsh|wsl)\b/i,
  // Remote access & network fetching
  /\b(ssh|curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b/i,
  // Package runners
  /\b(npx|bunx)\b/i,
  /\b(npm\s+exec|pnpm\s+dlx|yarn\s+dlx)\b/i,
  // Inline code execution flags
  /\bnode(\.exe)?\s+(-e|--eval)\b/i,
  /\b(python|python3|py)(\.exe)?\s+-c\b/i,
  // Package mutations
  /\b(npm|pnpm|yarn|bun)\s+(install|i|add|update|upgrade)\b/i,
  // Git mutations
  /\bgit\s+(commit|checkout|reset|push|merge|rebase|tag|branch\s+-[dD])\b/i,
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
   * Strict Agent script-name authorization (security boundary).
   *
   * Returns the permitted Agent category for the given script name, or null
   * if the name does not match any canonical allowed form.
   *
   * Allowed forms:
   *   test                 build                lint                 typecheck
   *   test:<suffix>        build:<suffix>       lint:<suffix>        typecheck:<suffix>
   *
   * NOTE: categorizeScript() uses fuzzy substring matching for UI display purposes
   * only. THIS function is the sole security gate for Agent execution — it uses
   * strict exact-match and explicit-prefix-colon matching to prevent names like
   * "deploy:test", "dangerous-test", or "contest" from being treated as safe.
   */
  public static getAgentScriptCategory(
    scriptName: string
  ): 'test' | 'build' | 'lint' | 'typecheck' | null {
    const lower = scriptName.toLowerCase().trim();
    const PREFIXES: ReadonlyArray<'test' | 'build' | 'lint' | 'typecheck'> = [
      'typecheck', // check before 'test' to prevent 'typecheck' matching 'test' prefix
      'test',
      'build',
      'lint',
    ];
    for (const prefix of PREFIXES) {
      if (lower === prefix || lower.startsWith(`${prefix}:`)) {
        return prefix;
      }
    }
    return null;
  }

  /**
   * Asserts that a script name is permitted for Agent execution in v0.6.0.
   * Uses strict getAgentScriptCategory() — NOT the fuzzy categorizeScript() heuristic.
   * Only canonical forms (test, test:<suffix>, build, build:<suffix>,
   * lint, lint:<suffix>, typecheck, typecheck:<suffix>) are permitted.
   */
  public static assertAllowedAgentScriptCategory(scriptName: string): void {
    const category = this.getAgentScriptCategory(scriptName);
    if (category === null) {
      throw new CommandPolicyError(
        'This script category is not available to Agent mode in v0.6.0. The user may run eligible scripts manually from Terminal.'
      );
    }
  }

  /**
   * Asserts that a script command does not violate Agent-specific restrictions (Fix 4).
   * Blocks shells, downloaders, package runners (npx/bunx), and inline code eval flags.
   */
  public static assertSafeAgentScriptCommand(command: string): void {
    if (typeof command !== 'string' || !command.trim()) {
      throw new CommandPolicyError('Script command must be a non-empty string');
    }
    // Must satisfy global policies first
    this.assertSafeScriptCommand(command);

    // Then satisfy agent-specific policies
    for (const pattern of AGENT_FORBIDDEN_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        throw new CommandPolicyError(
          `Command violates Model Forge Agent security policy: "${command}"`
        );
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
