import { AgentActivityItem, AgentPlanState, ChatGenerationChunk, EditAgentState } from '../../shared/types';

export interface PlanAgentCallbacks {
  onActivity?: (activity: AgentActivityItem) => void;
  onChunk?: (chunk: ChatGenerationChunk) => void;
  onStateChange?: (state: AgentPlanState) => void;
}

export interface EditAgentCallbacks {
  onActivity?: (activity: AgentActivityItem) => void;
  onChunk?: (chunk: ChatGenerationChunk) => void;
  onStateChange?: (state: EditAgentState) => void;
}

