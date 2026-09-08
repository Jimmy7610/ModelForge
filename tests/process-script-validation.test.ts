import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ExecutableResolver } from '../src/main/process/executable-resolver';
import { CommandPolicy } from '../src/main/process/command-policy';

describe('Process Script Discovery & Validation (Tests 17-28)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-val-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 17: Discovers scripts from valid package.json
  it('17. discovers all scripts defined in valid package.json', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      scripts: {
        test: 'vitest run',
        build: 'vite build',
        lint: 'eslint .',
        format: 'prettier --write .',
      }
    }));
    const { scripts } = ExecutableResolver.discoverScripts(tempDir);
    expect(scripts).toHaveLength(4);
    expect(scripts.map((s) => s.name)).toEqual(['test', 'build', 'lint', 'format']);
  });

  // Test 18: Classifies test scripts
  it('18. classifies test and coverage scripts as test', () => {
    expect(CommandPolicy.categorizeScript('test')).toBe('test');
    expect(CommandPolicy.categorizeScript('test:unit')).toBe('test');
    expect(CommandPolicy.categorizeScript('check')).toBe('test');
    expect(CommandPolicy.categorizeScript('coverage')).toBe('test');
  });

  // Test 19: Classifies build and compile scripts
  it('19. classifies build and bundle scripts as build', () => {
    expect(CommandPolicy.categorizeScript('build')).toBe('build');
    expect(CommandPolicy.categorizeScript('build:prod')).toBe('build');
    expect(CommandPolicy.categorizeScript('compile')).toBe('build');
    expect(CommandPolicy.categorizeScript('bundle')).toBe('build');
  });

  // Test 20: Classifies lint and formatting scripts
  it('20. classifies lint and format scripts as lint', () => {
    expect(CommandPolicy.categorizeScript('lint')).toBe('lint');
    expect(CommandPolicy.categorizeScript('lint:fix')).toBe('lint');
    expect(CommandPolicy.categorizeScript('format')).toBe('lint');
    expect(CommandPolicy.categorizeScript('prettier')).toBe('lint');
  });

  // Test 21: Classifies typecheck scripts
  it('21. classifies typecheck and tsc scripts as typecheck', () => {
    expect(CommandPolicy.categorizeScript('typecheck')).toBe('typecheck');
    expect(CommandPolicy.categorizeScript('tsc')).toBe('typecheck');
  });

  // Test 22: Classifies dev and watch scripts as persistent dev
  it('22. classifies dev and watch scripts as persistent dev servers', () => {
    expect(CommandPolicy.categorizeScript('dev')).toBe('dev');
    expect(CommandPolicy.categorizeScript('dev:mock')).toBe('dev');
    expect(CommandPolicy.categorizeScript('watch')).toBe('dev');
    expect(CommandPolicy.isPersistentScript('dev')).toBe(true);
    expect(CommandPolicy.isPersistentScript('watch')).toBe(true);
  });

  // Test 23: Classifies start and serve scripts as persistent start
  it('23. classifies start and serve scripts as persistent start servers', () => {
    expect(CommandPolicy.categorizeScript('start')).toBe('start');
    expect(CommandPolicy.categorizeScript('serve')).toBe('start');
    expect(CommandPolicy.categorizeScript('preview')).toBe('start');
    expect(CommandPolicy.isPersistentScript('start')).toBe(true);
  });

  // Test 24: Classifies arbitrary custom scripts as other
  it('24. classifies uncategorized scripts as other', () => {
    expect(CommandPolicy.categorizeScript('generate-docs')).toBe('other');
    expect(CommandPolicy.categorizeScript('seed')).toBe('other');
    expect(CommandPolicy.isPersistentScript('seed')).toBe(false);
  });

  // Test 25: Returns empty array if package.json does not exist
  it('25. returns empty scripts array gracefully when package.json is missing', () => {
    const { scripts } = ExecutableResolver.discoverScripts(tempDir);
    expect(scripts).toEqual([]);
  });

  // Test 26: Returns empty array if package.json has no scripts field
  it('26. returns empty scripts array when package.json contains no scripts block', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'empty-scripts' }));
    const { scripts } = ExecutableResolver.discoverScripts(tempDir);
    expect(scripts).toEqual([]);
  });

  // Test 27: Returns empty array if package.json is malformed JSON
  it('27. recovers gracefully when package.json contains corrupted JSON', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{ invalid json ');
    const { scripts } = ExecutableResolver.discoverScripts(tempDir);
    expect(scripts).toEqual([]);
  });

  // Test 28: packageManager field takes precedence over lockfile detection
  it('28. honors packageManager field over lockfile fallback', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@8.0.0',
      scripts: { test: 'vitest' }
    }));
    // Also create yarn.lock to ensure packageManager field wins
    fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');
    const pm = ExecutableResolver.detectPackageManager(tempDir);
    expect(pm).toBe('pnpm');
  });
});
