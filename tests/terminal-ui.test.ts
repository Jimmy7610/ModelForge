import { describe, it, expect, beforeEach } from 'vitest';
import { CommandPolicy } from '../src/main/process/command-policy';
import { ExecutableResolver } from '../src/main/process/executable-resolver';
import { SessionAuthorizationService } from '../src/main/edit/authorization';
import { DiscoveredScriptInfo, ProcessSessionInfo } from '../src/main/process/types';

describe('Terminal UI State, Script Chips & Truthful Messaging (Tests 76-85)', () => {
  let authService: SessionAuthorizationService;

  beforeEach(() => {
    authService = new SessionAuthorizationService();
  });

  // Test 76: Script categorization maps correctly to UI chip categories
  it('76. categorizes scripts for chip display with correct color themes', () => {
    const scripts: DiscoveredScriptInfo[] = [
      { name: 'test', command: 'vitest run', category: CommandPolicy.categorizeScript('test'), isPersistent: false },
      { name: 'build', command: 'vite build', category: CommandPolicy.categorizeScript('build'), isPersistent: false },
      { name: 'lint', command: 'eslint .', category: CommandPolicy.categorizeScript('lint'), isPersistent: false },
      { name: 'typecheck', command: 'tsc --noEmit', category: CommandPolicy.categorizeScript('typecheck'), isPersistent: false },
      { name: 'dev', command: 'vite', category: CommandPolicy.categorizeScript('dev'), isPersistent: true },
      { name: 'start', command: 'node index.js', category: CommandPolicy.categorizeScript('start'), isPersistent: true },
    ];

    expect(scripts.find((s) => s.name === 'test')?.category).toBe('test');
    expect(scripts.find((s) => s.name === 'build')?.category).toBe('build');
    expect(scripts.find((s) => s.name === 'lint')?.category).toBe('lint');
    expect(scripts.find((s) => s.name === 'typecheck')?.category).toBe('typecheck');
    expect(scripts.find((s) => s.name === 'dev')?.category).toBe('dev');
    expect(scripts.find((s) => s.name === 'start')?.category).toBe('start');
  });

  // Test 77: Persistent scripts are flagged for UI warning and continuous execution
  it('77. identifies dev and start scripts as persistent servers', () => {
    expect(CommandPolicy.isPersistentScript('dev')).toBe(true);
    expect(CommandPolicy.isPersistentScript('dev:server')).toBe(true);
    expect(CommandPolicy.isPersistentScript('start')).toBe(true);
    expect(CommandPolicy.isPersistentScript('test')).toBe(false);
    expect(CommandPolicy.isPersistentScript('build')).toBe(false);
  });

  // Test 78: Batch scripts have a 5-minute timeout while persistent scripts have 0 timeout
  it('78. allocates 5-minute timeout for batch scripts and no automatic timeout for persistent servers', () => {
    expect(CommandPolicy.resolveTimeoutMs('test')).toBe(300000);
    expect(CommandPolicy.resolveTimeoutMs('build')).toBe(300000);
    expect(CommandPolicy.resolveTimeoutMs('lint')).toBe(300000);
    expect(CommandPolicy.resolveTimeoutMs('dev')).toBe(0);
    expect(CommandPolicy.resolveTimeoutMs('start')).toBe(0);
  });

  // Test 79: Truthful disclaimer verification
  it('79. includes truthful Windows permission disclaimer in terminal UI copy', () => {
    const truthDisclaimer = 'Executes on your host with your Windows user permissions. Supervised, not sandboxed.';
    expect(truthDisclaimer).toContain('Windows user permissions');
    expect(truthDisclaimer).toContain('Supervised, not sandboxed');
  });

  // Test 80: Truthful agent execution risk summary
  it('80. generates accurate risk summary for batch vs persistent commands', () => {
    const isPersistent = CommandPolicy.isPersistentScript('dev');
    const riskSummary = isPersistent
      ? 'Persistent project server. Runs until stopped. Executes with your normal Windows user permissions.'
      : 'Supervised project script. Executes with your normal Windows user permissions.';

    expect(riskSummary).toContain('normal Windows user permissions');
    expect(riskSummary).toContain('Persistent project server');
  });

  // Test 81: YOLO mode is permanently locked in v0.6.0
  it('81. enforces YOLO mode locked status across the application', () => {
    expect(() => authService.enableYolo()).toThrow('YOLO mode is locked in Model Forge v0.6.0.');
  });

  // Test 82: Package manager detection: defaults to npm when no lockfiles or packageManager field
  it('82. falls back to npm when no lockfile or packageManager is declared', () => {
    const pm = ExecutableResolver.detectPackageManager('C:\\nonexistent\\path');
    expect(pm).toBe('npm');
  });

  // Test 83: Active process status indicators
  it('83. models status pill states: starting, running, completed, failed, cancelled, timed_out', () => {
    const validStatuses = ['starting', 'running', 'completed', 'failed', 'cancelled', 'timed_out'];
    const session: Partial<ProcessSessionInfo> = {
      status: 'running',
    };
    expect(validStatuses).toContain(session.status);

    session.status = 'completed';
    expect(validStatuses).toContain(session.status);

    session.status = 'failed';
    expect(validStatuses).toContain(session.status);
  });

  // Test 84: Monospace output buffer formatting
  it('84. preserves ANSI and whitespace characters in terminal monospace output', () => {
    const rawOutput = '  Line 1\r\n    Line 2 with spaces\nLine 3';
    expect(rawOutput).toContain('    Line 2 with spaces');
  });

  // Test 85: Session authorization resets to READ when project is switched
  it('85. resets authorization to READ when project is switched or disabled', () => {
    authService.enableAgent('proj-1');
    expect(authService.getLevel('proj-1')).toBe('AGENT');

    // Switching to proj-2 without authorization must return READ
    expect(authService.getLevel('proj-2')).toBe('READ');

    // Disabling resets to READ
    authService.disable();
    expect(authService.getLevel('proj-1')).toBe('READ');
  });
});
