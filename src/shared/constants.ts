import { AppSettings } from './types';

export const APP_VERSION = '0.2.0';
export const SCHEMA_VERSION = 2;

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

  // Window Controls
  WINDOW_CONTROL: 'modelforge:window-control',
  IS_MAXIMIZED: 'modelforge:is-maximized',
  WINDOW_STATE_CHANGED: 'modelforge:window-state-changed',
} as const;
