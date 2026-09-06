import { AppSettings } from './types';

export const APP_VERSION = '0.1.0';
export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SCHEMA_VERSION,
  startupPage: 'builder',
  modelDirectory: '',
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
  SELECT_MODEL_FOLDER: 'modelforge:select-model-folder',
  WINDOW_CONTROL: 'modelforge:window-control',
  IS_MAXIMIZED: 'modelforge:is-maximized',
  WINDOW_STATE_CHANGED: 'modelforge:window-state-changed',
} as const;
