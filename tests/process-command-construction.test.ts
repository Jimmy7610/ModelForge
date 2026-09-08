import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CommandPolicy } from '../src/main/process/command-policy';
import { ExecutableResolver } from '../src/main/process/executable-resolver';
import { CommandPolicyError } from '../src/main/process/errors';

describe('Process Command Construction & Security Validation (Tests 1-16)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-cmd-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 1: Valid package.json script name
  it('1. accepts valid package.json script names', () => {
    expect(() => CommandPolicy.validateScriptName('test')).not.toThrow();
    expect(() => CommandPolicy.validateScriptName('build:prod')).not.toThrow();
    expect(() => CommandPolicy.validateScriptName('lint-fix')).not.toThrow();
    expect(() => CommandPolicy.validateScriptName('typecheck')).not.toThrow();
  });

  // Test 2: Reject empty or whitespace script names
  it('2. rejects empty or whitespace script names', () => {
    expect(() => CommandPolicy.validateScriptName('')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.validateScriptName('   ')).toThrow(CommandPolicyError);
  });

  // Test 3: Reject shell chaining & piping (&, ;, |, &&, ||)
  it('3. rejects shell command chaining and operators (&, ;, |, &&, ||)', () => {
    expect(() => CommandPolicy.validateScriptName('test && rm -rf /')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.validateScriptName('test; cat /etc/passwd')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.validateScriptName('test | echo hacked')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.validateScriptName('test & dir')).toThrow(CommandPolicyError);
  });

  // Test 4: Reject path traversal (.., /, \)
  it('4. rejects path traversal characters in script names', () => {
    expect(() => CommandPolicy.validateScriptName('../test')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.validateScriptName('foo/bar')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.validateScriptName('foo\\bar')).toThrow(CommandPolicyError);
  });

  // Test 5: Reject shell redirection (>, <)
  it('5. rejects redirection characters in script names', () => {
    expect(() => CommandPolicy.validateScriptName('test > out.txt')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.validateScriptName('test < in.txt')).toThrow(CommandPolicyError);
  });

  // Test 6: Reject newlines and control characters
  it('6. rejects newlines and carriage returns', () => {
    expect(() => CommandPolicy.validateScriptName("test\nrm -rf .")).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.validateScriptName("test\r\ndir")).toThrow(CommandPolicyError);
  });

  // Test 7: Reject quotation marks and backticks
  it('7. rejects quotation marks and command substitution', () => {
    expect(() => CommandPolicy.validateScriptName('test"foo"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.validateScriptName("test'foo'")).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.validateScriptName('test`id`')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.validateScriptName('test$(whoami)')).toThrow(CommandPolicyError);
  });

  // Test 8: Disallow arbitrary raw commands (must be an existing script in package.json)
  it('8. rejects scripts that do not exist in package.json', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      scripts: { test: 'vitest run' }
    }));
    expect(() => ExecutableResolver.resolveScriptInvocation(tempDir, 'nonexistent')).toThrow(CommandPolicyError);
  });

  // Test 9: Construct exact npm invocation on Windows
  it('9. constructs exact npm invocation with npm.cmd and run arguments on Windows', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      scripts: { build: 'tsc' }
    }));
    const invocation = ExecutableResolver.resolveScriptInvocation(tempDir, 'build');
    if (process.platform === 'win32') {
      expect(invocation.executable.toLowerCase()).toContain('npm.cmd');
    } else {
      expect(invocation.executable).toContain('npm');
    }
    expect(invocation.args).toEqual(['run', 'build']);
    expect(invocation.cwd).toBe(tempDir);
  });

  // Test 10: Package manager detection: pnpm
  it('10. detects pnpm from packageManager field or pnpm-lock.yaml', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@8.15.0',
      scripts: { test: 'vitest' }
    }));
    const pm = ExecutableResolver.detectPackageManager(tempDir);
    expect(pm).toBe('pnpm');
    const invocation = ExecutableResolver.resolveScriptInvocation(tempDir, 'test');
    if (process.platform === 'win32') {
      expect(invocation.executable.toLowerCase()).toContain('pnpm.cmd');
    }
    expect(invocation.args).toEqual(['run', 'test']);
  });

  // Test 11: Package manager detection: yarn
  it('11. detects yarn from yarn.lock', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      scripts: { lint: 'eslint .' }
    }));
    fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '# yarn lockfile');
    const pm = ExecutableResolver.detectPackageManager(tempDir);
    expect(pm).toBe('yarn');
    const invocation = ExecutableResolver.resolveScriptInvocation(tempDir, 'lint');
    if (process.platform === 'win32') {
      expect(invocation.executable.toLowerCase()).toContain('yarn.cmd');
    }
    expect(invocation.args).toEqual(['run', 'lint']);
  });

  // Test 12: Package manager detection: bun
  it('12. detects bun from bun.lockb or bun.lock', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      packageManager: 'bun@1.0.0',
      scripts: { start: 'bun run index.ts' }
    }));
    const pm = ExecutableResolver.detectPackageManager(tempDir);
    expect(pm).toBe('bun');
    const invocation = ExecutableResolver.resolveScriptInvocation(tempDir, 'start');
    if (process.platform === 'win32') {
      expect(invocation.executable.toLowerCase()).toContain('bun.exe');
    }
    expect(invocation.args).toEqual(['run', 'start']);
  });

  // Test 13: Strict rejection of dependency installation commands
  it('13. blocks dependency install or add commands', () => {
    expect(() => CommandPolicy.assertSafeScriptCommand('npm install axios')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeScriptCommand('npm i lodash')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeScriptCommand('pnpm add react')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeScriptCommand('yarn add express')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeScriptCommand('bun add vitest')).toThrow(CommandPolicyError);
  });

  // Test 14: Strict rejection of Git mutation commands
  it('14. blocks git mutation commands in script execution', () => {
    expect(() => CommandPolicy.assertSafeScriptCommand('git commit -m "hack"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeScriptCommand('git checkout main')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeScriptCommand('git reset --hard')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeScriptCommand('git push origin main')).toThrow(CommandPolicyError);
  });

  // Test 15: Strict rejection of raw shell interpreter spawns
  it('15. blocks powershell, cmd, bash direct interpreter spawns', () => {
    expect(() => CommandPolicy.assertSafeScriptCommand('powershell.exe -Command "rm *.*"')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeScriptCommand('cmd.exe /c del /f *.*')).toThrow(CommandPolicyError);
    expect(() => CommandPolicy.assertSafeScriptCommand('bash -c "rm -rf ~"')).toThrow(CommandPolicyError);
  });

  // Test 16: Safe npm commands pass policy check
  it('16. allows safe build, test, and lint scripts to pass policy check', () => {
    expect(() => CommandPolicy.assertSafeScriptCommand('vitest run')).not.toThrow();
    expect(() => CommandPolicy.assertSafeScriptCommand('tsc --noEmit')).not.toThrow();
    expect(() => CommandPolicy.assertSafeScriptCommand('eslint . --ext .ts,.tsx')).not.toThrow();
  });
});
