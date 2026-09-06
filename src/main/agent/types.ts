import { AgentActivityItem, AgentPlanState, ChatGenerationChunk } from '../../shared/types';

export interface PlanAgentCallbacks {
  onActivity?: (activity: AgentActivityItem) => void;
  onChunk?: (chunk: ChatGenerationChunk) => void;
  onStateChange?: (state: AgentPlanState) => void;
}
