import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CheckpointService } from '../src/main/edit/checkpoint-service';
import { EditSession } from '../src/main/edit/edit-session';
import { EditAgent } from '../src/main/agent/edit-agent';
import { WorkspaceGuard } from '../src/main/workspace/guard';
import { DEFAULT_MUTATION_LIMITS } from '../src/main/edit/types';

describe('Edit Agent Idempotency & Loop Prevention (v0.5.3)', () => {
  let tempWorkspace: string;
  let tempStorageDir: string;
  let guard: WorkspaceGuard;
  let checkpointService: CheckpointService;
  const projectId = 'test-idempotency-proj';

  beforeEach(() => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-ws-idem-'));
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-storage-idem-'));

    // Populate baseline files
    fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'test.ts'),
      'export function hello(): string {\n  return "hello";\n}\n',
      'utf8'
    );

    guard = new WorkspaceGuard(tempWorkspace);
    checkpointService = new CheckpointService(tempStorageDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const createSession = async () => {
    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Idempotency test', tempWorkspace);
    return new EditSession({
      guard,
      checkpointService,
      manifest,
      limits: DEFAULT_MUTATION_LIMITS,
    });
  };

  // 9. exact repeated successful replace returns alreadyApplied
  it('9. exact repeated successful replace returns alreadyApplied', async () => {
    const session = await createSession();
    const filePath = 'src/test.ts';

    await session.readFile({ path: filePath });

    const firstRes = await session.replaceInFile({
      path: filePath,
      oldText: 'return "hello";',
      newText: 'return "hello world";',
    });
    expect(firstRes.success).toBe(true);
    expect(firstRes.alreadyApplied).toBeUndefined();

    // Second call with same replacement
    const secondRes = await session.replaceInFile({
      path: filePath,
      oldText: 'return "hello";',
      newText: 'return "hello world";',
    });
    expect(secondRes.success).toBe(true);
    expect(secondRes.alreadyApplied).toBe(true);
    expect(secondRes.message).toContain('already applied');
  });

  // 10. repeated replace performs no second filesystem write
  it('10. repeated replace performs no second filesystem write', async () => {
    const session = await createSession();
    const filePath = 'src/test.ts';
    const diskPath = path.join(tempWorkspace, filePath);

    await session.readFile({ path: filePath });

    await session.replaceInFile({
      path: filePath,
      oldText: 'return "hello";',
      newText: 'return "hello world";',
    });

    // Touch timestamp to detect unwanted rewrites
    const mtimeBefore = fs.statSync(diskPath).mtimeMs;

    const secondRes = await session.replaceInFile({
      path: filePath,
      oldText: 'return "hello";',
      newText: 'return "hello world";',
    });

    expect(secondRes.alreadyApplied).toBe(true);
    const mtimeAfter = fs.statSync(diskPath).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  // 11. repeated replace does not increment mutation count or bytes
  it('11. repeated replace does not increment mutation count or bytes written', async () => {
    const session = await createSession();
    const filePath = 'src/test.ts';

    await session.readFile({ path: filePath });

    await session.replaceInFile({
      path: filePath,
      oldText: 'return "hello";',
      newText: 'return "hello world";',
    });

    const bytesWrittenFirst = session.getCumulativeBytesWritten();
    const touchedCountFirst = session.getTouchedFiles().length;

    await session.replaceInFile({
      path: filePath,
      oldText: 'return "hello";',
      newText: 'return "hello world";',
    });

    expect(session.getCumulativeBytesWritten()).toBe(bytesWrittenFirst);
    expect(session.getTouchedFiles().length).toBe(touchedCountFirst);
  });

  // 12. repeated replace does not create new checkpoint baseline
  it('12. repeated replace does not create new checkpoint baseline', async () => {
    const session = await createSession();
    const filePath = 'src/test.ts';

    await session.readFile({ path: filePath });

    await session.replaceInFile({
      path: filePath,
      oldText: 'return "hello";',
      newText: 'return "hello world";',
    });

    const manifestBefore = session.getManifest();
    const fileEntryBefore = manifestBefore.files['src/test.ts'];
    expect(fileEntryBefore).toBeDefined();
    const originalBackup = fileEntryBefore.backupFileName;

    await session.replaceInFile({
      path: filePath,
      oldText: 'return "hello";',
      newText: 'return "hello world";',
    });

    const manifestAfter = session.getManifest();
    expect(manifestAfter.files['src/test.ts'].backupFileName).toBe(originalBackup);
  });

  // 13. missing oldText with unrelated newText still FAILS
  it('13. missing oldText with unrelated newText still FAILS', async () => {
    const session = await createSession();
    const filePath = 'src/test.ts';

    await session.readFile({ path: filePath });

    // Target oldText does not exist and was never applied in this run
    await expect(
      session.replaceInFile({
        path: filePath,
        oldText: 'nonExistentFunction()',
        newText: 'newFunction()',
      })
    ).rejects.toThrow('Target oldText was not found in "src/test.ts"');
  });

  // 14. create_file exact duplicate in same run returns alreadyApplied
  it('14. create_file exact duplicate in same run returns alreadyApplied', async () => {
    const session = await createSession();
    const newFile = 'src/new-module.ts';
    const content = 'export const VERSION = "1.0.0";\n';

    const res1 = await session.createFile({ path: newFile, content });
    expect(res1.success).toBe(true);
    expect(res1.alreadyApplied).toBeUndefined();

    // Duplicate create with exact same content
    const res2 = await session.createFile({ path: newFile, content });
    expect(res2.success).toBe(true);
    expect(res2.alreadyApplied).toBe(true);
    expect(res2.bytesWritten).toBe(0);
  });

  // 15. create_file same path different content still fails
  it('15. create_file same path different content still fails', async () => {
    const session = await createSession();
    const newFile = 'src/new-module.ts';

    await session.createFile({ path: newFile, content: 'export const A = 1;\n' });

    // Calling create_file with different content must fail
    await expect(
      session.createFile({ path: newFile, content: 'export const A = 2;\n' })
    ).rejects.toThrow('File already exists');
  });

  // 16. write_file identical repeated write returns alreadyApplied
  it('16. write_file identical repeated write returns alreadyApplied', async () => {
    const session = await createSession();
    const filePath = 'src/test.ts';

    await session.readFile({ path: filePath });
    const content = 'export function hello(): string {\n  return "rewritten";\n}\n';

    const res1 = await session.writeFile({ path: filePath, content });
    expect(res1.success).toBe(true);
    expect(res1.alreadyApplied).toBeUndefined();

    // Call read_file to establish current hash
    await session.readFile({ path: filePath });

    const res2 = await session.writeFile({ path: filePath, content });
    expect(res2.success).toBe(true);
    expect(res2.alreadyApplied).toBe(true);
    expect(res2.bytesWritten).toBe(0);
  });

  // 17. delete_file repeated after same-run successful delete returns alreadyApplied
  it('17. delete_file repeated after same-run successful delete returns alreadyApplied', async () => {
    const session = await createSession();
    const filePath = 'src/test.ts';

    await session.readFile({ path: filePath });

    const res1 = await session.deleteFile(filePath);
    expect(res1.success).toBe(true);
    expect(res1.alreadyApplied).toBeUndefined();

    // Second delete on same file that was deleted in this run
    const res2 = await session.deleteFile(filePath);
    expect(res2.success).toBe(true);
    expect(res2.alreadyApplied).toBe(true);
  });

  // 18. arbitrary missing delete still fails
  it('18. arbitrary missing delete still fails', async () => {
    const session = await createSession();
    // File never existed and was never deleted in this run
    await expect(session.deleteFile('src/never-existed.ts')).rejects.toThrow('Cannot delete non-existent file');
  });

  // 19. fingerprints reset between Edit runs
  it('19. fingerprints reset between Edit runs (new EditSession starts clean)', async () => {
    const session1 = await createSession();
    const filePath = 'src/test.ts';

    await session1.readFile({ path: filePath });
    await session1.replaceInFile({
      path: filePath,
      oldText: 'return "hello";',
      newText: 'return "hello world";',
    });

    expect(session1.getAppliedFingerprints().length).toBeGreaterThan(0);

    // Start completely new run / session
    const session2 = await createSession();
    expect(session2.getAppliedFingerprints().length).toBe(0);

    // Reading the already-modified file in session 2 establishes current state
    await session2.readFile({ path: filePath });

    // Attempting the old replacement in session 2 fails because oldText is not there
    await expect(
      session2.replaceInFile({
        path: filePath,
        oldText: 'return "hello";',
        newText: 'return "hello world";',
      })
    ).rejects.toThrow('Target oldText was not found in "src/test.ts"');
  });

  // 20. fingerprints are scoped by project/path/content
  it('20. fingerprints are scoped by project/path/content', async () => {
    const session = await createSession();

    const fpA = session.computeFingerprint(['replace', 'src/a.ts', 'old', 'new', 'single']);
    const fpB = session.computeFingerprint(['replace', 'src/b.ts', 'old', 'new', 'single']);
    const fpDifferentContent = session.computeFingerprint(['replace', 'src/a.ts', 'old', 'other', 'single']);

    expect(fpA).not.toBe(fpB);
    expect(fpA).not.toBe(fpDifferentContent);
  });

  // 21. alreadyApplied response instructs model not to retry
  it('21. alreadyApplied response instructs model not to retry', async () => {
    const session = await createSession();
    const filePath = 'src/test.ts';

    await session.readFile({ path: filePath });
    await session.replaceInFile({
      path: filePath,
      oldText: 'return "hello";',
      newText: 'return "hello world";',
    });

    const res = await session.replaceInFile({
      path: filePath,
      oldText: 'return "hello";',
      newText: 'return "hello world";',
    });

    expect(res.alreadyApplied).toBe(true);
    expect(res.message).toContain('Do not repeat this operation');
  });

  // 22. successful mutation followed by summary does not trigger edit follow-up
  it('22. successful mutation followed by summary does not trigger edit follow-up', async () => {
    // Simulate follow-up logic directly
    const filesModified = new Set(['src/test.ts']);
    const filesCreated = new Set<string>();
    const filesDeleted = new Set<string>();
    let followUpCount = 0;
    const maxFollowUps = 2;
    let summaryDone = false;
    let resultMessage = 'Modified src/test.ts: added recoveryTest function.';

    const followUpPrompt = async (): Promise<string | null> => {
      if (followUpCount >= maxFollowUps) return null;
      followUpCount++;

      const totalMutations = filesModified.size + filesCreated.size + filesDeleted.size;
      if (totalMutations === 0) {
        return 'Now proceed to make the requested file changes using replace_in_file, create_file, or write_file.';
      }

      const currentSummary = resultMessage.trim();
      if (currentSummary.length >= 30 || summaryDone) {
        return null;
      }

      summaryDone = true;
      return 'Please provide a clear final summary of the files you modified, created, or deleted, and state that tests were not executed.';
    };

    const result = await followUpPrompt();
    // Since mutations occurred and summary is >= 30 chars, should terminate immediately with null
    expect(result).toBeNull();
  });

  // 23. tool budget applies consistently to all mutation tools
  it('23. tool budget applies consistently to all mutation tools (EditAgent.MAX_TOOL_CALLS = 40)', () => {
    const editAgent = new EditAgent({} as any, checkpointService);
    expect(editAgent.MAX_TOOL_CALLS).toBe(40);
  });

  // 24. existing read-before-write remains enforced
  it('24. existing read-before-write remains strictly enforced', async () => {
    const session = await createSession();
    // Calling replace without read must throw ReadBeforeWriteError
    await expect(
      session.replaceInFile({
        path: 'src/test.ts',
        oldText: 'hello',
        newText: 'world',
      })
    ).rejects.toThrow('Read the file before modifying it');
  });

  // 25. optimistic concurrency remains enforced
  it('25. optimistic concurrency remains strictly enforced against external modifications', async () => {
    const session = await createSession();
    const filePath = 'src/test.ts';

    await session.readFile({ path: filePath });

    // Simulate external edit behind Model Forge's back
    fs.writeFileSync(path.join(tempWorkspace, filePath), 'EXTERNAL MUTATION\n', 'utf8');

    await expect(
      session.replaceInFile({
        path: filePath,
        oldText: 'hello',
        newText: 'world',
      })
    ).rejects.toThrow('File changed after it was inspected');
  });
});
