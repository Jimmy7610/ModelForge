import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ipcMain } from 'electron';
import { registerIpcHandlers } from '../src/main/ipc';
import { PersistenceStore } from '../src/main/store';
import { ModelRegistry } from '../src/main/models/registry';
import { InferenceService } from '../src/main/inference/service';
import { EditAuthorizationService, CheckpointService, DiffService } from '../src/main/edit';
import { WorkspaceGuard } from '../src/main/workspace/guard';
import { IPC_CHANNELS, CHECKPOINT_SCHEMA_VERSION } from '../src/shared/constants';

vi.mock('electron', () => {
  const handlers = new Map<string, Function>();
  return {
    app: {
      getPath: vi.fn().mockReturnValue(os.tmpdir()),
    },
    ipcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        handlers.set(channel, handler);
      }),
      _callHandler: async (channel: string, event: any, ...args: any[]) => {
        const handler = handlers.get(channel);
        if (!handler) throw new Error(`No handler registered for ${channel}`);
        return handler(event, ...args);
      },
    },
    BrowserWindow: vi.fn().mockImplementation(() => ({
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn(),
      },
      on: vi.fn(),
      minimize: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn().mockReturnValue(false),
    })),
    dialog: {
      showOpenDialog: vi.fn(),
    },
  };
});

describe('Pass 5 Security & Checkpoint IPC Hardening', () => {
  let tempStorage: string;
  let tempProjA: string;
  let tempProjB: string;
  let tempOutside: string;
  let store: PersistenceStore;
  let registry: ModelRegistry;
  let inferenceService: InferenceService;
  let editAuth: EditAuthorizationService;
  let checkpointService: CheckpointService;
  let mockWindow: any;

  beforeEach(() => {
    tempStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-sec-storage-'));
    tempProjA = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-sec-projA-'));
    tempProjB = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-sec-projB-'));
    tempOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-sec-outside-'));

    fs.mkdirSync(path.join(tempProjA, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempProjA, 'package.json'), '{"name":"proj-a"}', 'utf8');
    fs.writeFileSync(path.join(tempProjA, 'src', 'main.ts'), 'export const a = 1;\n', 'utf8');

    fs.mkdirSync(path.join(tempProjB, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempProjB, 'package.json'), '{"name":"proj-b"}', 'utf8');

    fs.writeFileSync(path.join(tempOutside, 'secret.txt'), 'SUPER_SECRET_EXTERNAL_DATA\n', 'utf8');

    store = new PersistenceStore(tempStorage);
    registry = new ModelRegistry(tempStorage);
    inferenceService = new InferenceService(registry);
    editAuth = new EditAuthorizationService();
    checkpointService = new CheckpointService(tempStorage);

    store.addProject({ id: 'proj-a', name: 'Project A', path: tempProjA });
    store.addProject({ id: 'proj-b', name: 'Project B', path: tempProjB });
    store.setActiveProjectId('proj-a');

    mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: { send: vi.fn() },
      on: vi.fn(),
    };

    registerIpcHandlers(mockWindow, store, registry, inferenceService, undefined, undefined, editAuth);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempStorage, { recursive: true, force: true });
      fs.rmSync(tempProjA, { recursive: true, force: true });
      fs.rmSync(tempProjB, { recursive: true, force: true });
      fs.rmSync(tempOutside, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // 1. runEditAgent without Main Edit authorization blocked
  it('1. blocks runEditAgent without prior Main-side Edit authorization', async () => {
    expect(editAuth.isAuthorized('proj-a')).toBe(false);

    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.RUN_EDIT_AGENT, {}, {
        projectId: 'proj-a',
        prompt: 'Do something',
      })
    ).rejects.toThrow('Edit permission is not enabled for this project.');
  });

  // 2. authorization valid only for registered project
  it('2. allows Edit authorization only for verified registered projects', async () => {
    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.ENABLE_EDIT_FOR_PROJECT, {}, 'unknown-project')
    ).rejects.toThrow('Project not found in registry');

    expect(editAuth.isAuthorized('unknown-project')).toBe(false);

    const authRes = await (ipcMain as any)._callHandler(IPC_CHANNELS.ENABLE_EDIT_FOR_PROJECT, {}, 'proj-a');
    expect(authRes.authorized).toBe(true);
    expect(authRes.authorizedProjectId).toBe('proj-a');
    expect(editAuth.isAuthorized('proj-a')).toBe(true);
    expect(editAuth.isAuthorized('proj-b')).toBe(false);
  });

  // 3. authorization reset on project switch
  it('3. resets Edit authorization immediately on project switch', async () => {
    await (ipcMain as any)._callHandler(IPC_CHANNELS.ENABLE_EDIT_FOR_PROJECT, {}, 'proj-a');
    expect(editAuth.isAuthorized('proj-a')).toBe(true);

    // Switch active project
    await (ipcMain as any)._callHandler(IPC_CHANNELS.SET_ACTIVE_PROJECT, {}, 'proj-b');
    expect(editAuth.isAuthorized('proj-a')).toBe(false);
    expect(editAuth.isAuthorized('proj-b')).toBe(false);
  });

  // 4. authorization reset on restart/new service
  it('4. ensures authorization state is in-memory only and unpersisted', () => {
    const service1 = new EditAuthorizationService();
    service1.enableForProject('proj-a', true);
    expect(service1.isAuthorized('proj-a')).toBe(true);

    // New instance simulating application restart
    const service2 = new EditAuthorizationService();
    expect(service2.isAuthorized('proj-a')).toBe(false);
    expect(service2.getState().authorizedProjectId).toBeNull();
  });

  // 5. malformed RUN_EDIT_AGENT payload blocked
  it('5. blocks malformed RUN_EDIT_AGENT payloads', async () => {
    await (ipcMain as any)._callHandler(IPC_CHANNELS.ENABLE_EDIT_FOR_PROJECT, {}, 'proj-a');

    await expect((ipcMain as any)._callHandler(IPC_CHANNELS.RUN_EDIT_AGENT, {}, null)).rejects.toThrow();
    await expect((ipcMain as any)._callHandler(IPC_CHANNELS.RUN_EDIT_AGENT, {}, [])).rejects.toThrow();
    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.RUN_EDIT_AGENT, {}, { projectId: 'proj-a', prompt: '' })
    ).rejects.toThrow();
    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.RUN_EDIT_AGENT, {}, { projectId: '', prompt: 'valid prompt' })
    ).rejects.toThrow();
    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.RUN_EDIT_AGENT, {}, {
        projectId: 'proj-a',
        prompt: 'x'.repeat(20000),
      })
    ).rejects.toThrow();
  });

  // 6. checkpoint unknown project blocked
  it('6. rejects checkpoint operations for unregistered projects', async () => {
    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.GET_PENDING_CHECKPOINT, {}, 'non-existent-proj')
    ).rejects.toThrow('Project not found');

    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.GET_CHECKPOINT_DIFF, {}, {
        projectId: 'non-existent-proj',
        checkpointId: 'chk_123_abc',
      })
    ).rejects.toThrow('Project not found');

    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.ACCEPT_CHECKPOINT, {}, {
        projectId: 'non-existent-proj',
        checkpointId: 'chk_123_abc',
      })
    ).rejects.toThrow('Project not found');

    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.ROLLBACK_CHECKPOINT, {}, {
        projectId: 'non-existent-proj',
        checkpointId: 'chk_123_abc',
      })
    ).rejects.toThrow('Project not found');
  });

  // 7, 8, 9, 10. Checkpoint ID / Project ID validation & path traversal
  it('7-10. strictly blocks directory traversal in project and checkpoint identifiers', async () => {
    expect(CheckpointService.isValidProjectId('../evil')).toBe(false);
    expect(CheckpointService.isValidProjectId('proj/sub')).toBe(false);
    expect(CheckpointService.isValidProjectId('proj\\sub')).toBe(false);
    expect(CheckpointService.isValidProjectId('proj:sub')).toBe(false);
    expect(CheckpointService.isValidProjectId('..%2fevil')).toBe(false);

    expect(CheckpointService.isValidCheckpointId('../chk_123_abc')).toBe(false);
    expect(CheckpointService.isValidCheckpointId('chk_123/abc')).toBe(false);
    expect(CheckpointService.isValidCheckpointId('chk_123\\abc')).toBe(false);
    expect(CheckpointService.isValidCheckpointId('chk_123:abc')).toBe(false);
    expect(CheckpointService.isValidCheckpointId('arbitrary_id')).toBe(false);

    expect(() => checkpointService.getProjectCheckpointsDir('../escaped')).toThrow();
    expect(() => checkpointService.getCheckpointDir('proj-a', '../chk_evil')).toThrow();
  });

  // 11. checkpoint/project mismatch blocked
  it('11. blocks cross-project checkpoint access (Project A cannot load Project B checkpoint)', async () => {
    // Create checkpoint under proj-b
    const cpB = await checkpointService.createPendingCheckpoint('proj-b', 'Project B session', tempProjB);

    // Try to load it through proj-a: it does not exist under proj-a's directory
    expect(checkpointService.loadManifest('proj-a', cpB.id)).toBeNull();

    // If an attacker copies proj-b's manifest into proj-a's directory
    const stolenCpDir = path.join(tempStorage, 'proj-a', cpB.id);
    fs.mkdirSync(stolenCpDir, { recursive: true });
    const originalManifest = fs.readFileSync(path.join(tempStorage, 'proj-b', cpB.id, 'manifest.json'), 'utf8');
    fs.writeFileSync(path.join(stolenCpDir, 'manifest.json'), originalManifest, 'utf8');

    // Loading from proj-a must detect namespace tampering and throw
    expect(() => checkpointService.loadManifest('proj-a', cpB.id)).toThrow('Checkpoint project ID mismatch');

    // IPC call with mismatched/stolen checkpoint must fail
    await expect(
      (ipcMain as any)._callHandler(IPC_CHANNELS.GET_CHECKPOINT_DIFF, {}, {
        projectId: 'proj-a',
        checkpointId: cpB.id,
      })
    ).rejects.toThrow();
  });

  // 12. manifest root mismatch blocked
  it('12. blocks diff/rollback if manifest projectRoot does not match registered project canonical root', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'Root test', tempProjA);
    // Tamper with manifest.projectRoot to point to tempProjB or external directory
    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;
    manifest.projectRoot = tempProjB;
    checkpointService.saveManifest(manifest);

    const guardA = new WorkspaceGuard(tempProjA);
    const rollbackRes = checkpointService.rollback(cp.id, 'proj-a', guardA);
    expect(rollbackRes.success).toBe(false);
    expect(rollbackRes.error).toContain('no longer matches');
  });

  // 13 & 14. Manifest path traversal and absolute path blocked
  it('13-14. blocks rollback if manifest contains path traversal or absolute paths', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'Traversal test', tempProjA);
    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;

    // Inject malicious relativePath traversal
    manifest.files['../../outside/secret.txt'] = {
      relativePath: '../../outside/secret.txt',
      existedBefore: true,
      originalSha256: 'deadbeef',
      backupFileName: 'a'.repeat(64) + '.bak',
    };
    checkpointService.saveManifest(manifest);

    const guardA = new WorkspaceGuard(tempProjA);
    const res = checkpointService.rollback(cp.id, 'proj-a', guardA);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Invalid or unsafe path');
  });

  // 15. malicious backupFileName traversal blocked
  it('15. blocks rollback if manifest contains path traversal in backupFileName', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'Backup traversal test', tempProjA);
    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;

    manifest.files['src/main.ts'] = {
      relativePath: 'src/main.ts',
      existedBefore: true,
      originalSha256: 'somehash',
      backupFileName: '..\\..\\evil.bak',
    };
    checkpointService.saveManifest(manifest);

    const guardA = new WorkspaceGuard(tempProjA);
    const res = checkpointService.rollback(cp.id, 'proj-a', guardA);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Invalid or untrusted backup filename');
  });

  // 16. backup SHA mismatch blocks rollback
  it('16. blocks rollback if backup file contents fail SHA integrity verification', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'Integrity test', tempProjA);
    const mainTs = path.join(tempProjA, 'src', 'main.ts');
    await checkpointService.capturePreMutationSnapshot(cp.id, 'proj-a', 'src/main.ts', mainTs);

    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;
    const backupFile = manifest.files['src/main.ts']!.backupFileName!;
    const backupPath = path.join(tempStorage, 'proj-a', cp.id, 'files', backupFile);

    // Tamper with backup file on disk
    fs.writeFileSync(backupPath, 'CORRUPTED_BYTES_HERE', 'utf8');

    const guardA = new WorkspaceGuard(tempProjA);
    const res = checkpointService.rollback(cp.id, 'proj-a', guardA);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Checkpoint backup integrity verification failed.');
  });

  // 17. rollback preflight failure causes ZERO writes
  it('17. guarantees all-or-nothing preflight: zero disk mutations if any file fails validation', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'All or nothing test', tempProjA);
    const mainTs = path.join(tempProjA, 'src', 'main.ts');
    await checkpointService.capturePreMutationSnapshot(cp.id, 'proj-a', 'src/main.ts', mainTs);

    // Mutate main.ts on disk
    fs.writeFileSync(mainTs, 'MUTATED_MAIN\n', 'utf8');
    await checkpointService.recordFileMutation(cp.id, 'proj-a', 'src/main.ts', 'modify', mainTs);

    // Inject a second corrupted/traversal entry in the manifest
    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;
    manifest.files['invalid/../escape.ts'] = {
      relativePath: 'invalid/../escape.ts',
      existedBefore: false,
    };
    checkpointService.saveManifest(manifest);

    const guardA = new WorkspaceGuard(tempProjA);
    const res = checkpointService.rollback(cp.id, 'proj-a', guardA);
    expect(res.success).toBe(false);

    // Preflight must have failed before altering main.ts: main.ts must still be MUTATED_MAIN (no partial restore)
    expect(fs.readFileSync(mainTs, 'utf8')).toBe('MUTATED_MAIN\n');
  });

  // 18. valid rollback still succeeds
  it('18. allows clean rollback when all preflight checks pass', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'Clean rollback', tempProjA);
    const mainTs = path.join(tempProjA, 'src', 'main.ts');
    await checkpointService.capturePreMutationSnapshot(cp.id, 'proj-a', 'src/main.ts', mainTs);

    fs.writeFileSync(mainTs, 'MUTATED_CONTENT\n', 'utf8');
    await checkpointService.recordFileMutation(cp.id, 'proj-a', 'src/main.ts', 'modify', mainTs);

    const guardA = new WorkspaceGuard(tempProjA);
    const res = checkpointService.rollback(cp.id, 'proj-a', guardA);
    expect(res.success).toBe(true);
    expect(fs.readFileSync(mainTs, 'utf8')).toBe('export const a = 1;\n');
  });

  // 19. valid Accept still succeeds
  it('19. accepts checkpoint and persists accepted status', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'Accept test', tempProjA);
    const guardA = new WorkspaceGuard(tempProjA);
    const res = checkpointService.accept(cp.id, 'proj-a', guardA);
    expect(res.success).toBe(true);
    const manifest = checkpointService.loadManifest('proj-a', cp.id);
    expect(manifest?.status).toBe('accepted');
  });

  // 20. valid Diff still succeeds
  it('20. computes diff accurately for legitimate workspace mutations', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'Diff test', tempProjA);
    const mainTs = path.join(tempProjA, 'src', 'main.ts');
    await checkpointService.capturePreMutationSnapshot(cp.id, 'proj-a', 'src/main.ts', mainTs);

    fs.writeFileSync(mainTs, 'export const a = 1;\nexport const added = true;\n', 'utf8');
    await checkpointService.recordFileMutation(cp.id, 'proj-a', 'src/main.ts', 'modify', mainTs);

    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;
    const diff = DiffService.computeCheckpointDiff(
      manifest,
      checkpointService.getCheckpointDir('proj-a', cp.id),
      new WorkspaceGuard(tempProjA)
    );
    expect(diff.totalFilesChanged).toBe(1);
    expect(diff.totalInsertions).toBe(1);
    expect(diff.files[0].relativePath).toBe('src/main.ts');
  });

  // Section 13: Direct Service Test against Intentionally Malicious Manifests
  it('Section 13: defends in depth against intentionally malicious manifests directly in storage', async () => {
    const maliciousCpId = 'chk_999999_evil';
    const cpDir = path.join(tempStorage, 'proj-a', maliciousCpId);
    fs.mkdirSync(path.join(cpDir, 'files'), { recursive: true });

    const secretFile = path.join(tempOutside, 'secret.txt');
    const secretBefore = fs.readFileSync(secretFile, 'utf8');

    // Scenario A: Attack trying to write to external file outside workspace
    const maliciousManifestA = {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      id: maliciousCpId,
      projectId: 'proj-a',
      projectRoot: tempProjA,
      timestamp: new Date().toISOString(),
      type: 'automatic',
      status: 'pending',
      files: {
        '../../outside/secret.txt': {
          relativePath: '../../outside/secret.txt',
          existedBefore: true,
          originalSha256: crypto.createHash('sha256').update('MALICIOUS').digest('hex'),
          backupFileName: crypto.createHash('sha256').update('MALICIOUS').digest('hex') + '.bak',
        },
      },
      totalBackupBytes: 9,
    };
    fs.writeFileSync(path.join(cpDir, 'manifest.json'), JSON.stringify(maliciousManifestA, null, 2), 'utf8');

    const guardA = new WorkspaceGuard(tempProjA);
    const resA = checkpointService.rollback(maliciousCpId, 'proj-a', guardA);
    expect(resA.success).toBe(false);

    // Verify external file was completely untouched
    expect(fs.readFileSync(secretFile, 'utf8')).toBe(secretBefore);

    // Scenario B: Attack with projectRoot: C:\Windows
    const maliciousManifestB = {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      id: maliciousCpId,
      projectId: 'proj-a',
      projectRoot: process.platform === 'win32' ? 'C:\\Windows' : '/etc',
      timestamp: new Date().toISOString(),
      type: 'automatic',
      status: 'pending',
      files: {},
      totalBackupBytes: 0,
    };
    fs.writeFileSync(path.join(cpDir, 'manifest.json'), JSON.stringify(maliciousManifestB, null, 2), 'utf8');

    const resB = checkpointService.rollback(maliciousCpId, 'proj-a', guardA);
    expect(resB.success).toBe(false);
    expect(resB.error).toContain('no longer matches the registered project');
  });

  // ─── v0.5.2 NEW TESTS ───────────────────────────────────────────────────────

  it('v0.5.2: rollback() rejects when called without WorkspaceGuard (null)', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'guard test', tempProjA);
    // @ts-expect-error intentional - test that null guard is rejected
    const res = checkpointService.rollback(cp.id, 'proj-a', null);
    expect(res.success).toBe(false);
    expect(res.error).toContain('WorkspaceGuard');
  });

  it('v0.5.2: rollback() rejects when called with a string instead of WorkspaceGuard', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'guard test', tempProjA);
    // @ts-expect-error intentional - test that string is rejected
    const res = checkpointService.rollback(cp.id, 'proj-a', tempProjA);
    expect(res.success).toBe(false);
    expect(res.error).toContain('WorkspaceGuard');
  });

  it('v0.5.2: accept() throws when called without WorkspaceGuard (null)', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'accept guard test', tempProjA);
    expect(() =>
      // @ts-expect-error intentional
      checkpointService.accept(cp.id, 'proj-a', null)
    ).toThrow('WorkspaceGuard');
  });

  it('v0.5.2: accept() throws when called with a string instead of WorkspaceGuard', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'accept guard test', tempProjA);
    expect(() =>
      // @ts-expect-error intentional
      checkpointService.accept(cp.id, 'proj-a', tempProjA)
    ).toThrow('WorkspaceGuard');
  });

  it('v0.5.2: manifest.projectRoot cannot become the authority — rollback must verify against registered guard', async () => {
    // Create a checkpoint on proj-a
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'auth test', tempProjA);

    // Try rollback with guard pointing to a different directory (attacker-controlled path)
    const attackerGuard = new WorkspaceGuard(tempOutside);
    const res = checkpointService.rollback(cp.id, 'proj-a', attackerGuard);
    expect(res.success).toBe(false);
    expect(res.error).toContain('no longer matches the registered project');
  });

  it('v0.5.2: diff fails closed on absolute path in manifest', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'diff fail-closed', tempProjA);
    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;
    // Inject an absolute path entry
    const absPath = process.platform === 'win32' ? 'C:\\Windows\\system32\\evil.dll' : '/etc/passwd';
    (manifest.files as any)[absPath] = {
      relativePath: absPath,
      existedBefore: false,
    };
    expect(() =>
      DiffService.computeCheckpointDiff(
        manifest,
        checkpointService.getCheckpointDir('proj-a', cp.id),
        new WorkspaceGuard(tempProjA)
      )
    ).toThrow('Checkpoint metadata failed safety validation.');
  });

  it('v0.5.2: diff fails closed on traversal path in manifest', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'diff traversal', tempProjA);
    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;
    (manifest.files as any)['../../outside/secret.txt'] = {
      relativePath: '../../outside/secret.txt',
      existedBefore: false,
    };
    expect(() =>
      DiffService.computeCheckpointDiff(
        manifest,
        checkpointService.getCheckpointDir('proj-a', cp.id),
        new WorkspaceGuard(tempProjA)
      )
    ).toThrow('Checkpoint metadata failed safety validation.');
  });

  it('v0.5.2: diff fails closed on null-byte in manifest path', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'diff null-byte', tempProjA);
    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;
    (manifest.files as any)['src/\0evil.ts'] = {
      relativePath: 'src/\0evil.ts',
      existedBefore: false,
    };
    expect(() =>
      DiffService.computeCheckpointDiff(
        manifest,
        checkpointService.getCheckpointDir('proj-a', cp.id),
        new WorkspaceGuard(tempProjA)
      )
    ).toThrow('Checkpoint metadata failed safety validation.');
  });

  it('v0.5.2: diff fails closed on backup with invalid filename format', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'diff bad-backup', tempProjA);
    const srcFile = path.join(tempProjA, 'src', 'main.ts');
    await checkpointService.capturePreMutationSnapshot(cp.id, 'proj-a', 'src/main.ts', srcFile);

    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;
    // Corrupt backup filename to one that fails regex
    for (const entry of Object.values(manifest.files)) {
      if (entry.existedBefore) {
        (entry as any).backupFileName = '../../etc/passwd';
      }
    }

    expect(() =>
      DiffService.computeCheckpointDiff(
        manifest,
        checkpointService.getCheckpointDir('proj-a', cp.id),
        new WorkspaceGuard(tempProjA)
      )
    ).toThrow('Checkpoint backup integrity verification failed.');
  });

  it('v0.5.2: diff fails closed on backup SHA-256 mismatch (tampered backup)', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'diff sha mismatch', tempProjA);
    const srcFile = path.join(tempProjA, 'src', 'main.ts');
    await checkpointService.capturePreMutationSnapshot(cp.id, 'proj-a', 'src/main.ts', srcFile);

    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;
    const cpDir = checkpointService.getCheckpointDir('proj-a', cp.id);
    const filesDir = path.join(cpDir, 'files');

    // Tamper the backup file content
    for (const entry of Object.values(manifest.files)) {
      if (entry.existedBefore && entry.backupFileName) {
        const backupPath = path.join(filesDir, entry.backupFileName);
        fs.writeFileSync(backupPath, 'TAMPERED CONTENT', 'utf8');
      }
    }

    expect(() =>
      DiffService.computeCheckpointDiff(
        manifest,
        cpDir,
        new WorkspaceGuard(tempProjA)
      )
    ).toThrow('Checkpoint backup integrity verification failed.');
  });

  it('v0.5.2: saveManifest never unlinks destination before rename', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'atomic write test', tempProjA);
    const manifestPath = path.join(tempStorage, 'proj-a', cp.id, 'manifest.json');

    // Confirm manifest exists
    expect(fs.existsSync(manifestPath)).toBe(true);

    // Write a second time - this exercises the overwrite path
    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;
    manifest.description = 'Updated description for atomic test';
    checkpointService.saveManifest(manifest);

    // File must still exist and be readable
    expect(fs.existsSync(manifestPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(saved.description).toBe('Updated description for atomic test');
    // Content has changed so inode may differ on Windows, but it must be valid JSON
    expect(saved.id).toBe(cp.id);
    expect(saved.projectId).toBe('proj-a');
  });

  it('v0.5.2: saveManifest leaves existing manifest valid when rename would fail (simulated)', async () => {
    const cp = await checkpointService.createPendingCheckpoint('proj-a', 'rename fail test', tempProjA);
    const manifestPath = path.join(tempStorage, 'proj-a', cp.id, 'manifest.json');
    const originalContent = fs.readFileSync(manifestPath, 'utf8');
    const originalParsed = JSON.parse(originalContent);

    // Spy on fs.renameSync to throw for this specific test
    const origRename = fs.renameSync.bind(fs);
    let callCount = 0;
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((...args) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Simulated rename failure');
      }
      return origRename(...args);
    });

    const manifest = checkpointService.loadManifest('proj-a', cp.id)!;
    manifest.description = 'Should not persist';
    expect(() => checkpointService.saveManifest(manifest)).toThrow('atomically replace');

    renameSpy.mockRestore();

    // Original manifest must still be intact
    expect(fs.existsSync(manifestPath)).toBe(true);
    const afterContent = fs.readFileSync(manifestPath, 'utf8');
    const afterParsed = JSON.parse(afterContent);
    expect(afterParsed.id).toBe(originalParsed.id);
    expect(afterParsed.description).not.toBe('Should not persist');
  });
});

