import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProcessService } from '../src/main/process/process-service';
import { SessionAuthorizationService } from '../src/main/edit/authorization';
import { CommandPolicyError } from '../src/main/process/errors';

describe('Agent Process Tool Registration & Supervision (Tests 66-75)', () => {
  let tempDir: string;
  let processService: ProcessService;
  let authService: SessionAuthorizationService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-agent-tool-test-'));
    // Write real fixture scripts — node -e is blocked by agent content policy (Fix 4)
    fs.writeFileSync(path.join(tempDir, 'fixture-test.js'), 'console.log(123);\n');
    fs.writeFileSync(path.join(tempDir, 'fixture-build.js'), 'console.log(456);\n');
    fs.writeFileSync(path.join(tempDir, 'fixture-fail.js'), 'process.exit(1);\n');
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        scripts: {
          test: 'node fixture-test.js',
          build: 'node fixture-build.js',
          'test:fail': 'node fixture-fail.js',
        },
      })
    );
    processService = new ProcessService();
    authService = new SessionAuthorizationService();
  });

  afterEach(async () => {
    await processService.stopActiveProcess();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 66: READ mode has no process execution tool
  it('66. disallows request_project_script when permission level is READ', () => {
    const level = authService.getLevel('p1');
    expect(level).toBe('READ');
    expect(authService.canExecuteProcesses('p1')).toBe(false);
  });

  // Test 67: EDIT mode has no process execution tool
  it('67. disallows request_project_script when permission level is EDIT', () => {
    authService.enableEdit('p1');
    const level = authService.getLevel('p1');
    expect(level).toBe('EDIT');
    expect(authService.canExecuteProcesses('p1')).toBe(false);
  });

  // Test 68: AGENT mode permits request_project_script tool
  it('68. enables process supervision when permission level is AGENT', () => {
    authService.enableAgent('p1');
    const level = authService.getLevel('p1');
    expect(level).toBe('AGENT');
    expect(authService.canExecuteProcesses('p1')).toBe(true);
  });

  // Test 69: Empty script name rejected
  it('69. rejects empty or whitespace script names', async () => {
    await expect(
      processService.createCommandRequest({
        projectId: 'p1',
        projectRoot: tempDir,
        scriptName: '',
        reason: 'testing empty',
      })
    ).rejects.toThrow(CommandPolicyError);
  });

  // Test 70: Agent request creates pending request with initiator 'agent'
  it('70. creates pending command request with initiator agent', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'test',
      reason: 'Verify unit test pass',
      initiator: 'agent',
    });

    const pending = processService.getPendingRequest();
    expect(pending).not.toBeNull();
    expect(pending?.initiator).toBe('agent');
    expect(pending?.scriptName).toBe('test');
    expect(pending?.reason).toBe('Verify unit test pass');

    // Clean up
    processService.denyRequest(pending!.requestId);
    await promise;
  });

  // Test 71: User approval executes command and returns bounded output to agent
  it('71. returns execution result to agent when user approves', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'test',
      reason: 'Running tests',
      initiator: 'agent',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('123');
    expect(result.message).toContain('completed successfully (exit 0)');
  });

  // Test 72: User denial returns denied message to agent
  it('72. returns denied message to agent without execution when user denies', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'build',
      reason: 'Build artifacts',
      initiator: 'agent',
    });

    const pending = processService.getPendingRequest();
    processService.denyRequest(pending!.requestId, 'User denied this command.');
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.denied).toBe(true);
    expect(result.message).toBe('User denied this command.');
  });

  // Test 73: Process execution tracks failed commands
  it('73. reports non-zero exit codes accurately to agent', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'test:fail',
      reason: 'Expected failure',
      initiator: 'agent',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('failed with exit code 1');
  });

  // Test 74: Package.json non-existent script rejected
  it('74. rejects scripts not defined in package.json', async () => {
    await expect(
      processService.createCommandRequest({
        projectId: 'p1',
        projectRoot: tempDir,
        scriptName: 'nonexistent-script',
        reason: 'test nonexistent',
      })
    ).rejects.toThrow(CommandPolicyError);
  });

  // Test 75: Project switch clears authorization back to READ
  it('75. resets session authorization to READ on project switch or disable', () => {
    authService.enableAgent('p1');
    expect(authService.getLevel('p1')).toBe('AGENT');

    authService.disable();
    expect(authService.getLevel('p1')).toBe('READ');
    expect(authService.canExecuteProcesses('p1')).toBe(false);
  });
});
