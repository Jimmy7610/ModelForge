import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CheckpointService } from '../src/main/edit/checkpoint-service';
import { WorkspaceGuard } from '../src/main/workspace/guard';

describe('CheckpointService & Safe Rollback (Pass 5)', () => {
  let tempWorkspace: string;
  let tempStorageDir: string;
  let guard: WorkspaceGuard;
  let checkpointService: CheckpointService;
  const projectId = 'test-proj-checkpoint';

  beforeEach(() => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-ws-cp-'));
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-storage-cp-'));

    // Populate initial files
    fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempWorkspace, 'src', 'main.ts'), 'console.log("initial");\n', 'utf8');
    fs.writeFileSync(path.join(tempWorkspace, 'README.md'), '# Original Readme\n', 'utf8');

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

  it('creates pending checkpoint with isolated storage outside workspace', async () => {
    const cp = await checkpointService.createPendingCheckpoint(projectId, 'Initial edit session');
    expect(cp.id).toBeDefined();
    expect(cp.status).toBe('pending');
    expect(cp.files).toEqual({});

    // Checkpoint must NOT be inside the project workspace
    const cpDir = path.join(tempStorageDir, projectId, cp.id);
    expect(fs.existsSync(cpDir)).toBe(true);
    expect(cpDir.startsWith(tempWorkspace)).toBe(false);
  });

  it('captures pre-mutation baseline snapshot once per file', async () => {
    const cp = await checkpointService.createPendingCheckpoint(projectId, 'Snapshot test', tempWorkspace);
    const mainTs = path.join(tempWorkspace, 'src', 'main.ts');

    await checkpointService.capturePreMutationSnapshot(cp.id, projectId, 'src/main.ts', mainTs);

    // Verify snapshot file created in storage
    const updatedCp = await checkpointService.getManifest(cp.id, projectId);
    const entry = updatedCp?.files['src/main.ts'];
    expect(entry).toBeDefined();
    expect(entry?.existedBefore).toBe(true);
    expect(entry?.backupFileName).toBeDefined();

    const snapshotPath = path.join(tempStorageDir, projectId, cp.id, 'files', entry!.backupFileName!);
    expect(fs.existsSync(snapshotPath)).toBe(true);
    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe('console.log("initial");\n');

    // Mutate the disk file
    fs.writeFileSync(mainTs, 'console.log("second edit");\n', 'utf8');

    // Second snapshot call must NOT overwrite original baseline snapshot
    await checkpointService.capturePreMutationSnapshot(cp.id, projectId, 'src/main.ts', mainTs);
    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe('console.log("initial");\n');
  });

  it('records file mutation and updates agent sha256', async () => {
    const cp = await checkpointService.createPendingCheckpoint(projectId, 'Mutation test', tempWorkspace);
    const mainTs = path.join(tempWorkspace, 'src', 'main.ts');

    await checkpointService.capturePreMutationSnapshot(cp.id, projectId, 'src/main.ts', mainTs);

    const newContent = 'console.log("agent edited content");\n';
    fs.writeFileSync(mainTs, newContent, 'utf8');

    await checkpointService.recordFileMutation(cp.id, projectId, 'src/main.ts', 'modify', mainTs);

    const updatedManifest = await checkpointService.getManifest(cp.id, projectId);
    expect(updatedManifest?.files['src/main.ts']).toBeDefined();
    expect(updatedManifest?.files['src/main.ts'].lastAgentSha256).toBeDefined();
  });

  it('rolls back modified, deleted, and newly created files to baseline', async () => {
    const cp = await checkpointService.createPendingCheckpoint(projectId, 'Rollback test', tempWorkspace);

    // 1. Modify src/main.ts
    const mainTs = path.join(tempWorkspace, 'src', 'main.ts');
    await checkpointService.capturePreMutationSnapshot(cp.id, projectId, 'src/main.ts', mainTs);
    fs.writeFileSync(mainTs, 'console.log("mutated by agent");\n', 'utf8');
    await checkpointService.recordFileMutation(cp.id, projectId, 'src/main.ts', 'modify', mainTs);

    // 2. Create new file src/extra.ts
    const extraTs = path.join(tempWorkspace, 'src', 'extra.ts');
    await checkpointService.capturePreMutationSnapshot(cp.id, projectId, 'src/extra.ts', extraTs);
    fs.writeFileSync(extraTs, 'export const extra = 1;\n', 'utf8');
    await checkpointService.recordFileMutation(cp.id, projectId, 'src/extra.ts', 'create', extraTs);

    // 3. Delete README.md
    const readme = path.join(tempWorkspace, 'README.md');
    await checkpointService.capturePreMutationSnapshot(cp.id, projectId, 'README.md', readme);
    fs.unlinkSync(readme);
    await checkpointService.recordFileMutation(cp.id, projectId, 'README.md', 'delete', readme);

    // Execute rollback
    const rollbackResult = await checkpointService.rollbackCheckpoint(cp.id, projectId, guard);
    expect(rollbackResult.success).toBe(true);

    // Verify main.ts restored to baseline
    expect(fs.readFileSync(mainTs, 'utf8')).toBe('console.log("initial");\n');

    // Verify extra.ts deleted
    expect(fs.existsSync(extraTs)).toBe(false);

    // Verify README.md resurrected
    expect(fs.existsSync(readme)).toBe(true);
    expect(fs.readFileSync(readme, 'utf8')).toBe('# Original Readme\n');
  });

  it('detects rollback conflict if user modified a file externally after agent edited it', async () => {
    const cp = await checkpointService.createPendingCheckpoint(projectId, 'Conflict test', tempWorkspace);
    const mainTs = path.join(tempWorkspace, 'src', 'main.ts');

    await checkpointService.capturePreMutationSnapshot(cp.id, projectId, 'src/main.ts', mainTs);
    fs.writeFileSync(mainTs, 'console.log("agent edited");\n', 'utf8');
    await checkpointService.recordFileMutation(cp.id, projectId, 'src/main.ts', 'modify', mainTs);

    // User externally modifies the file after the agent
    fs.writeFileSync(mainTs, 'console.log("user manually customized this!");\n', 'utf8');

    // Attempt rollback - must fail with conflict protection
    const rollbackResult = await checkpointService.rollbackCheckpoint(cp.id, projectId, guard);
    expect(rollbackResult.success).toBe(false);
    expect(rollbackResult.conflicts).toBeDefined();
    expect(rollbackResult.conflicts!.length).toBeGreaterThan(0);
    expect(rollbackResult.conflicts![0].relativePath).toBe('src/main.ts');

    // User's manual edit must be preserved intact!
    expect(fs.readFileSync(mainTs, 'utf8')).toBe('console.log("user manually customized this!");\n');
  });

  it('scans and recovers interrupted pending checkpoints across app restarts', async () => {
    // Create an unaccepted pending checkpoint
    const cp = await checkpointService.createPendingCheckpoint(projectId, 'Interrupted task', tempWorkspace);
    const mainTs = path.join(tempWorkspace, 'src', 'main.ts');
    await checkpointService.capturePreMutationSnapshot(cp.id, projectId, 'src/main.ts', mainTs);
    fs.writeFileSync(mainTs, 'console.log("half-finished mutation");\n', 'utf8');
    await checkpointService.recordFileMutation(cp.id, projectId, 'src/main.ts', 'modify', mainTs);

    // Simulate app restart with a fresh service instance
    const newService = new CheckpointService(tempStorageDir);
    const interrupted = await newService.scanForInterruptedCheckpoints(projectId);

    expect(interrupted).toHaveLength(1);
    expect(interrupted[0].id).toBe(cp.id);
    expect(interrupted[0].status).toBe('pending');
  });

  it('enforces retention policy keeping at most 5 checkpoints per project', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      const cp = await checkpointService.createPendingCheckpoint(projectId, `Checkpoint ${i}`, tempWorkspace);
      await checkpointService.acceptCheckpoint(cp.id, projectId, guard);
      ids.push(cp.id);
      // Ensure distinct timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const list = await checkpointService.listCheckpoints(projectId);
    expect(list.length).toBeLessThanOrEqual(5);

    // The oldest checkpoint should have been evicted
    const oldestManifest = await checkpointService.getManifest(ids[0], projectId);
    expect(oldestManifest).toBeNull();
  });
});
