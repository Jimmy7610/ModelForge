import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProcessService } from '../src/main/process/process-service';
import { ProcessOutputChunk } from '../src/main/process/types';

describe('Process Execution & Streaming (Tests 38-48)', () => {
  let tempDir: string;
  let processService: ProcessService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-exec-test-'));
    // Write real fixture scripts â€” node -e is blocked by agent content policy (Fix 4)
    fs.writeFileSync(path.join(tempDir, 'success.js'), 'console.log(12345);\n');
    fs.writeFileSync(path.join(tempDir, 'failure.js'), 'console.error(54321); process.exit(1);\n');
    fs.writeFileSync(path.join(tempDir, 'multiline.js'), 'console.log(1); console.log(2); console.log(3);\n');
    fs.writeFileSync(path.join(tempDir, 'stderr-stream.js'), 'console.error(999);\n');
    fs.writeFileSync(path.join(tempDir, 'long-running.js'), 'setInterval(() => {}, 1000);\n');
    fs.writeFileSync(path.join(tempDir, 'fast-echo.js'), Array.from({ length: 100 }, (_, i) => `console.log(${i});`).join('\n') + '\n');
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        scripts: {
          success: 'node success.js',
          failure: 'node failure.js',
          multiline: 'node multiline.js',
          stderrStream: 'node stderr-stream.js',
          longRunning: 'node long-running.js',
          fastEcho: 'node fast-echo.js',
        },
      })
    );
    processService = new ProcessService();
  });

  afterEach(async () => {
    await processService.stopActiveProcess();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 38: Live stdout streaming chunks
  it('38. streams live stdout chunks via callback', async () => {
    const chunks: ProcessOutputChunk[] = [];
    processService.setOutputChunkCallback((chunk) => {
      chunks.push(chunk);
    });

    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'success',
      reason: 'Testing stdout chunks',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.stream === 'stdout' && c.text.includes('12345'))).toBe(true);
  });

  // Test 39: Live stderr streaming chunks
  it('39. streams live stderr chunks via callback', async () => {
    const chunks: ProcessOutputChunk[] = [];
    processService.setOutputChunkCallback((chunk) => {
      chunks.push(chunk);
    });

    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'stderrStream',
      reason: 'Testing stderr chunks',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    const result = await promise;

    expect(result.exitCode).toBe(0);
    expect(chunks.some((c) => c.stream === 'stderr' && c.text.includes('999'))).toBe(true);
  });

  // Test 40: Exit code 0 marks session as completed
  it('40. marks session status completed when exit code is 0', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'success',
      reason: 'Testing completed status',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.exitCode).toBe(0);
  });

  // Test 41: Non-zero exit code marks session as failed
  it('41. marks session status failed when exit code is non-zero', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'failure',
      reason: 'Testing failed status',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('54321');
  });

  // Test 42: Duration and timestamps are recorded
  it('42. records startedAt, endedAt, and durationMs accurately', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'success',
      reason: 'Testing duration',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    const result = await promise;

    expect(result.startedAt).toBeDefined();
    expect(result.endedAt).toBeDefined();
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // Test 43: PID is captured when process starts
  it('43. captures process PID upon spawn', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'longRunning',
      reason: 'Testing PID',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);

    const active = processService.getActiveSession();
    expect(active).not.toBeNull();
    expect(typeof active?.pid).toBe('number');
    expect(active!.pid).toBeGreaterThan(0);

    await processService.stopActiveProcess();
    await promise;
  });

  // Test 44: Stop active process terminates cleanly
  it('44. terminates active process tree cleanly on stop request', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'longRunning',
      reason: 'Testing stop',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);

    expect(processService.getActiveSession()?.status).toBe('running');

    const stopRes = await processService.stopActiveProcess();
    expect(stopRes.success).toBe(true);

    const finalResult = await promise;
    expect(finalResult.status).toBe('cancelled');
    expect(processService.getActiveSession()).toBeNull();
  });

  // Test 45: Retained output preserves complete stream
  it('45. aggregates multiline output in retainedOutput buffer', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'multiline',
      reason: 'Testing multiline aggregation',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    const result = await promise;

    expect(result.output).toContain('1');
    expect(result.output).toContain('2');
    expect(result.output).toContain('3');
  });

  // Test 46: Retains last active session after completion
  it('46. retains lastSession info after process terminates', async () => {
    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempDir,
      scriptName: 'success',
      reason: 'Testing last session retention',
      initiator: 'manual',
    });

    const pending = processService.getPendingRequest();
    await processService.approveRequest(pending!.requestId);
    await promise;

    const last = processService.getLastSession();
    expect(last).not.toBeNull();
    expect(last?.status).toBe('completed');
    expect(last?.exitCode).toBe(0);
  });

  // Test 47: Discovered scripts categorized accurately
  it('47. categorizes discovered scripts into test, build, lint, dev, start, other', () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        scripts: {
          test: 'vitest',
          'test:unit': 'vitest unit',
          build: 'vite build',
          lint: 'eslint',
          dev: 'vite',
          start: 'node index.js',
          custom: 'echo 1',
        },
      })
    );

    const { scripts } = processService.discoverScripts(tempDir);
    const map = new Map(scripts.map((s) => [s.name, s.category]));

    expect(map.get('test')).toBe('test');
    expect(map.get('test:unit')).toBe('test');
    expect(map.get('build')).toBe('build');
    expect(map.get('lint')).toBe('lint');
    expect(map.get('dev')).toBe('dev');
    expect(map.get('start')).toBe('start');
    expect(map.get('custom')).toBe('other');
  });

  // Test 48: Persistent scripts identified accurately
  it('48. flags dev and start scripts as persistent', () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        scripts: {
          dev: 'vite',
          start: 'node dist/index.js',
          test: 'vitest',
        },
      })
    );

    const { scripts } = processService.discoverScripts(tempDir);
    const devScript = scripts.find((s) => s.name === 'dev');
    const startScript = scripts.find((s) => s.name === 'start');
    const testScript = scripts.find((s) => s.name === 'test');

    expect(devScript?.isPersistent).toBe(true);
    expect(startScript?.isPersistent).toBe(true);
    expect(testScript?.isPersistent).toBe(false);
  });
});
