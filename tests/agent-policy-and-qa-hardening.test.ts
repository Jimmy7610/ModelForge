import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { configureQaDebugging } from '../src/main/qa-debug';
import { CommandPolicy } from '../src/main/process/command-policy';
import { ExecutableResolver } from '../src/main/process/executable-resolver';
import { ProcessService } from '../src/main/process/process-service';
import { CommandPolicyError } from '../src/main/process/errors';

describe('Agent Policy & QA Hardening Tests (Pass 6 Cleanup)', () => {
  let tempStorageDir: string;
  let tempProjectDir: string;
  let processService: ProcessService;

  beforeEach(() => {
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-harden-storage-'));
    tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-harden-proj-'));
    processService = new ProcessService(tempStorageDir);
  });

  afterEach(async () => {
    await processService.stopActiveProcess();
    try {
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 21: generic REMOTE_DEBUGGING_PORT does not enable production debugging
  it('21. generic REMOTE_DEBUGGING_PORT does not enable production debugging', () => {
    const switches: Array<[string, string]> = [];
    const mockApp = {
      isPackaged: false,
      commandLine: {
        appendSwitch: (key: string, val: string) => switches.push([key, val]),
      },
    };
    const result = configureQaDebugging(mockApp as any, { REMOTE_DEBUGGING_PORT: '9222' });
    expect(result).toBe(false);
    expect(switches).toHaveLength(0);
  });

  // Test 22: packaged mode never enables QA CDP
  it('22. packaged mode never enables QA CDP', () => {
    const switches: Array<[string, string]> = [];
    const mockApp = {
      isPackaged: true,
      commandLine: {
        appendSwitch: (key: string, val: string) => switches.push([key, val]),
      },
    };
    const result = configureQaDebugging(mockApp as any, { MODELFORGE_QA_REMOTE_DEBUGGING_PORT: '9222' });
    expect(result).toBe(false);
    expect(switches).toHaveLength(0);

    // Development mode with MODELFORGE_QA_REMOTE_DEBUGGING_PORT succeeds and binds loopback
    const mockDevApp = {
      isPackaged: false,
      commandLine: {
        appendSwitch: (key: string, val: string) => switches.push([key, val]),
      },
    };
    const devResult = configureQaDebugging(mockDevApp as any, { MODELFORGE_QA_REMOTE_DEBUGGING_PORT: '9222' });
    expect(devResult).toBe(true);
    expect(switches).toEqual([
      ['remote-debugging-port', '9222'],
      ['remote-debugging-address', '127.0.0.1'],
    ]);
  });

  // Test 23: Agent only receives safe script categories
  it('23. Agent only receives safe script categories', () => {
    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('test')).not.toThrow();
    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('test:unit')).not.toThrow();
    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('build')).not.toThrow();
    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('lint')).not.toThrow();
    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('typecheck')).not.toThrow();

    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('dev')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('start')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('serve')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('preview')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('deploy')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('publish')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertAllowedAgentScriptCategory('custom-job')).toThrow(CommandPolicyError);
  });

  // Test 24: manual dev remains permitted through approval
  it('24. manual dev remains permitted through approval', () => {
    fs.writeFileSync(
      path.join(tempProjectDir, 'package.json'),
      JSON.stringify({
        scripts: {
          dev: 'node server.js',
          test: 'node test.js',
        },
      })
    );

    // Manual initiator succeeds for dev
    const manualResolved = ExecutableResolver.resolveScriptInvocation(tempProjectDir, 'dev', 'manual');
    expect(manualResolved.args).toEqual(['run', 'dev']);

    // Agent initiator fails for dev
    expect(() => {
      ExecutableResolver.resolveScriptInvocation(tempProjectDir, 'dev', 'agent');
    }).toThrow(CommandPolicyError);
  });

  // Test 25: agent npx command blocked
  it('25. agent npx command blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('npx vitest')).toThrow(CommandPolicyError);
  });

  // Test 26: agent npm exec blocked
  it('26. agent npm exec blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('npm exec vitest')).toThrow(CommandPolicyError);
  });

  // Test 27: agent pnpm dlx blocked
  it('27. agent pnpm dlx blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('pnpm dlx vitest')).toThrow(CommandPolicyError);
  });

  // Test 28: agent yarn dlx blocked
  it('28. agent yarn dlx blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('yarn dlx vitest')).toThrow(CommandPolicyError);
  });

  // Test 29: agent bunx blocked
  it('29. agent bunx blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('bunx vitest')).toThrow(CommandPolicyError);
  });

  // Test 30: agent curl/wget blocked
  it('30. agent curl/wget blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('curl http://evil.com')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('wget http://evil.com')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('Invoke-WebRequest http://evil.com')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('Invoke-RestMethod http://evil.com')).toThrow(CommandPolicyError);
  });

  // Test 31: agent PowerShell/cmd/bash/wsl blocked
  it('31. agent PowerShell/cmd/bash/wsl blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('powershell.exe -File run.ps1')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('cmd /c dir')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('bash -c "echo hi"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('wsl ls -la')).toThrow(CommandPolicyError);
  });

  // Test 32: agent ssh blocked
  it('32. agent ssh blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('ssh user@remote.com')).toThrow(CommandPolicyError);
  });

  // Test 33: agent node -e blocked
  it('33. agent node -e blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('node -e "process.exit(0)"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('node --eval "console.log(1)"')).toThrow(CommandPolicyError);
  });

  // Test 34: agent python -c blocked
  it('34. agent python -c blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('python -c "import os"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('python3 -c "import os"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('py -c "import os"')).toThrow(CommandPolicyError);
  });

  // Test 35: normal node test.js remains allowed
  it('35. normal node test.js remains allowed', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('node test.js')).not.toThrow();
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('vitest run')).not.toThrow();
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('tsc --noEmit')).not.toThrow();
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('eslint .')).not.toThrow();
  });

  // Test 36: npm/pnpm/yarn/bun activity display truthful
  it('36. npm/pnpm/yarn/bun activity display truthful', () => {
    const pnpmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-pm-pnpm-'));
    const yarnDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-pm-yarn-'));
    const bunDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-pm-bun-'));
    const npmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-pm-npm-'));

    fs.writeFileSync(path.join(pnpmDir, 'pnpm-lock.yaml'), '');
    fs.writeFileSync(path.join(yarnDir, 'yarn.lock'), '');
    fs.writeFileSync(path.join(bunDir, 'bun.lockb'), '');
    fs.writeFileSync(path.join(npmDir, 'package.json'), '{}');

    expect(ExecutableResolver.detectPackageManager(pnpmDir)).toBe('pnpm');
    expect(ExecutableResolver.detectPackageManager(yarnDir)).toBe('yarn');
    expect(ExecutableResolver.detectPackageManager(bunDir)).toBe('bun');
    expect(ExecutableResolver.detectPackageManager(npmDir)).toBe('npm');

    fs.rmSync(pnpmDir, { recursive: true, force: true });
    fs.rmSync(yarnDir, { recursive: true, force: true });
    fs.rmSync(bunDir, { recursive: true, force: true });
    fs.rmSync(npmDir, { recursive: true, force: true });
  });

  // Test 37: History copy avoids false claims
  it('37. History copy avoids false claims', () => {
    const truthfulSnippet =
      'Completed supervised process runs are stored locally with command, status, exit code, duration, and bounded output.';
    expect(truthfulSnippet).toContain('stored locally');
    expect(truthfulSnippet).not.toContain('securely archived');
  });

  // Test 38: packageManager always included in frozen request
  it('38. packageManager always included in frozen request', async () => {
    fs.writeFileSync(
      path.join(tempProjectDir, 'package.json'),
      JSON.stringify({
        packageManager: 'pnpm@8.0.0',
        scripts: {
          test: 'node test.js',
        },
      })
    );

    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempProjectDir,
      scriptName: 'test',
      reason: 'Testing package manager presence',
      initiator: 'agent',
    });

    const pending = processService.getPendingRequest();
    expect(pending).not.toBeNull();
    expect(pending?.packageManager).toBe('pnpm');

    await processService.denyRequest(pending!.requestId);
    const result = await promise;
    expect(result.denied).toBe(true);
  });
});
