import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// Import the SINGLE canonical implementation that both tests and Electron runtime use
import { configureQaDebugging } from '../src/main/qa-debug';
// Verify index.ts re-exports the same function (not a separate copy)
import { configureQaDebugging as configureQaDebuggingFromIndex } from '../src/main/index';
import { CommandPolicy } from '../src/main/process/command-policy';
import { ExecutableResolver } from '../src/main/process/executable-resolver';
import { ProcessService } from '../src/main/process/process-service';
import { CommandPolicyError } from '../src/main/process/errors';

describe('Agent Policy & QA Hardening Tests (Pass 6 Micro-Hardening)', () => {
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

  // â”€â”€â”€ QA DEBUG ARCHITECTURE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Test 21: index.ts re-exports the SAME function reference from qa-debug.ts
  it('21. index.ts re-exports the exact configureQaDebugging from qa-debug.ts (single implementation)', () => {
    // Both imports must resolve to the same function â€” no duplicate body
    expect(configureQaDebuggingFromIndex).toBe(configureQaDebugging);
  });

  // Test 22: generic REMOTE_DEBUGGING_PORT is ignored â€” only MODELFORGE_QA_REMOTE_DEBUGGING_PORT works
  it('22. generic REMOTE_DEBUGGING_PORT does not enable debugging', () => {
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

  // Test 23: packaged production build cannot enable QA debugging
  it('23. packaged app rejects QA debugging regardless of env vars', () => {
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
  });

  // Test 24: explicit QA variable works only when unpackaged
  it('24. MODELFORGE_QA_REMOTE_DEBUGGING_PORT enables debugging only when unpackaged', () => {
    const switches: Array<[string, string]> = [];
    const mockDevApp = {
      isPackaged: false,
      commandLine: {
        appendSwitch: (key: string, val: string) => switches.push([key, val]),
      },
    };
    const devResult = configureQaDebugging(mockDevApp as any, { MODELFORGE_QA_REMOTE_DEBUGGING_PORT: '9222' });
    expect(devResult).toBe(true);
    // Must append exactly these two switches in order
    expect(switches).toEqual([
      ['remote-debugging-port', '9222'],
      ['remote-debugging-address', '127.0.0.1'],
    ]);
  });

  // Test 25: loopback address is always enforced â€” never 0.0.0.0 or wildcard
  it('25. remote debugging address is always bound to 127.0.0.1', () => {
    const switches: Array<[string, string]> = [];
    const mockApp = {
      isPackaged: false,
      commandLine: {
        appendSwitch: (key: string, val: string) => switches.push([key, val]),
      },
    };
    configureQaDebugging(mockApp as any, { MODELFORGE_QA_REMOTE_DEBUGGING_PORT: '9333' });
    const addrSwitch = switches.find(([k]) => k === 'remote-debugging-address');
    expect(addrSwitch).toBeDefined();
    expect(addrSwitch![1]).toBe('127.0.0.1');
    expect(addrSwitch![1]).not.toBe('0.0.0.0');
  });

  // Test 26: no appInstance provided â€” returns false, no crash
  it('26. missing appInstance causes graceful no-op', () => {
    expect(configureQaDebugging(undefined, { MODELFORGE_QA_REMOTE_DEBUGGING_PORT: '9222' })).toBe(false);
  });

  // â”€â”€â”€ STRICT AGENT SCRIPT-NAME AUTHORIZATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Test 27: canonical allowed script names
  it('27. getAgentScriptCategory accepts canonical allowed names', () => {
    expect(CommandPolicy.getAgentScriptCategory('test')).toBe('test');
    expect(CommandPolicy.getAgentScriptCategory('test:unit')).toBe('test');
    expect(CommandPolicy.getAgentScriptCategory('test:e2e')).toBe('test');
    expect(CommandPolicy.getAgentScriptCategory('build')).toBe('build');
    expect(CommandPolicy.getAgentScriptCategory('build:prod')).toBe('build');
    expect(CommandPolicy.getAgentScriptCategory('lint')).toBe('lint');
    expect(CommandPolicy.getAgentScriptCategory('lint:fix')).toBe('lint');
    expect(CommandPolicy.getAgentScriptCategory('typecheck')).toBe('typecheck');
    expect(CommandPolicy.getAgentScriptCategory('typecheck:ci')).toBe('typecheck');
  });

  // Test 28: tricky names that must NOT pass the strict agent authorization
  it('28. getAgentScriptCategory rejects tricky names containing allowed keywords', () => {
    // Names that contain 'test' but are NOT test or test:<suffix>
    expect(CommandPolicy.getAgentScriptCategory('deploy:test')).toBeNull();
    expect(CommandPolicy.getAgentScriptCategory('dangerous-test')).toBeNull();
    expect(CommandPolicy.getAgentScriptCategory('contest')).toBeNull();
    expect(CommandPolicy.getAgentScriptCategory('test-and-deploy')).toBeNull();

    // Names that contain 'build' but are NOT build or build:<suffix>
    expect(CommandPolicy.getAgentScriptCategory('release-build-and-publish')).toBeNull();
    expect(CommandPolicy.getAgentScriptCategory('prebuild-deploy')).toBeNull();

    // Names that contain 'lint' but are NOT lint or lint:<suffix>
    expect(CommandPolicy.getAgentScriptCategory('custom-lint-release')).toBeNull();

    // Entirely disallowed categories
    expect(CommandPolicy.getAgentScriptCategory('dev')).toBeNull();
    expect(CommandPolicy.getAgentScriptCategory('start')).toBeNull();
    expect(CommandPolicy.getAgentScriptCategory('serve')).toBeNull();
    expect(CommandPolicy.getAgentScriptCategory('preview')).toBeNull();
    expect(CommandPolicy.getAgentScriptCategory('deploy')).toBeNull();
    expect(CommandPolicy.getAgentScriptCategory('publish')).toBeNull();
    expect(CommandPolicy.getAgentScriptCategory('release')).toBeNull();
  });

  // Test 29: assertAllowedAgentScriptCategory allows canonical names
  it('29. assertAllowedAgentScriptCategory allows canonical agent-safe names', () => {
    const allowed = [
      'test', 'test:unit', 'test:e2e',
      'build', 'build:prod',
      'lint', 'lint:fix',
      'typecheck', 'typecheck:ci',
    ];
    for (const name of allowed) {
      expect(() => CommandPolicy.assertAllowedAgentScriptCategory(name)).not.toThrow();
    }
  });

  // Test 30: assertAllowedAgentScriptCategory rejects all non-canonical names
  it('30. assertAllowedAgentScriptCategory rejects all disallowed and tricky names', () => {
    const rejected = [
      // Standard disallowed categories
      'dev', 'start', 'serve', 'preview', 'deploy', 'publish', 'release',
      // Tricky: contain keyword but not canonical form
      'deploy:test', 'dangerous-test', 'contest',
      'release-build-and-publish', 'prebuild-deploy',
      'custom-lint-release', 'test-and-deploy',
    ];
    for (const name of rejected) {
      expect(() => CommandPolicy.assertAllowedAgentScriptCategory(name)).toThrow(CommandPolicyError);
    }
  });

  // Test 31: manual Terminal is not constrained by agent category check
  it('31. manual dev remains permitted through approval (Terminal unrestricted)', () => {
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

  // Test 32: agent real project flow â€” test script with safe command works end-to-end
  it('32. agent can request a safe test script via ProcessService', async () => {
    fs.writeFileSync(path.join(tempProjectDir, 'fixture.js'), 'console.log("ok");\n');
    fs.writeFileSync(
      path.join(tempProjectDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'node fixture.js' } })
    );

    const promise = processService.createCommandRequest({
      projectId: 'p1',
      projectRoot: tempProjectDir,
      scriptName: 'test',
      reason: 'Verify regression',
      initiator: 'agent',
    });

    const pending = processService.getPendingRequest();
    expect(pending).not.toBeNull();
    expect(pending?.scriptName).toBe('test');

    await processService.denyRequest(pending!.requestId);
    const result = await promise;
    expect(result.denied).toBe(true);
  });

  // Test 33: agent cannot request dev script via ProcessService (category blocked)
  it('33. agent cannot request dev script via ProcessService', async () => {
    fs.writeFileSync(
      path.join(tempProjectDir, 'package.json'),
      JSON.stringify({ scripts: { dev: 'node server.js' } })
    );

    await expect(
      processService.createCommandRequest({
        projectId: 'p1',
        projectRoot: tempProjectDir,
        scriptName: 'dev',
        reason: 'Trying dev',
        initiator: 'agent',
      })
    ).rejects.toThrow(CommandPolicyError);
  });

  // â”€â”€â”€ COMMAND CONTENT POLICY (unchanged, verified) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Test 34: agent npx command blocked
  it('34. agent npx command blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('npx vitest')).toThrow(CommandPolicyError);
  });

  // Test 35: agent package runners blocked
  it('35. agent package runners blocked (npm exec, pnpm dlx, yarn dlx, bunx)', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('npm exec vitest')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('pnpm dlx vitest')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('yarn dlx vitest')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('bunx vitest')).toThrow(CommandPolicyError);
  });

  // Test 36: agent network fetchers blocked
  it('36. agent network fetchers blocked', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('curl http://evil.com')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('wget http://evil.com')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('Invoke-WebRequest http://evil.com')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('Invoke-RestMethod http://evil.com')).toThrow(CommandPolicyError);
  });

  // Test 37: agent shells blocked
  it('37. agent shells blocked (powershell, cmd, bash, wsl, ssh)', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('powershell.exe -File run.ps1')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('cmd /c dir')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('bash -c "echo hi"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('wsl ls -la')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('ssh user@remote.com')).toThrow(CommandPolicyError);
  });

  // Test 38: agent inline code evaluation blocked
  it('38. agent inline code evaluation blocked (node -e, python -c)', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('node -e "process.exit(0)"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('node --eval "console.log(1)"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('python -c "import os"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('python3 -c "import os"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('py -c "import os"')).toThrow(CommandPolicyError);
  });

  // Test 39: safe script commands remain allowed
  it('39. safe script commands remain allowed by agent content policy', () => {
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('node test.js')).not.toThrow();
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('vitest run')).not.toThrow();
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('tsc --noEmit')).not.toThrow();
    expect(() => CommandPolicy.assertSafeAgentScriptCommand('eslint .')).not.toThrow();
  });

  // Test 40: packageManager detection
  it('40. detectPackageManager returns correct PM per lockfile', () => {
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

  // Test 41: packageManager always included in frozen request
  it('41. packageManager always included in frozen pending request', async () => {
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

  // Test 42: HistoryPage source does not claim false security guarantees
  it('42. HistoryPage source does not contain overclaiming security language', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/renderer/pages/HistoryPage.tsx'),
      'utf8'
    );
    expect(src).not.toContain('securely archived');
    expect(src).toContain('stored locally');
  });
});
