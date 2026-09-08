import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CheckpointSummary, CheckpointDiffResult, RollbackResult } from '../src/shared/types';

describe('Checkpoint UI State & Reconciliation (v0.5.3)', () => {
  let pendingCheckpoint: CheckpointSummary | null;
  let checkpointDiff: CheckpointDiffResult | null;
  let fileTreeRefreshCounter: number;
  let checkpointRefreshSeq: number;
  let mockApi: {
    rollbackCheckpoint: ReturnType<typeof vi.fn>;
    acceptCheckpoint: ReturnType<typeof vi.fn>;
    getPendingCheckpoint: ReturnType<typeof vi.fn>;
    getCheckpointDiff: ReturnType<typeof vi.fn>;
  };

  const sampleCheckpointA: CheckpointSummary = {
    id: 'chk_1111111111111_aaaa',
    projectId: 'proj-test',
    timestamp: '2026-09-08T00:00:00.000Z',
    type: 'automatic',
    status: 'pending',
    filesCount: 1,
    totalBackupBytes: 100,
  };

  const sampleCheckpointB: CheckpointSummary = {
    id: 'chk_2222222222222_bbbb',
    projectId: 'proj-test',
    timestamp: '2026-09-08T00:01:00.000Z',
    type: 'automatic',
    status: 'pending',
    filesCount: 2,
    totalBackupBytes: 250,
  };

  const sampleDiff: CheckpointDiffResult = {
    checkpointId: sampleCheckpointA.id,
    projectId: 'proj-test',
    totalFilesChanged: 1,
    totalInsertions: 5,
    totalDeletions: 0,
    hasConflict: false,
    files: [
      {
        relativePath: 'src/test.ts',
        status: 'modified',
        hasConflict: false,
        insertions: 5,
        deletions: 0,
        unifiedDiff: '--- src/test.ts\n+++ src/test.ts\n@@ -1,3 +1,4 @@\n',
      },
    ],
  };

  beforeEach(() => {
    pendingCheckpoint = { ...sampleCheckpointA };
    checkpointDiff = { ...sampleDiff };
    fileTreeRefreshCounter = 0;
    checkpointRefreshSeq = 0;

    mockApi = {
      rollbackCheckpoint: vi.fn(),
      acceptCheckpoint: vi.fn(),
      getPendingCheckpoint: vi.fn(),
      getCheckpointDiff: vi.fn(),
    };
  });

  const refreshPendingCheckpointAndDiff = async (activeProjectId: string | null) => {
    const seq = ++checkpointRefreshSeq;
    if (!activeProjectId) {
      pendingCheckpoint = null;
      checkpointDiff = null;
      return;
    }
    try {
      const pending = await mockApi.getPendingCheckpoint(activeProjectId);
      if (seq !== checkpointRefreshSeq) return;
      pendingCheckpoint = pending;
      if (pending?.id) {
        const diff = await mockApi.getCheckpointDiff(pending.id, activeProjectId);
        if (seq !== checkpointRefreshSeq) return;
        checkpointDiff = diff;
      } else {
        checkpointDiff = null;
      }
    } catch {
      if (seq === checkpointRefreshSeq) {
        pendingCheckpoint = null;
        checkpointDiff = null;
      }
    }
  };

  const finalizeCheckpointUiState = async (actedCheckpointId: string, activeProjectId: string | null) => {
    checkpointRefreshSeq++;

    // Identity check: only clear if current checkpoint matches acted checkpoint
    if (pendingCheckpoint?.id === actedCheckpointId) {
      pendingCheckpoint = null;
      checkpointDiff = null;
    }

    fileTreeRefreshCounter++;
    await refreshPendingCheckpointAndDiff(activeProjectId);
  };

  const handleRollbackCheckpoint = async (
    activeProjectId: string | null
  ): Promise<RollbackResult | null> => {
    if (!activeProjectId || !pendingCheckpoint) return null;
    const targetCheckpointId = pendingCheckpoint.id;
    try {
      const result: RollbackResult = await mockApi.rollbackCheckpoint(targetCheckpointId, activeProjectId);
      if (result.success) {
        await finalizeCheckpointUiState(targetCheckpointId, activeProjectId);
        return result;
      } else {
        await refreshPendingCheckpointAndDiff(activeProjectId);
        return result;
      }
    } catch {
      return null;
    }
  };

  const handleAcceptCheckpoint = async (activeProjectId: string | null) => {
    if (!activeProjectId || !pendingCheckpoint) return;
    const targetCheckpointId = pendingCheckpoint.id;
    try {
      const res = await mockApi.acceptCheckpoint(targetCheckpointId, activeProjectId);
      if (res?.success) {
        await finalizeCheckpointUiState(targetCheckpointId, activeProjectId);
      }
    } catch {
      // ignore
    }
  };

  // 1. successful rollback clears pendingCheckpoint immediately
  it('1. successful rollback clears pendingCheckpoint immediately without restart', async () => {
    mockApi.rollbackCheckpoint.mockResolvedValueOnce({
      success: true,
      checkpointId: sampleCheckpointA.id,
      restoredFiles: ['src/test.ts'],
      deletedCreatedFiles: [],
      cleanedDirs: [],
      conflicts: [],
    });
    mockApi.getPendingCheckpoint.mockResolvedValueOnce(null);

    expect(pendingCheckpoint).not.toBeNull();
    const result = await handleRollbackCheckpoint('proj-test');

    expect(result?.success).toBe(true);
    expect(pendingCheckpoint).toBeNull();
  });

  // 2. successful rollback clears checkpointDiff immediately
  it('2. successful rollback clears checkpointDiff immediately without restart', async () => {
    mockApi.rollbackCheckpoint.mockResolvedValueOnce({
      success: true,
      checkpointId: sampleCheckpointA.id,
      restoredFiles: ['src/test.ts'],
      deletedCreatedFiles: [],
      cleanedDirs: [],
      conflicts: [],
    });
    mockApi.getPendingCheckpoint.mockResolvedValueOnce(null);

    expect(checkpointDiff).not.toBeNull();
    await handleRollbackCheckpoint('proj-test');

    expect(checkpointDiff).toBeNull();
  });

  // 3. successful rollback refreshes file tree
  it('3. successful rollback increments fileTreeRefreshCounter', async () => {
    mockApi.rollbackCheckpoint.mockResolvedValueOnce({
      success: true,
      checkpointId: sampleCheckpointA.id,
      restoredFiles: ['src/test.ts'],
      deletedCreatedFiles: [],
      cleanedDirs: [],
      conflicts: [],
    });
    mockApi.getPendingCheckpoint.mockResolvedValueOnce(null);

    const countBefore = fileTreeRefreshCounter;
    await handleRollbackCheckpoint('proj-test');

    expect(fileTreeRefreshCounter).toBe(countBefore + 1);
  });

  // 4. failed rollback does NOT clear real pending state
  it('4. failed rollback does NOT clear real pending state', async () => {
    mockApi.rollbackCheckpoint.mockResolvedValueOnce({
      success: false,
      checkpointId: sampleCheckpointA.id,
      restoredFiles: [],
      deletedCreatedFiles: [],
      cleanedDirs: [],
      conflicts: [],
      error: 'Disk locked',
    });
    mockApi.getPendingCheckpoint.mockResolvedValueOnce(sampleCheckpointA);
    mockApi.getCheckpointDiff.mockResolvedValueOnce(sampleDiff);

    await handleRollbackCheckpoint('proj-test');

    expect(pendingCheckpoint).toEqual(sampleCheckpointA);
    expect(checkpointDiff).toEqual(sampleDiff);
  });

  // 5. rollback conflict does NOT clear diff
  it('5. rollback conflict does NOT clear diff (preserves conflict inspection in Diff tab)', async () => {
    const conflictDiff: CheckpointDiffResult = {
      ...sampleDiff,
      hasConflict: true,
    };
    mockApi.rollbackCheckpoint.mockResolvedValueOnce({
      success: false,
      checkpointId: sampleCheckpointA.id,
      restoredFiles: [],
      deletedCreatedFiles: [],
      cleanedDirs: [],
      conflicts: [{ relativePath: 'src/test.ts', reason: 'External modification detected' }],
      error: '1 rollback conflict(s) detected',
    });
    mockApi.getPendingCheckpoint.mockResolvedValueOnce(sampleCheckpointA);
    mockApi.getCheckpointDiff.mockResolvedValueOnce(conflictDiff);

    await handleRollbackCheckpoint('proj-test');

    expect(pendingCheckpoint).not.toBeNull();
    expect(checkpointDiff?.hasConflict).toBe(true);
  });

  // 6. successful Accept clears diff immediately
  it('6. successful Accept clears diff and pending checkpoint immediately without restart', async () => {
    mockApi.acceptCheckpoint.mockResolvedValueOnce({ success: true });
    mockApi.getPendingCheckpoint.mockResolvedValueOnce(null);

    expect(pendingCheckpoint).not.toBeNull();
    expect(checkpointDiff).not.toBeNull();

    await handleAcceptCheckpoint('proj-test');

    expect(pendingCheckpoint).toBeNull();
    expect(checkpointDiff).toBeNull();
    expect(fileTreeRefreshCounter).toBe(1);
  });

  // 7. state clear applies only to checkpoint ID acted upon
  it('7. state clear applies only to checkpoint ID acted upon', async () => {
    // Current state became Checkpoint B while action was in flight for Checkpoint A
    pendingCheckpoint = { ...sampleCheckpointB };
    checkpointDiff = { ...sampleDiff, checkpointId: sampleCheckpointB.id };

    mockApi.getPendingCheckpoint.mockResolvedValueOnce(sampleCheckpointB);
    mockApi.getCheckpointDiff.mockResolvedValueOnce({ ...sampleDiff, checkpointId: sampleCheckpointB.id });

    // Finalizing A must NOT clear B
    await finalizeCheckpointUiState(sampleCheckpointA.id, 'proj-test');

    expect(pendingCheckpoint?.id).toBe(sampleCheckpointB.id);
  });

  // 8. later authoritative pending checkpoint can repopulate state
  it('8. later authoritative pending checkpoint can repopulate state', async () => {
    // Initially cleared
    pendingCheckpoint = null;
    checkpointDiff = null;

    // Reconciliation returns a newly created pending checkpoint
    mockApi.getPendingCheckpoint.mockResolvedValueOnce(sampleCheckpointB);
    mockApi.getCheckpointDiff.mockResolvedValueOnce({
      ...sampleDiff,
      checkpointId: sampleCheckpointB.id,
    });

    await refreshPendingCheckpointAndDiff('proj-test');

    expect((pendingCheckpoint as CheckpointSummary | null)?.id).toBe(sampleCheckpointB.id);
    expect((checkpointDiff as CheckpointDiffResult | null)?.checkpointId).toBe(sampleCheckpointB.id);
  });
});
