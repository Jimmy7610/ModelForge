import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceGuard } from '../src/main/workspace/guard';
import { MutationPolicy } from '../src/main/edit/mutation-policy';
import { MutationBlockedError } from '../src/main/edit/errors';

describe('Mutation Security & Bounds Policy (Pass 5)', () => {
  let tempWorkspace: string;
  let guard: WorkspaceGuard;
  let policy: MutationPolicy;

  beforeEach(() => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-mut-sec-'));
    fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkspace, '.git'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkspace, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(tempWorkspace, 'src', 'index.ts'), 'export const a = 1;\n', 'utf8');
    fs.writeFileSync(path.join(tempWorkspace, '.env'), 'SECRET_KEY=12345\n', 'utf8');

    guard = new WorkspaceGuard(tempWorkspace);
    policy = new MutationPolicy();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('blocks path traversal and outside workspace escapes', () => {
    const outside = guard.resolveWritePath('../../outside.txt');
    expect(outside.allowed).toBe(false);

    expect(() =>
      policy.validateMutation({
        operation: 'create',
        relativePath: '../../escape.ts',
        absolutePath: path.resolve(tempWorkspace, '../../escape.ts'),
        workspaceRoot: tempWorkspace,
      })
    ).toThrow(MutationBlockedError);
  });

  it('blocks null bytes in file paths', () => {
    const nullByte = guard.resolveWritePath('src/file\0.ts');
    expect(nullByte.allowed).toBe(false);
  });

  it('blocks Windows Alternate Data Streams (ADS)', () => {
    const ads = guard.resolveWritePath('src/file.ts:hidden');
    expect(ads.allowed).toBe(false);
  });

  it('blocks sensitive credential and secret files', () => {
    const sensitiveFiles = [
      '.env',
      '.env.local',
      '.env.production',
      '.git/config',
      'id_rsa',
      'id_ed25519',
      '.npmrc',
      '.bashrc',
      '.ssh/authorized_keys',
    ];

    for (const file of sensitiveFiles) {
      const res = guard.resolveWritePath(file);
      expect(res.allowed).toBe(false);

      expect(() =>
        policy.validateMutation({
          operation: 'write',
          relativePath: file,
          absolutePath: path.join(tempWorkspace, file),
          workspaceRoot: tempWorkspace,
        })
      ).toThrow(MutationBlockedError);
    }
  });

  it('blocks modifications in build and vendor directories', () => {
    const buildDirs = ['node_modules/pkg/index.js', 'dist/bundle.js', '.next/server.js', 'build/main.js'];

    for (const file of buildDirs) {
      expect(() =>
        policy.validateMutation({
          operation: 'create',
          relativePath: file,
          absolutePath: path.join(tempWorkspace, file),
          workspaceRoot: tempWorkspace,
        })
      ).toThrow(MutationBlockedError);
    }
  });

  it('blocks binary and executable file extensions', () => {
    const disallowed = ['app.exe', 'lib.dll', 'binary.so', 'bundle.zip', 'archive.tar.gz', 'photo.png'];

    for (const file of disallowed) {
      expect(() =>
        policy.validateMutation({
          operation: 'create',
          relativePath: file,
          absolutePath: path.join(tempWorkspace, file),
          workspaceRoot: tempWorkspace,
        })
      ).toThrow(MutationBlockedError);
    }
  });

  it('allows safe text/source file extensions', () => {
    const allowed = [
      'src/App.tsx',
      'src/main.ts',
      'src/style.css',
      'package.json',
      'README.md',
      'docs/guide.html',
      'config.yaml',
      'data.json',
    ];

    for (const file of allowed) {
      expect(() =>
        policy.validateMutation({
          operation: 'create',
          relativePath: file,
          absolutePath: path.join(tempWorkspace, file),
          workspaceRoot: tempWorkspace,
        })
      ).not.toThrow();
    }
  });

  it('enforces single file write size limits (2MB)', () => {
    const oversized = 'x'.repeat(2 * 1024 * 1024 + 100);
    expect(() =>
      policy.validateMutation({
        operation: 'write',
        relativePath: 'src/large.ts',
        absolutePath: path.join(tempWorkspace, 'src', 'large.ts'),
        workspaceRoot: tempWorkspace,
        content: oversized,
      })
    ).toThrow(MutationBlockedError);
  });

  it('enforces session total size limits (10MB) and file count (50)', () => {
    const sessionTracker = { totalWrittenBytes: 10 * 1024 * 1024 + 1, modifiedFilesCount: 5 };
    expect(() =>
      policy.validateMutation({
        operation: 'write',
        relativePath: 'src/tiny.ts',
        absolutePath: path.join(tempWorkspace, 'src', 'tiny.ts'),
        workspaceRoot: tempWorkspace,
        content: 'hello',
        currentSessionStats: sessionTracker,
      })
    ).toThrow(MutationBlockedError);

    const countTracker = { totalWrittenBytes: 100, modifiedFilesCount: 51 };
    expect(() =>
      policy.validateMutation({
        operation: 'write',
        relativePath: 'src/tiny2.ts',
        absolutePath: path.join(tempWorkspace, 'src', 'tiny2.ts'),
        workspaceRoot: tempWorkspace,
        content: 'hello',
        currentSessionStats: countTracker,
      })
    ).toThrow(MutationBlockedError);
  });
});
