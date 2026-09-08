import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { CheckpointService } from '../src/main/edit/checkpoint-service';
import { CheckpointError } from '../src/main/edit/errors';
import { WorkspaceGuard } from '../src/main/workspace/guard';

describe('Process Checkpoint Safety & Postcondition Rollback (Tests 55-65)', () => {
  let tempStorageDir: string;
  let tempProjectDir: string;
  let checkpointService: CheckpointService;
  const projectId = 'test-proc-proj';

  beforeEach(() => {
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-ckpt-storage-'));
    tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-ckpt-proj-'));
    checkpointService = new CheckpointService(tempStorageDir);

    // Initial files in project
    fs.writeFileSync(path.join(tempProjectDir, 'index.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(tempProjectDir, 'helper.ts'), 'export const b = 2;');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 55: Pre-process snapshot creates a pending checkpoint
  it('55. arms pending checkpoint with pre-process safety snapshot', async () => {
    const manifest = await checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir);
    expect(manifest.status).toBe('pending');
    expect(manifest.files['index.ts']).toBeDefined();
    expect(manifest.files['helper.ts']).toBeDefined();

    const pending = checkpointService.getPendingCheckpoint(projectId);
    expect(pending).not.toBeNull();
    expect(pending?.id).toBe(manifest.id);
  });

  // Test 56: Pre-process snapshot saves backup files with correct SHA-256
  it('56. computes SHA-256 and writes .bak backup files', async () => {
    const manifest = await checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir);
    const entry = manifest.files['index.ts'];

    expect(entry.existedBefore).toBe(true);
    expect(entry.backupFileName).toBeDefined();

    const indexBuf = fs.readFileSync(path.join(tempProjectDir, 'index.ts'));
    const expectedSha = crypto.createHash('sha256').update(indexBuf).digest('hex');
    expect(entry.originalSha256).toBe(expectedSha);

    const backupPath = path.join(tempStorageDir, projectId, manifest.id, 'files', entry.backupFileName!);
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.readFileSync(backupPath, 'utf8')).toBe('export const a = 1;');
  });

  // Test 57: 100MB cumulative snapshot cap enforcement
  it('57. blocks execution and throws CheckpointError if project source exceeds 100 MB', async () => {
    // Create a 101 MB dummy file
    const largeFilePath = path.join(tempProjectDir, 'large.txt');
    const largeBuf = Buffer.alloc(101 * 1024 * 1024, 'x');
    fs.writeFileSync(largeFilePath, largeBuf);

    await expect(
      checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir)
    ).rejects.toThrow(CheckpointError);

    // Clean up large file
    fs.unlinkSync(largeFilePath);
  });

  // Test 58: Post-process scan detects modified source files
  it('58. detects modified source files after process execution', async () => {
    const manifest = await checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir);

    // Simulate process modifying index.ts
    fs.writeFileSync(path.join(tempProjectDir, 'index.ts'), 'export const a = 999; // modified by script');

    const changes = await checkpointService.scanForProcessSourceChanges(projectId, tempProjectDir, manifest.id);
    expect(changes.modifiedFiles).toContain('index.ts');
    expect(changes.createdFiles).toEqual([]);
    expect(changes.deletedFiles).toEqual([]);

    const updatedManifest = await checkpointService.getManifest(manifest.id, projectId);
    expect(updatedManifest?.files['index.ts'].lastAgentSha256).toBeDefined();
  });

  // Test 59: Post-process scan detects newly created source files
  it('59. detects newly created files after process execution', async () => {
    const manifest = await checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir);

    // Simulate process generating a new file
    fs.writeFileSync(path.join(tempProjectDir, 'generated.ts'), 'export const generated = true;');

    const changes = await checkpointService.scanForProcessSourceChanges(projectId, tempProjectDir, manifest.id);
    expect(changes.createdFiles).toContain('generated.ts');

    const updatedManifest = await checkpointService.getManifest(manifest.id, projectId);
    expect(updatedManifest?.files['generated.ts'].existedBefore).toBe(false);
  });

  // Test 60: Post-process scan detects deleted files
  it('60. detects deleted files after process execution', async () => {
    const manifest = await checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir);

    // Mark index.ts as modified first
    fs.writeFileSync(path.join(tempProjectDir, 'index.ts'), 'temp content');
    await checkpointService.scanForProcessSourceChanges(projectId, tempProjectDir, manifest.id);

    // Now delete index.ts
    fs.unlinkSync(path.join(tempProjectDir, 'index.ts'));

    const changes = await checkpointService.scanForProcessSourceChanges(projectId, tempProjectDir, manifest.id);
    expect(changes.deletedFiles).toContain('index.ts');
  });

  // Test 61: Ignores build output directories (dist/, node_modules/, etc.)
  it('61. ignores ephemeral build and output directories during scan', async () => {
    const manifest = await checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir);

    // Simulate build artifacts
    fs.mkdirSync(path.join(tempProjectDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(tempProjectDir, 'dist', 'bundle.js'), 'bundle content');
    fs.mkdirSync(path.join(tempProjectDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(tempProjectDir, 'node_modules', 'foo.js'), 'module');

    const changes = await checkpointService.scanForProcessSourceChanges(projectId, tempProjectDir, manifest.id);
    expect(changes.createdFiles).toEqual([]);
    expect(changes.modifiedFiles).toEqual([]);
  });

  // Test 62: Verified rollback restores original modified file and confirms SHA-256 on disk
  it('62. verified rollback restores exact original file on disk and verifies SHA-256', async () => {
    const initialBuf = fs.readFileSync(path.join(tempProjectDir, 'index.ts'));
    const initialSha = crypto.createHash('sha256').update(initialBuf).digest('hex');

    const manifest = await checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir);

    // Modify file
    fs.writeFileSync(path.join(tempProjectDir, 'index.ts'), 'MUTATED CONTENT');
    await checkpointService.scanForProcessSourceChanges(projectId, tempProjectDir, manifest.id);

    // Execute rollback
    const guard = new WorkspaceGuard(tempProjectDir);
    const rollbackResult = await checkpointService.rollbackCheckpoint(manifest.id, projectId, guard);
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.restoredFiles).toContain('index.ts');

    // VERIFY REAL FILESYSTEM
    const restoredBuf = fs.readFileSync(path.join(tempProjectDir, 'index.ts'));
    const restoredSha = crypto.createHash('sha256').update(restoredBuf).digest('hex');
    expect(restoredSha).toBe(initialSha);
    expect(restoredBuf.toString('utf8')).toBe('export const a = 1;');
  });

  // Test 63: Verified rollback deletes created files
  it('63. verified rollback deletes created files on disk', async () => {
    const manifest = await checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir);

    // Process creates new file
    const newFilePath = path.join(tempProjectDir, 'created_by_agent.ts');
    fs.writeFileSync(newFilePath, 'new content');
    await checkpointService.scanForProcessSourceChanges(projectId, tempProjectDir, manifest.id);

    expect(fs.existsSync(newFilePath)).toBe(true);

    const guard = new WorkspaceGuard(tempProjectDir);
    const rollbackResult = await checkpointService.rollbackCheckpoint(manifest.id, projectId, guard);
    expect(rollbackResult.success).toBe(true);

    // VERIFY FILE REMOVED FROM DISK
    expect(fs.existsSync(newFilePath)).toBe(false);
  });

  // Test 64: Verified rollback restores deleted original files
  it('64. verified rollback restores deleted original files to disk', async () => {
    const manifest = await checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir);

    // Delete helper.ts
    const helperPath = path.join(tempProjectDir, 'helper.ts');
    fs.unlinkSync(helperPath);
    expect(fs.existsSync(helperPath)).toBe(false);

    const guard = new WorkspaceGuard(tempProjectDir);
    const rollbackResult = await checkpointService.rollbackCheckpoint(manifest.id, projectId, guard);
    expect(rollbackResult.success).toBe(true);

    // VERIFY FILE RESTORED TO DISK
    expect(fs.existsSync(helperPath)).toBe(true);
    expect(fs.readFileSync(helperPath, 'utf8')).toBe('export const b = 2;');
  });

  // Test 65: Consecutive pre-process snapshots augment existing pending checkpoint
  it('65. augments existing pending checkpoint without duplicate backup entries', async () => {
    const manifest1 = await checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir);
    const initialBackupCount = Object.keys(manifest1.files).length;

    // Add a third file
    fs.writeFileSync(path.join(tempProjectDir, 'third.ts'), 'export const c = 3;');

    const manifest2 = await checkpointService.createPreProcessSafetySnapshot(projectId, tempProjectDir, manifest1.id);
    expect(manifest2.id).toBe(manifest1.id);
    expect(Object.keys(manifest2.files).length).toBe(initialBackupCount + 1);
    expect(manifest2.files['third.ts']).toBeDefined();
  });
});
