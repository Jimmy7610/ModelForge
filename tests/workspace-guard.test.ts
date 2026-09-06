import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceGuard } from '../src/main/workspace/guard';
import { WorkspaceSecurityError } from '../src/main/workspace/types';
import { isSystemForbiddenPath } from '../src/main/workspace/path-policy';

describe('WorkspaceGuard & Hard Workspace Jail', () => {
  let tempWorkspace: string;
  let outsideDir: string;
  let guard: WorkspaceGuard;

  beforeEach(() => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-jail-project-'));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-jail-outside-'));

    // Populate realistic workspace structure
    fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempWorkspace, 'package.json'), '{"name":"mock-app"}', 'utf8');
    fs.writeFileSync(path.join(tempWorkspace, 'src', 'App.tsx'), 'export const App = () => null;', 'utf8');
    fs.writeFileSync(path.join(tempWorkspace, '.env'), 'SECRET_API_KEY=topsecret123', 'utf8');

    // Create outside file
    fs.writeFileSync(path.join(outsideDir, 'secret-outside.txt'), 'SUPER_SECRET', 'utf8');

    guard = new WorkspaceGuard(tempWorkspace);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('initializes with valid canonical project root', () => {
    expect(guard.rootPath).toBe(path.resolve(tempWorkspace));
    expect(guard.canonicalRootPath).toBeDefined();
    expect(fs.existsSync(guard.canonicalRootPath)).toBe(true);
  });

  it('rejects empty, non-string, or non-existent project roots', () => {
    expect(() => new WorkspaceGuard('')).toThrow(WorkspaceSecurityError);
    // @ts-expect-error testing invalid argument
    expect(() => new WorkspaceGuard(null)).toThrow(WorkspaceSecurityError);
    expect(() => new WorkspaceGuard(path.join(tempWorkspace, 'non-existent-folder'))).toThrow(WorkspaceSecurityError);
  });

  it('rejects files as project root', () => {
    const filePath = path.join(tempWorkspace, 'package.json');
    expect(() => new WorkspaceGuard(filePath)).toThrow(WorkspaceSecurityError);
  });

  it('allows reading relative paths inside the workspace', () => {
    const res = guard.resolveReadPath('src/App.tsx');
    expect(res.allowed).toBe(true);
    expect(res.relativePath).toBe('src/App.tsx');
    expect(fs.existsSync(res.canonicalPath)).toBe(true);
  });

  it('allows reading absolute paths that reside inside the workspace', () => {
    const absPath = path.join(tempWorkspace, 'src', 'App.tsx');
    const res = guard.resolveReadPath(absPath);
    expect(res.allowed).toBe(true);
    expect(res.relativePath).toBe('src/App.tsx');
  });

  it('strictly blocks path traversal attempts using ../ to escape root', () => {
    const traversal = guard.resolveReadPath('../outside-file.txt');
    expect(traversal.allowed).toBe(false);
    expect(traversal.error).toContain('escapes workspace jail');

    expect(() => guard.assertContained('../outside-file.txt')).toThrow(WorkspaceSecurityError);
  });

  it('blocks encoded path traversal variants (%2e%2e)', () => {
    const encoded = guard.resolveReadPath('%2e%2e/outside.txt');
    expect(encoded.allowed).toBe(false);
    expect(encoded.error).toContain('URL-encoded path traversal');
  });

  it('blocks null-byte injection attempts', () => {
    const nullByte = guard.resolveReadPath('src/App.tsx\0.jpg');
    expect(nullByte.allowed).toBe(false);
    expect(nullByte.error).toContain('Null byte detected');
  });

  it('blocks Windows alternate data streams (file:stream)', () => {
    const ads = guard.resolveReadPath('src/App.tsx:hidden_stream');
    expect(ads.allowed).toBe(false);
    expect(ads.error).toContain('Alternate Data Stream');
  });

  it('blocks Windows reserved DOS devices (CON, PRN, AUX, NUL)', () => {
    const con = guard.resolveReadPath('CON');
    expect(con.allowed).toBe(false);
    expect(con.error).toContain('Reserved system device name');
  });

  it('blocks sensitive files (.env, secrets)', () => {
    const envCheck = guard.resolveReadPath('.env');
    expect(envCheck.allowed).toBe(false);
    expect(envCheck.error).toContain('sensitive credential or secret');
  });

  it('detects and blocks symlinks that point outside the project root', () => {
    const symlinkPath = path.join(tempWorkspace, 'outside-symlink');
    try {
      fs.symlinkSync(outsideDir, symlinkPath, 'junction');
    } catch {
      // Symlink creation might require admin on Windows if not developer mode, skip if error
      return;
    }

    const check = guard.resolveReadPath('outside-symlink/secret-outside.txt');
    expect(check.allowed).toBe(false);
    expect(check.error).toContain('escapes workspace jail');
  });

  it('identifies system forbidden paths correctly', () => {
    expect(isSystemForbiddenPath('C:\\Windows')).toBe(true);
    expect(isSystemForbiddenPath('C:\\Windows\\System32')).toBe(true);
    expect(isSystemForbiddenPath('C:\\Program Files')).toBe(true);
    expect(isSystemForbiddenPath('C:\\')).toBe(true);
    expect(isSystemForbiddenPath('/')).toBe(true);
    expect(isSystemForbiddenPath(tempWorkspace)).toBe(false);
  });

  it('guarantees technical incapacity: WorkspaceGuard has zero file-mutation methods', () => {
    const guardAny = guard as any;
    expect(guardAny.writeFile).toBeUndefined();
    expect(guardAny.editFile).toBeUndefined();
    expect(guardAny.deleteFile).toBeUndefined();
    expect(guardAny.renameFile).toBeUndefined();
    expect(guardAny.createDirectory).toBeUndefined();
    expect(guardAny.executeShell).toBeUndefined();
    expect(guardAny.runCommand).toBeUndefined();

    // isAllowed rejects any operation other than read
    expect(guard.isAllowed('src/App.tsx', 'write' as any)).toBe(false);
    expect(guard.isAllowed('src/App.tsx', 'delete' as any)).toBe(false);
    expect(guard.isAllowed('src/App.tsx', 'execute' as any)).toBe(false);
    expect(guard.isAllowed('src/App.tsx', 'read')).toBe(true);
  });
});
