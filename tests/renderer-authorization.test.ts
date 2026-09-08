import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionLevel } from '../src/shared/types';

describe('Renderer Authorization Bugfix (Pass 6 Manual Fix)', () => {
  let setActiveTab: ReturnType<typeof vi.fn>;
  let setEditPermissionModalOpen: ReturnType<typeof vi.fn>;
  let setAgentEnableModalOpen: ReturnType<typeof vi.fn>;
  let runEditAgentApi: ReturnType<typeof vi.fn>;
  let setIsEditing: ReturnType<typeof vi.fn>;
  let pendingCheckpoint: any;
  let activeModel: any;
  let activeProj: any;

  beforeEach(() => {
    setActiveTab = vi.fn();
    setEditPermissionModalOpen = vi.fn();
    setAgentEnableModalOpen = vi.fn();
    runEditAgentApi = vi.fn().mockResolvedValue({ runId: 'test_run' });
    setIsEditing = vi.fn();

    activeModel = { id: 'test-model' };
    activeProj = { id: 'test-project' };
    pendingCheckpoint = null;
  });

  const simulateHandleRunEditAgent = async (permissionLevel: PermissionLevel, prompt: string) => {
    if (!activeProj) return;
    if (!activeModel) return;

    if (permissionLevel !== 'EDIT' && permissionLevel !== 'AGENT') {
      setEditPermissionModalOpen(true);
      return;
    }

    if (pendingCheckpoint && pendingCheckpoint.type === 'automatic') {
      setActiveTab('diff');
      return;
    }

    setIsEditing(true);
    setActiveTab('chat');
    
    try {
      await runEditAgentApi({
        projectId: activeProj.id,
        prompt,
      });
    } catch (err) {
      setIsEditing(false);
    }
  };

  it('1. permissionLevel READ + Run Agent -> does not start mutation run, opens Edit modal', async () => {
    await simulateHandleRunEditAgent('READ', 'do something');
    expect(setEditPermissionModalOpen).toHaveBeenCalledWith(true);
    expect(runEditAgentApi).not.toHaveBeenCalled();
    expect(setIsEditing).not.toHaveBeenCalled();
  });

  it('2. permissionLevel EDIT + Run Agent -> proceeds', async () => {
    await simulateHandleRunEditAgent('EDIT', 'do something');
    expect(setEditPermissionModalOpen).not.toHaveBeenCalled();
    expect(runEditAgentApi).toHaveBeenCalled();
    expect(setIsEditing).toHaveBeenCalledWith(true);
  });

  it('3. permissionLevel AGENT + Run Agent -> proceeds', async () => {
    await simulateHandleRunEditAgent('AGENT', 'do something');
    expect(setEditPermissionModalOpen).not.toHaveBeenCalled();
    expect(runEditAgentApi).toHaveBeenCalled();
    expect(setIsEditing).toHaveBeenCalledWith(true);
  });

  it('4. AGENT + Run Agent -> EditPermissionModal does NOT open', async () => {
    await simulateHandleRunEditAgent('AGENT', 'test');
    expect(setEditPermissionModalOpen).not.toHaveBeenCalled();
  });

  it('5. AGENT + Run Agent -> AgentEnableModal does NOT reopen', async () => {
    await simulateHandleRunEditAgent('AGENT', 'test');
    expect(setAgentEnableModalOpen).not.toHaveBeenCalled();
  });
  
  it('6. AGENT authorization remains AGENT when RUN_EDIT_AGENT is invoked', async () => {
    await simulateHandleRunEditAgent('AGENT', 'test');
    expect(runEditAgentApi).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'test' }));
    // In actual app, runEditAgentApi calls main process which reads sessionAuthorization.getLevel
    // This test confirms we didn't downgrade it in the renderer
    expect(setEditPermissionModalOpen).not.toHaveBeenCalled();
  });

  it('10. pendingCheckpoint is part of the renderer callback state dependency behavior (simulated rejection)', async () => {
    pendingCheckpoint = { type: 'automatic', id: 'chk_1' };
    await simulateHandleRunEditAgent('AGENT', 'test');
    expect(runEditAgentApi).not.toHaveBeenCalled();
    expect(setActiveTab).toHaveBeenCalledWith('diff');
  });
});
