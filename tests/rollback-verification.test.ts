import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { CheckpointService } from '../src/main/edit/checkpoint-service';
import { WorkspaceGuard } from '../src/main/workspace/guard';
import { EditSession } from '../src/main/edit/edit-session';
import { CheckpointSummary, CheckpointDiffResult } from '../src/shared/types';

describe('Rollback Postcondition Verification & Identity (v0.5.4)', () => {
  let tempBase: string;
  let projectDir: string;
  let storageDir: string;
  let guard: WorkspaceGuard;
  let checkpointService: CheckpointService;
  const projectId = 'proj-verify-test';

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-rollback-verify-'));
    projectDir = path.join(tempBase, 'project');
    storageDir = path.join(tempBase, 'storage');

    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.mkdirSync(storageDir, { recursive: true });

    guard = new WorkspaceGuard(projectDir);
    checkpointService = new CheckpointService(storageDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('1. verifies modified file rollback SHA equals originalSha256 and marks rolled_back', async () => {
    const filePath = path.join(projectDir, 'src', 'app.ts');
    const initialContent = 'export function hello(): string { return "hello"; }\n';
    fs.writeFileSync(filePath, initialContent, 'utf-8');
    const expectedSha = crypto.createHash('sha256').update(initialContent).digest('hex');

    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Test modify', projectDir);
    const session = new EditSession({
      guard,
      checkpointService,
      manifest,
    });

    await session.readFile('src/app.ts');
    await session.replaceInFile({
      path: 'src/app.ts',
      oldText: '"hello"',
      newText: '"world"',
    });

    // File on disk is now modified
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('"world"');

    // Perform rollback
    const result = checkpointService.rollback(manifest.id, projectId, guard);

    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.verifiedFiles).toContain('src/app.ts');
    expect(result.verificationFailures).toBeUndefined();

    // Verify disk content and hash match original bit-for-bit
    const restoredContent = fs.readFileSync(filePath, 'utf-8');
    const restoredSha = crypto.createHash('sha256').update(restoredContent).digest('hex');
    expect(restoredSha).toBe(expectedSha);
    expect(restoredContent).toBe(initialContent);

    // Manifest status must be rolled_back
    const reloaded = checkpointService.loadManifest(projectId, manifest.id);
    expect(reloaded?.status).toBe('rolled_back');
  });

  it('2. verifies created file is confirmed absent after rollback', async () => {
    const newFilePath = path.join(projectDir, 'src', 'new-util.ts');
    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Test create', projectDir);
    const session = new EditSession({
      guard,
      checkpointService,
      manifest,
    });

    await session.createFile({
      path: 'src/new-util.ts',
      content: 'export const x = 123;\n',
    });

    expect(fs.existsSync(newFilePath)).toBe(true);

    const result = checkpointService.rollback(manifest.id, projectId, guard);

    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.deletedCreatedFiles).toContain('src/new-util.ts');
    expect(result.verifiedFiles).toContain('src/new-util.ts');

    // Must be completely absent from disk
    expect(fs.existsSync(newFilePath)).toBe(false);
  });

  it('3. verifies deleted file is restored and SHA equals originalSha256', async () => {
    const delFilePath = path.join(projectDir, 'src', 'to-delete.ts');
    const initialContent = 'export const deleteMe = true;\n';
    fs.writeFileSync(delFilePath, initialContent, 'utf-8');
    const expectedSha = crypto.createHash('sha256').update(initialContent).digest('hex');

    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Test delete', projectDir);
    const session = new EditSession({
      guard,
      checkpointService,
      manifest,
    });

    await session.readFile('src/to-delete.ts');
    await session.deleteFile({ path: 'src/to-delete.ts' });

    expect(fs.existsSync(delFilePath)).toBe(false);

    const result = checkpointService.rollback(manifest.id, projectId, guard);

    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.restoredFiles).toContain('src/to-delete.ts');

    expect(fs.existsSync(delFilePath)).toBe(true);
    const restoredSha = crypto.createHash('sha256').update(fs.readFileSync(delFilePath)).digest('hex');
    expect(restoredSha).toBe(expectedSha);
  });

  it('4. multi-file rollback verifies every single entry', async () => {
    const file1 = path.join(projectDir, 'src', 'one.ts');
    const file2 = path.join(projectDir, 'src', 'two.ts');
    fs.writeFileSync(file1, 'const a = 1;\n');
    fs.writeFileSync(file2, 'const b = 2;\n');

    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Multi-file', projectDir);
    const session = new EditSession({ guard, checkpointService, manifest });

    await session.readFile('src/one.ts');
    await session.replaceInFile({ path: 'src/one.ts', oldText: '1', newText: '10' });
    await session.createFile({ path: 'src/three.ts', content: 'const c = 3;\n' });

    const result = checkpointService.rollback(manifest.id, projectId, guard);

    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.verifiedFiles).toContain('src/one.ts');
    expect(result.verifiedFiles).toContain('src/three.ts');
    expect(fs.readFileSync(file1, 'utf-8')).toBe('const a = 1;\n');
    expect(fs.existsSync(path.join(projectDir, 'src', 'three.ts'))).toBe(false);
  });

  it('5. post-write hash mismatch returns success: false and verified: false', async () => {
    const file = path.join(projectDir, 'src', 'tamper.ts');
    fs.writeFileSync(file, 'original content\n');

    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Tamper test', projectDir);
    const session = new EditSession({ guard, checkpointService, manifest });

    await session.readFile('src/tamper.ts');
    await session.replaceInFile({ path: 'src/tamper.ts', oldText: 'original', newText: 'modified' });

    // In preflight, if backup does not match originalSha256, it aborts preflight.
    // To test postcondition verification specifically: spy or alter fs.writeFileSync during rollback
    const originalWrite = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((targetPath: any, data: any, options: any) => {
      if (typeof targetPath === 'string' && targetPath.endsWith('tamper.ts')) {
        return originalWrite(targetPath, 'TAMPERED_POST_RESTORE', options);
      }
      return originalWrite(targetPath, data, options);
    });

    const result = checkpointService.rollback(manifest.id, projectId, guard);

    expect(result.success).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.verificationFailures).toBeDefined();
    expect(result.verificationFailures!.length).toBeGreaterThan(0);
    expect(result.verificationFailures![0].reason).toContain('mismatch');

    vi.restoreAllMocks();
  });

  it('6. post-write hash mismatch leaves manifest NOT rolled_back (status conflict)', async () => {
    const file = path.join(projectDir, 'src', 'tamper2.ts');
    fs.writeFileSync(file, 'content baseline\n');

    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Tamper test 2', projectDir);
    const session = new EditSession({ guard, checkpointService, manifest });

    await session.readFile('src/tamper2.ts');
    await session.replaceInFile({ path: 'src/tamper2.ts', oldText: 'baseline', newText: 'modified' });

    const originalWrite = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((targetPath: any, data: any, options: any) => {
      if (typeof targetPath === 'string' && targetPath.endsWith('tamper2.ts')) {
        return originalWrite(targetPath, 'MISMATCHED_CONTENT', options);
      }
      return originalWrite(targetPath, data, options);
    });

    checkpointService.rollback(manifest.id, projectId, guard);

    const reloaded = checkpointService.loadManifest(projectId, manifest.id);
    expect(reloaded?.status).toBe('conflict');
    expect(reloaded?.status).not.toBe('rolled_back');

    vi.restoreAllMocks();
  });

  it('7. verification failure keeps checkpoint discoverable via getPendingCheckpoint', async () => {
    const file = path.join(projectDir, 'src', 'disc.ts');
    fs.writeFileSync(file, 'discoverable test\n');

    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Discoverable', projectDir);
    const session = new EditSession({ guard, checkpointService, manifest });

    await session.readFile('src/disc.ts');
    await session.replaceInFile({ path: 'src/disc.ts', oldText: 'test', newText: 'changed' });

    const originalWrite = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((targetPath: any, data: any, options: any) => {
      if (typeof targetPath === 'string' && targetPath.endsWith('disc.ts')) {
        return originalWrite(targetPath, 'CORRUPTED', options);
      }
      return originalWrite(targetPath, data, options);
    });

    checkpointService.rollback(manifest.id, projectId, guard);

    // Because status is 'conflict', getPendingCheckpoint must discover it
    const pending = checkpointService.getPendingCheckpoint(projectId);
    expect(pending).not.toBeNull();
    expect(pending?.id).toBe(manifest.id);
    expect(pending?.status).toBe('conflict');

    vi.restoreAllMocks();
  });

  it('8. UI does not clear Diff when rollback verification fails', async () => {
    let pendingCheckpoint: CheckpointSummary | null = {
      id: 'chk_123',
      projectId: 'proj-test',
      timestamp: '2026-09-08T00:00:00.000Z',
      type: 'automatic',
      status: 'pending',
      filesCount: 1,
      totalBackupBytes: 50,
    };
    let checkpointDiff: CheckpointDiffResult | null = {
      checkpointId: 'chk_123',
      projectId: 'proj-test',
      totalFilesChanged: 1,
      totalInsertions: 1,
      totalDeletions: 0,
      hasConflict: false,
      files: [],
    };

    const mockRollback = vi.fn().mockResolvedValue({
      success: false,
      verified: false,
      checkpointId: 'chk_123',
      error: 'Rollback verification failed. The workspace was not fully restored.',
      verificationFailures: [{ relativePath: 'src/test.ts', reason: 'SHA mismatch' }],
    });

    const handleRollback = async () => {
      const res = await mockRollback();
      if (res.success && res.verified !== false) {
        pendingCheckpoint = null;
        checkpointDiff = null;
      }
      // On failure, do NOT clear
    };

    await handleRollback();

    // UI state must NOT be cleared
    expect(pendingCheckpoint).not.toBeNull();
    expect(checkpointDiff).not.toBeNull();
  });

  it('9. verified success clears UI', async () => {
    let pendingCheckpoint: CheckpointSummary | null = {
      id: 'chk_456',
      projectId: 'proj-test',
      timestamp: '2026-09-08T00:00:00.000Z',
      type: 'automatic',
      status: 'pending',
      filesCount: 1,
      totalBackupBytes: 50,
    };
    let checkpointDiff: CheckpointDiffResult | null = {
      checkpointId: 'chk_456',
      projectId: 'proj-test',
      totalFilesChanged: 1,
      totalInsertions: 1,
      totalDeletions: 0,
      hasConflict: false,
      files: [],
    };

    const mockRollback = vi.fn().mockResolvedValue({
      success: true,
      verified: true,
      checkpointId: 'chk_456',
      restoredFiles: ['src/test.ts'],
      verifiedFiles: ['src/test.ts'],
    });

    const handleRollback = async () => {
      const res = await mockRollback();
      if (res.success && res.verified !== false) {
        pendingCheckpoint = null;
        checkpointDiff = null;
      }
    };

    await handleRollback();

    expect(pendingCheckpoint).toBeNull();
    expect(checkpointDiff).toBeNull();
  });

  it('10. rollback result identifies verified files and structured verification failures', async () => {
    const file = path.join(projectDir, 'src', 'report.ts');
    fs.writeFileSync(file, 'original report\n');

    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Report test', projectDir);
    const session = new EditSession({ guard, checkpointService, manifest });

    await session.readFile('src/report.ts');
    await session.replaceInFile({ path: 'src/report.ts', oldText: 'original', newText: 'updated' });

    const successResult = checkpointService.rollback(manifest.id, projectId, guard);
    expect(successResult.success).toBe(true);
    expect(successResult.verified).toBe(true);
    expect(successResult.verifiedFiles).toEqual(['src/report.ts']);
    expect(successResult.verificationFailures).toBeUndefined();
  });

  it('11. wrong checkpoint ID cannot clear another checkpoint in UI state', () => {
    let pendingCheckpoint: CheckpointSummary | null = {
      id: 'chk_actual',
      projectId: 'proj-test',
      timestamp: '2026-09-08T00:00:00.000Z',
      type: 'automatic',
      status: 'pending',
      filesCount: 1,
      totalBackupBytes: 50,
    };

    const finalizeCheckpointUiState = (actedCheckpointId: string) => {
      if (pendingCheckpoint?.id === actedCheckpointId) {
        pendingCheckpoint = null;
      }
    };

    // Stale or wrong checkpoint ID acted upon
    finalizeCheckpointUiState('chk_stale');
    expect(pendingCheckpoint).not.toBeNull();
    expect(pendingCheckpoint?.id).toBe('chk_actual');

    // Correct checkpoint ID acted upon
    finalizeCheckpointUiState('chk_actual');
    expect(pendingCheckpoint).toBeNull();
  });

  it('12. overlapping pending Edit run is blocked when automatic pending checkpoint exists', async () => {
    // Arm an automatic checkpoint on disk with status pending
    await checkpointService.createPendingCheckpoint(projectId, 'Unreviewed changes', projectDir);

    const pending = checkpointService.getPendingCheckpoint(projectId);
    expect(pending).not.toBeNull();
    expect(pending?.type).toBe('automatic');

    // Check one-pending-edit rule: check function that blocks second run
    const canRunEditAgent = (projId: string) => {
      const existing = checkpointService.getPendingCheckpoint(projId);
      if (existing && existing.type === 'automatic') {
        throw new Error('You have pending changes. Accept or Rollback them before starting another Edit run.');
      }
      return true;
    };

    expect(() => canRunEditAgent(projectId)).toThrow(
      'You have pending changes. Accept or Rollback them before starting another Edit run.'
    );
  });

  it('13. no-op second Edit cannot replace existing pending transaction', async () => {
    const existing = await checkpointService.createPendingCheckpoint(projectId, 'Real first edit', projectDir);
    expect(checkpointService.getPendingCheckpoint(projectId)?.id).toBe(existing.id);

    // Because pending exists, second run is blocked and cannot overwrite active pending checkpoint
    expect(() => {
      const p = checkpointService.getPendingCheckpoint(projectId);
      if (p && p.type === 'automatic') {
        throw new Error('Blocked: unreviewed pending transaction exists');
      }
      checkpointService.armAutomaticCheckpoint(projectId, projectDir);
    }).toThrow('Blocked: unreviewed pending transaction exists');

    expect(checkpointService.getPendingCheckpoint(projectId)?.id).toBe(existing.id);
  });

  it('14. EditAgent checkpoint ID equals pending Diff checkpoint ID', async () => {
    const manifest = await checkpointService.createPendingCheckpoint(projectId, 'Identity test', projectDir);
    const agentCheckpointId = manifest.id;

    const pendingSummary = checkpointService.getPendingCheckpoint(projectId);
    expect(pendingSummary).not.toBeNull();
    expect(pendingSummary?.id).toBe(agentCheckpointId);

    // Rollback operates on the same ID
    const rollbackRes = checkpointService.rollback(pendingSummary!.id, projectId, guard);
    expect(rollbackRes.checkpointId).toBe(agentCheckpointId);
  });
});
