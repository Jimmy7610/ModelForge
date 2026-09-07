import { AppSettings } from './types';

export const APP_VERSION = '0.5.1';
export const SCHEMA_VERSION = 2;
export const CHECKPOINT_SCHEMA_VERSION = 1;

export const MAX_PROMPT_CHARS = 16000;
export const DEFAULT_CONTEXT_TOKENS = 4096;

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SCHEMA_VERSION,
  startupPage: 'builder',
  modelDirectories: [],
  confirmDestructiveActions: true,
  compactMode: false,
};

export const IPC_CHANNELS = {
  GET_HARDWARE_INFO: 'modelforge:get-hardware-info',
  GET_SETTINGS: 'modelforge:get-settings',
  UPDATE_SETTINGS: 'modelforge:update-settings',
  GET_PROJECTS: 'modelforge:get-projects',
  ADD_PROJECT: 'modelforge:add-project',
  REMOVE_PROJECT: 'modelforge:remove-project',
  
  // Model Discovery & Library
  GET_MODEL_LIBRARIES: 'modelforge:get-model-libraries',
  ADD_MODEL_LIBRARY: 'modelforge:add-model-library',
  REMOVE_MODEL_LIBRARY: 'modelforge:remove-model-library',
  SCAN_MODEL_LIBRARY: 'modelforge:scan-model-library',
  SCAN_ALL_MODEL_LIBRARIES: 'modelforge:scan-all-model-libraries',
  GET_MODELS: 'modelforge:get-models',
  GET_MODEL_DETAILS: 'modelforge:get-model-details',
  GET_PRIMARY_DRIVE_STORAGE: 'modelforge:get-primary-drive-storage',
  MODEL_SCAN_PROGRESS: 'modelforge:model-scan-progress',

  // Local Inference & Chat (Pass 3)
  GET_INFERENCE_STATE: 'modelforge:get-inference-state',
  GET_INFERENCE_RUNTIME_INFO: 'modelforge:get-inference-runtime-info',
  LOAD_MODEL: 'modelforge:load-model',
  UNLOAD_MODEL: 'modelforge:unload-model',
  SEND_CHAT_MESSAGE: 'modelforge:send-chat-message',
  STOP_GENERATION: 'modelforge:stop-generation',
  CLEAR_CHAT: 'modelforge:clear-chat',
  INFERENCE_CHUNK: 'modelforge:inference-chunk',
  INFERENCE_STATE_CHANGED: 'modelforge:inference-state-changed',

  // Plan Agent & Workspace Intelligence (Pass 4)
  RUN_PLAN_AGENT: 'modelforge:run-plan-agent',
  STOP_PLAN_AGENT: 'modelforge:stop-plan-agent',
  GET_AGENT_STATE: 'modelforge:get-agent-state',
  SET_ACTIVE_PROJECT: 'modelforge:set-active-project',
  AGENT_ACTIVITY: 'modelforge:agent-activity',
  AGENT_CHUNK: 'modelforge:agent-chunk',
  AGENT_STATE_CHANGED: 'modelforge:agent-state-changed',
  CHECK_TOOL_CAPABILITY: 'modelforge:check-tool-capability',

  // Edit Agent & Checkpoints (Pass 5)
  RUN_EDIT_AGENT: 'modelforge:run-edit-agent',
  STOP_EDIT_AGENT: 'modelforge:stop-edit-agent',
  GET_EDIT_AGENT_STATE: 'modelforge:get-edit-agent-state',
  EDIT_AGENT_ACTIVITY: 'modelforge:edit-agent-activity',
  EDIT_AGENT_CHUNK: 'modelforge:edit-agent-chunk',
  EDIT_AGENT_STATE_CHANGED: 'modelforge:edit-agent-state-changed',
  GET_PENDING_CHECKPOINT: 'modelforge:get-pending-checkpoint',
  GET_CHECKPOINT_DIFF: 'modelforge:get-checkpoint-diff',
  ACCEPT_CHECKPOINT: 'modelforge:accept-checkpoint',
  ROLLBACK_CHECKPOINT: 'modelforge:rollback-checkpoint',
  CREATE_MANUAL_CHECKPOINT: 'modelforge:create-manual-checkpoint',
  ENABLE_EDIT_FOR_PROJECT: 'modelforge:enable-edit-for-project',
  DISABLE_EDIT: 'modelforge:disable-edit',
  GET_EDIT_AUTHORIZATION_STATE: 'modelforge:get-edit-authorization-state',

  // Read-Only Workspace Inspection Tools
  GET_PROJECT_OVERVIEW: 'modelforge:get-project-overview',
  LIST_DIRECTORY: 'modelforge:list-directory',
  READ_FILE: 'modelforge:read-file',
  SEARCH_TEXT: 'modelforge:search-text',

  // System & Clipboard (Pass 4.1)
  COPY_TEXT: 'modelforge:copy-text',

  // Window Controls
  WINDOW_CONTROL: 'modelforge:window-control',
  IS_MAXIMIZED: 'modelforge:is-maximized',
  WINDOW_STATE_CHANGED: 'modelforge:window-state-changed',
} as const;

