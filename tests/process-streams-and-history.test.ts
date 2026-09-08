import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProcessService } from '../src/main/process/process-service';
import { ProcessSession } from '../src/main/process/process-session';

describe('Stream Separation & Local Process History (Pass 6 Correction)', () => {
  let tempStorageDir: string;
  let tempProjectDir: string;
  let processService: ProcessService;

  beforeEach(() => {
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-hist-storage-'));
    tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-hist-proj-'));
    fs.writeFileSync(path.join(tempProjectDir, 'out.js'), 'console.log("ONLY_STDOUT_MESSAGE");');
    fs.writeFileSync(path.join(tempProjectDir, 'err.js'), 'console.error("ONLY_STDERR_MESSAGE");');
    fs.writeFileSync(path.join(tempProjectDir, 'mix.js'), 'console.log("STDOUT_PART"); console.error("STDERR_PART");');
    fs.writeFileSync(path.join(tempProjectDir, 'big_err.js'), 'console.error("E".repeat(40000));');
    fs.writeFileSync(path.join(tempProjectDir, 'big_out.js'), 'console.log("O".repeat(40000));');

    fs.writeFileSync(
      path.join(tempProjectDir, 'package.json'),
      JSON.stringify({
        scripts: {
          stdoutOnly: 'node out.js',
          stderrOnly: 'node err.js',
          mixed: 'node mix.js',
          largeStderr: 'node big_err.js',
          largeStdout: 'node big_out.js',
        },
      })
    );
    processService = new ProcessService(tempStorageDir);
  });

  afterEach(async () => {
    await processService.stopActiveProcess();
    try {
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 1: stdout only remains stdout
  it('1. stdout only remains stdout with empty stderr', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempProjectDir,
      scriptName: 'stdoutOnly',
      reason: 'Testing stdout only',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    const result = await promise;

    expect(result.stdout).toContain('ONLY_STDOUT_MESSAGE');
    expect(result.stderr).toBe('');

    const session = processService.getLastSession();
    expect(session?.retainedStdout).toContain('ONLY_STDOUT_MESSAGE');
    expect(session?.retainedStderr).toBe('');
  });

  // Test 2: stderr only remains stderr
  it('2. stderr only remains stderr with empty stdout', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempProjectDir,
      scriptName: 'stderrOnly',
      reason: 'Testing stderr only',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    const result = await promise;

    expect(result.stderr).toContain('ONLY_STDERR_MESSAGE');
    // stdout should not contain stderr message
    expect(result.stdout).not.toContain('ONLY_STDERR_MESSAGE');

    const session = processService.getLastSession();
    expect(session?.retainedStderr).toContain('ONLY_STDERR_MESSAGE');
    expect(session?.retainedStdout).not.toContain('ONLY_STDERR_MESSAGE');
  });

  // Test 3: mixed stdout/stderr remain distinct
  it('3. mixed stdout and stderr remain distinct in separate retained buffers', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempProjectDir,
      scriptName: 'mixed',
      reason: 'Testing mixed streams',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    const result = await promise;

    expect(result.stdout).toContain('STDOUT_PART');
    expect(result.stdout).not.toContain('STDERR_PART');

    expect(result.stderr).toContain('STDERR_PART');
    expect(result.stderr).not.toContain('STDOUT_PART');

    const session = processService.getLastSession();
    expect(session?.retainedStdout).toContain('STDOUT_PART');
    expect(session?.retainedStderr).toContain('STDERR_PART');
  });

  // Test 4: model result preserves stderr
  it('4. model result preserves stderr without merging into stdout', async () => {
    const session = new ProcessSession({
      requestId: 'req_1',
      projectId: 'p1',
      commandDisplay: 'test-cmd',
      executable: 'node.exe',
      args: ['-v'],
      cwd: tempProjectDir,
    });

    (session as any).handleChunk('stdout', 'info line\n');
    (session as any).handleChunk('stderr', 'FAIL: assertion failed\n');

    const modelOut = session.getBoundedOutputForModel();
    expect(modelOut.stdout).toBe('info line\n');
    expect(modelOut.stderr).toBe('FAIL: assertion failed\n');
  });

  // Test 5: Terminal combined display may show both
  it('5. terminal combined output contains both stdout and stderr chronologically', async () => {
    const session = new ProcessSession({
      requestId: 'req_2',
      projectId: 'p1',
      commandDisplay: 'test-cmd',
      executable: 'node.exe',
      args: ['-v'],
      cwd: tempProjectDir,
    });

    (session as any).handleChunk('stdout', 'Step 1: start\n');
    (session as any).handleChunk('stderr', 'Step 2: warning\n');
    (session as any).handleChunk('stdout', 'Step 3: done\n');

    const info = session.getSessionInfo();
    expect(info.retainedOutput).toContain('Step 1: start\n');
    expect(info.retainedOutput).toContain('Step 2: warning\n');
    expect(info.retainedOutput).toContain('Step 3: done\n');
  });

  // Test 6: truncation flags remain truthful
  it('6. truncation flags remain truthful when output is within bounds', () => {
    const session = new ProcessSession({
      requestId: 'req_3',
      projectId: 'p1',
      commandDisplay: 'test-cmd',
      executable: 'node.exe',
      args: ['-v'],
      cwd: tempProjectDir,
    });

    (session as any).handleChunk('stdout', 'short');
    (session as any).handleChunk('stderr', 'short err');

    const info = session.getSessionInfo();
    expect(info.stdoutTruncated).toBe(false);
    expect(info.stderrTruncated).toBe(false);
    expect(info.outputTruncated).toBe(false);
  });

  // Test 7: large stderr is bounded
  it('7. bounds large stderr while allocating safe model context slice', () => {
    const session = new ProcessSession({
      requestId: 'req_4',
      projectId: 'p1',
      commandDisplay: 'test-cmd',
      executable: 'node.exe',
      args: ['-v'],
      cwd: tempProjectDir,
    });

    const bigStderr = 'E'.repeat(50000);
    (session as any).handleChunk('stderr', bigStderr);

    const modelOut = session.getBoundedOutputForModel(32 * 1024);
    expect(modelOut.stderr.length).toBeLessThanOrEqual(32 * 1024);
    expect(modelOut.stderr).toContain('... [truncated output] ...\n');
  });

  // Test 8: large stdout is bounded
  it('8. bounds large stdout while preserving model context budget', () => {
    const session = new ProcessSession({
      requestId: 'req_5',
      projectId: 'p1',
      commandDisplay: 'test-cmd',
      executable: 'node.exe',
      args: ['-v'],
      cwd: tempProjectDir,
    });

    const bigStdout = 'O'.repeat(50000);
    (session as any).handleChunk('stdout', bigStdout);

    const modelOut = session.getBoundedOutputForModel(32 * 1024);
    expect(modelOut.stdout.length).toBeLessThanOrEqual(32 * 1024);
    expect(modelOut.stdout).toContain('... [truncated output] ...\n');
  });

  // Test 9: persists history under storage directory
  it('9. persists process run metadata to modelforge-process-history.json under storage directory', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempProjectDir,
      scriptName: 'stdoutOnly',
      reason: 'Testing history persistence',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    await promise;

    const historyFile = path.join(tempStorageDir, 'modelforge-process-history.json');
    expect(fs.existsSync(historyFile)).toBe(true);

    const content = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    expect(content.version).toBe(1);
    expect(Array.isArray(content.runs)).toBe(true);
    expect(content.runs.length).toBeGreaterThan(0);
    expect(content.runs[0].scriptName || content.runs[0].commandDisplay).toBeDefined();
    expect(content.runs[0].exitCode).toBe(0);
  });

  // Test 10: history survives app restart
  it('10. loads persisted history upon service restart', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempProjectDir,
      scriptName: 'stdoutOnly',
      reason: 'Run before restart',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    await promise;

    // Simulate app restart: construct new ProcessService with the same storageDir
    const restartedService = new ProcessService(tempStorageDir);
    const loadedHistory = restartedService.getProcessHistory('p1');

    expect(loadedHistory.length).toBe(1);
    expect(loadedHistory[0].commandDisplay).toContain('stdoutOnly');
    expect(loadedHistory[0].status).toBe('completed');
  });

  // Test 11: running process honestly marked interrupted on restart
  it('11. marks previously running process as interrupted on restart', () => {
    const historyFile = path.join(tempStorageDir, 'modelforge-process-history.json');
    const fakeRunningRun = {
      version: 1,
      runs: [
        {
          id: 'proc_active_before_crash',
          requestId: 'req_crash',
          projectId: 'p1',
          commandDisplay: 'npm.cmd run dev',
          executable: 'npm.cmd',
          args: ['run', 'dev'],
          cwd: tempProjectDir,
          status: 'running',
          startedAt: new Date().toISOString(),
          outputTruncated: false,
        },
      ],
    };
    fs.writeFileSync(historyFile, JSON.stringify(fakeRunningRun, null, 2), 'utf8');

    const restartedService = new ProcessService(tempStorageDir);
    const runs = restartedService.getProcessHistory('p1');

    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe('interrupted');
  });
});
