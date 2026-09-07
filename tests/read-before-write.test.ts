import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceGuard } from '../src/main/workspace/guard';
import { CheckpointService } from '../src/main/edit/checkpoint-service';
import { EditSession } from '../src/main/edit/edit-session';
import { ReadBeforeWriteError, ConcurrencyConflictError } from '../src/main/edit/errors';

describe('Read-Before-Write & Optimistic Concurrency (Pass 5)', () => {
  let tempWorkspace: string;
  let tempStorageDir: string;
  let guard: WorkspaceGuard;
  let checkpointService: CheckpointService;
  let session: EditSession;
  const projectId = 'test-proj-rbw';

  beforeEach(async () => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-ws-rbw-'));
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-storage-rbw-'));

    fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempWorkspace, 'src', 'utils.ts'), 'export const PI = 3.14;\n', 'utf8');

    guard = new WorkspaceGuard(tempWorkspace);
    checkpointService = new CheckpointService(tempStorageDir);
    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Test session');
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

  it('blocks replace_in_file on an unread existing file', async () => {
    await expect(
      session.replaceInFile({
        path: 'src/utils.ts',
        targetContent: 'PI = 3.14',
        replacementContent: 'PI = 3.14159',
      })
    ).rejects.toThrow(ReadBeforeWriteError);
  });

  it('blocks write_file on an unread existing file', async () => {
    await expect(
      session.writeFile({
        path: 'src/utils.ts',
        content: 'export const PI = 3.14159;\n',
      })
    ).rejects.toThrow(ReadBeforeWriteError);
  });

  it('allows write after reading the file', async () => {
    // 1. Read file first
    const readResult = await session.readFile('src/utils.ts');
    expect(readResult.content).toContain('3.14');

    // 2. Perform replacement
    const editResult = await session.replaceInFile({
      path: 'src/utils.ts',
      targetContent: '3.14',
      replacementContent: '3.14159',
    });

    expect(editResult.status).toBe('success');
    expect(fs.readFileSync(path.join(tempWorkspace, 'src', 'utils.ts'), 'utf8')).toBe(
      'export const PI = 3.14159;\n'
    );
  });

  it('detects external file modification between read and write (concurrency conflict)', async () => {
    // 1. Agent reads file
    await session.readFile('src/utils.ts');

    // 2. External program modifies file behind agent's back
    fs.writeFileSync(path.join(tempWorkspace, 'src', 'utils.ts'), 'export const PI = 3.14159265;\n', 'utf8');

    // 3. Agent tries to replace - must throw ConcurrencyConflictError
    await expect(
      session.replaceInFile({
        path: 'src/utils.ts',
        targetContent: '3.14',
        replacementContent: '3.14159',
      })
    ).rejects.toThrow(ConcurrencyConflictError);
  });

  it('allows sequential edits to the same file after initial read', async () => {
    await session.readFile('src/utils.ts');

    await session.replaceInFile({
      path: 'src/utils.ts',
      targetContent: 'PI = 3.14',
      replacementContent: 'PI = 3.14159',
    });

    // Second replacement without needing another readFile call
    const editResult = await session.replaceInFile({
      path: 'src/utils.ts',
      targetContent: 'PI',
      replacementContent: 'MATH_PI',
    });

    expect(editResult.status).toBe('success');
    expect(fs.readFileSync(path.join(tempWorkspace, 'src', 'utils.ts'), 'utf8')).toBe(
      'export const MATH_PI = 3.14159;\n'
    );
  });
});
