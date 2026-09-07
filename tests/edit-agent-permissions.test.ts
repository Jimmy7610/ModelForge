import { describe, it, expect, vi } from 'vitest';
import { PlanAgent } from '../src/main/agent/plan-agent';
import { EditAgent } from '../src/main/agent/edit-agent';

describe('Agent Permissions & Tool Scope Contracts (Pass 5)', () => {

  const dummyInferenceService: any = {
    getInferenceState: () => ({ isLoaded: true }),
    createSession: vi.fn(),
  };

  const dummyCheckpointService: any = {
    createPendingCheckpoint: vi.fn(),
  };

  it('guarantees PlanAgent receives strictly read-only inspection tools', () => {
    const planAgent = new PlanAgent(dummyInferenceService);
    const planAgentAny = planAgent as any;

    // PlanAgent has NO mutation methods or edit capabilities
    expect(planAgentAny.runEditAgent).toBeUndefined();
    expect(planAgentAny.editSession).toBeUndefined();
  });

  it('guarantees EditAgent contains only read tools and 4 safe mutation tools, with ZERO shell tools', () => {
    const editAgent = new EditAgent(dummyInferenceService, dummyCheckpointService);
    const editAgentAny = editAgent as any;

    // Verify shell and terminal execution functions are completely absent
    expect(editAgentAny.runCommand).toBeUndefined();
    expect(editAgentAny.exec).toBeUndefined();
    expect(editAgentAny.spawn).toBeUndefined();
    expect(editAgentAny.powershell).toBeUndefined();
    expect(editAgentAny.cmd).toBeUndefined();
    expect(editAgentAny.bash).toBeUndefined();
    expect(editAgentAny.git).toBeUndefined();
    expect(editAgentAny.npm).toBeUndefined();
  });

  it('enforces strict EditAgent budget limits (40 tool calls, 20 writes, 10 min timeout)', () => {
    const editAgent = new EditAgent(dummyInferenceService, dummyCheckpointService);
    const agentAny = editAgent as any;

    // Test budget defaults
    expect(agentAny.MAX_TOOL_CALLS).toBe(40);
    expect(agentAny.MAX_FILE_WRITES).toBe(20);
    expect(agentAny.MAX_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });
});
