import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProcessService } from '../src/main/process/process-service';
import { ProcessExecutionError } from '../src/main/process/errors';

describe('Process Approval & Queue Security (Tests 29-37)', () => {
  let tempDir: string;
  let processService: ProcessService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-appr-test-'));
    // Write real fixture scripts â€” node -e is blocked by agent content policy (Fix 4)
    fs.writeFileSync(path.join(tempDir, 'fixture-test.js'), 'console.log(123);\n');
    fs.writeFileSync(path.join(tempDir, 'fixture-build.js'), 'console.log(456);\n');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      scripts: {
        test: 'node fixture-test.js',
        build: 'node fixture-build.js',
        dev: 'node fixture-test.js',
      }
    }));
    processService = new ProcessService();
  });

  afterEach(async () => {
    await processService.stopActiveProcess();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 29: Command request is created in 'pending' status with immutable snapshot
  it('29. creates command request with status pending and resolved parameters', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'proj1',
      projectRoot: tempDir,
      scriptName: 'test',
      reason: 'Run unit tests',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    expect(pending).not.toBeNull();
    expect(pending?.status).toBe('pending');
    expect(pending?.scriptName).toBe('test');
    expect(pending?.reason).toBe('Run unit tests');
    expect(pending?.resolvedArgs).toEqual(['run', 'test']);

    // Cancel to clean up
    processService.denyRequest(pending!.requestId);
    const res = await promise;
    expect(res.denied).toBe(true);
  });

  // Test 30: User approval executes command and resolves promise
  it('30. executes command upon user approval and returns exit code', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'proj1',
      projectRoot: tempDir,
      scriptName: 'test',
      reason: 'Testing approval',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    expect(pending).not.toBeNull();

    const approvalResult = await processService.approveRequest(pending!.requestId);
    expect(approvalResult.success).toBe(true);
    expect(approvalResult.sessionId).toBeDefined();

    const executionResult = await promise;
    expect(executionResult.success).toBe(true);
    expect(executionResult.exitCode).toBe(0);
  });

  // Test 31: User denial returns denied: true and does not spawn process
  it('31. returns denied: true without executing process when user denies', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'proj1',
      projectRoot: tempDir,
      scriptName: 'test',
      reason: 'Testing denial',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    const denyResult = processService.denyRequest(pending!.requestId);
    expect(denyResult.success).toBe(true);

    const executionResult = await promise;
    expect(executionResult.success).toBe(false);
    expect(executionResult.denied).toBe(true);
    expect(processService.getActiveSession()).toBeNull();
  });

  // Test 32: User denial propagates custom reason
  it('32. propagates custom denial reason to initiator', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'proj1',
      projectRoot: tempDir,
      scriptName: 'build',
      reason: 'Testing custom denial reason',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    processService.denyRequest(pending!.requestId, 'Dependencies not yet configured');

    const result = await promise;
    expect(result.denied).toBe(true);
    expect(result.message).toBe('Dependencies not yet configured');
  });

  // Test 33: Single pending request constraint
  it('33. rejects new command request while another request is pending approval', async () => {
    const promise1 = processService.createCommandRequest({
      projectId: 'proj1',
      projectRoot: tempDir,
      scriptName: 'test',
      reason: 'First request',
      initiator: 'manual',
    });

    await expect(
      processService.createCommandRequest({
        projectId: 'proj1',
        projectRoot: tempDir,
        scriptName: 'build',
        reason: 'Second request',
      initiator: 'manual',
      })
    ).rejects.toThrow(ProcessExecutionError);

    // Clean up
    const pending = processService.getPendingRequest();
    processService.denyRequest(pending!.requestId);
    await promise1;
  });

  // Test 34: Single running process constraint
  it('34. rejects new command request while a process is actively running', async () => {
    // Add a long-running script to package.json (using real .js files, not node -e)
    fs.writeFileSync(path.join(tempDir, 'sleep-fixture.js'), 'setTimeout(() => {}, 5000);\n');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      scripts: {
        sleep: 'node sleep-fixture.js',
        test: 'node fixture-test.js',
      }
    }));

    const promise1 = processService.createCommandRequest({
      projectId: 'proj1',
      projectRoot: tempDir,
      scriptName: 'sleep',
      reason: 'Long-running script',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);

    // Process is now running
    expect(processService.getActiveSession()?.status).toBe('running');

    // Attempting to create another request while process is running must throw
    await expect(
      processService.createCommandRequest({
        projectId: 'proj1',
        projectRoot: tempDir,
        scriptName: 'test',
        reason: 'Concurrent request',
      initiator: 'manual',
      })
    ).rejects.toThrow(ProcessExecutionError);

    // Stop process
    await processService.stopActiveProcess();
    await promise1;
  });

  // Test 35: Project switch revokes pending requests
  it('35. cancels pending requests on project switch or cancellation', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'proj1',
      projectRoot: tempDir,
      scriptName: 'test',
      reason: 'Pending switch test',
      initiator: 'manual',
    });

    expect(processService.getPendingRequest()).not.toBeNull();
    processService.cancelAllPending('proj1', 'Project switched');

    expect(processService.getPendingRequest()).toBeNull();
    const result = await promise;
    expect(result.cancelled).toBe(true);
  });

  // Test 36: Approving unknown requestId returns error cleanly
  it('36. returns error when approving unknown or already resolved requestId', async () => {
    const res = await processService.approveRequest('nonexistent_id');
    expect(res.success).toBe(false);
    expect(res.error).toContain('nonexistent_id');
  });

  // Test 37: 10-minute timeout cancels pending request automatically
  it('37. automatically cancels pending request on timeout', async () => {
    vi.useFakeTimers();
    try {
      const promise = processService.createCommandRequest({
        projectId: 'proj1',
        projectRoot: tempDir,
        scriptName: 'test',
        reason: 'Timeout test',
      initiator: 'manual',
      });

      expect(processService.getPendingRequest()).not.toBeNull();

      // Fast-forward past 10 minutes (600,000 ms)
      vi.advanceTimersByTime(10 * 60 * 1000 + 100);

      expect(processService.getPendingRequest()).toBeNull();
      const res = await promise;
      expect(res.cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
