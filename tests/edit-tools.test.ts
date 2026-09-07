import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceGuard } from '../src/main/workspace/guard';
import { CheckpointService } from '../src/main/edit/checkpoint-service';
import { EditSession } from '../src/main/edit/edit-session';
import { MutationBlockedError } from '../src/main/edit/errors';

describe('Edit Tools: create_file, replace_in_file, write_file, delete_file (Pass 5)', () => {
  let tempWorkspace: string;
  let tempStorageDir: string;
  let guard: WorkspaceGuard;
  let checkpointService: CheckpointService;
  let session: EditSession;
  const projectId = 'test-proj-tools';

  beforeEach(async () => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-ws-tools-'));
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-storage-tools-'));

    fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempWorkspace, 'src', 'index.ts'), 'const x = 1;\nconst y = 1;\n', 'utf8');

    guard = new WorkspaceGuard(tempWorkspace);
    checkpointService = new CheckpointService(tempStorageDir);
    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Test tools session');
    session = new EditSession({
      guard,
      checkpointService,
      manifest,
    });
    await session.initialize();
  });

  afterEach(async () => {
    try {
      await session.close();
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('create_file', () => {
    it('creates new file and automatic parent directories', async () => {
      const res = await session.createFile({
        path: 'src/components/Button.tsx',
        content: 'export const Button = () => <button>Click</button>;\n',
      });

      expect(res.status).toBe('success');
      const diskPath = path.join(tempWorkspace, 'src', 'components', 'Button.tsx');
      expect(fs.existsSync(diskPath)).toBe(true);
      expect(fs.readFileSync(diskPath, 'utf8')).toContain('export const Button');

      const manifest = session.getManifest();
      expect(manifest?.files['src/components/Button.tsx']).toBeDefined();
      expect(manifest?.files['src/components/Button.tsx']?.existedBefore).toBe(false);
    });

    it('fails if file already exists', async () => {
      await expect(
        session.createFile({
          path: 'src/index.ts',
          content: 'new content',
        })
      ).rejects.toThrow(MutationBlockedError);
    });
  });

  describe('replace_in_file', () => {
    it('replaces unique occurrence cleanly', async () => {
      await session.readFile('src/index.ts');

      const res = await session.replaceInFile({
        path: 'src/index.ts',
        targetContent: 'const x = 1;',
        replacementContent: 'const x = 42;',
      });

      expect(res.status).toBe('success');
      expect(fs.readFileSync(path.join(tempWorkspace, 'src', 'index.ts'), 'utf8')).toBe(
        'const x = 42;\nconst y = 1;\n'
      );
    });

    it('fails if targetContent is not found', async () => {
      await session.readFile('src/index.ts');

      await expect(
        session.replaceInFile({
          path: 'src/index.ts',
          targetContent: 'const notFound = 999;',
          replacementContent: 'const fixed = 0;',
        })
      ).rejects.toThrow(MutationBlockedError);
    });

    it('fails if multiple occurrences found and allowMultiple is false', async () => {
      await session.readFile('src/index.ts');

      await expect(
        session.replaceInFile({
          path: 'src/index.ts',
          targetContent: '1;',
          replacementContent: '2;',
          allowMultiple: false,
        })
      ).rejects.toThrow(MutationBlockedError);
    });

    it('replaces all occurrences if allowMultiple is true', async () => {
      await session.readFile('src/index.ts');

      const res = await session.replaceInFile({
        path: 'src/index.ts',
        targetContent: '1;',
        replacementContent: '99;',
        allowMultiple: true,
      });

      expect(res.status).toBe('success');
      expect(fs.readFileSync(path.join(tempWorkspace, 'src', 'index.ts'), 'utf8')).toBe(
        'const x = 99;\nconst y = 99;\n'
      );
    });
  });

  describe('write_file', () => {
    it('completely overwrites existing file after read', async () => {
      await session.readFile('src/index.ts');

      const newContent = 'export function hello() {\n  return "world";\n}\n';
      const res = await session.writeFile({
        path: 'src/index.ts',
        content: newContent,
      });

      expect(res.status).toBe('success');
      expect(fs.readFileSync(path.join(tempWorkspace, 'src', 'index.ts'), 'utf8')).toBe(newContent);
    });
  });

  describe('delete_file', () => {
    it('deletes file and records deletion in checkpoint manifest', async () => {
      await session.readFile('src/index.ts');

      const res = await session.deleteFile('src/index.ts');
      expect(res.status).toBe('success');
      expect(fs.existsSync(path.join(tempWorkspace, 'src', 'index.ts'))).toBe(false);

      const manifest = session.getManifest();
      expect(manifest?.files['src/index.ts']).toBeDefined();
      expect(manifest?.files['src/index.ts']?.existedBefore).toBe(true);
      expect(manifest?.files['src/index.ts']?.lastAgentSha256).toBeUndefined();
    });

    it('blocks deletion of directories', async () => {
      await expect(session.deleteFile('src')).rejects.toThrow(MutationBlockedError);
    });
  });
});
