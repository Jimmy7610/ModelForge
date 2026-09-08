import type {
  ProcessKind,
  ProcessStatus,
  PackageManagerType,
  DiscoveredScriptInfo,
  PendingCommandRequest,
  ProcessSessionInfo,
  ProcessOutputChunk,
} from '../../shared/types';

export type {
  ProcessKind,
  ProcessStatus,
  PackageManagerType,
  DiscoveredScriptInfo,
  PendingCommandRequest,
  ProcessSessionInfo,
  ProcessOutputChunk,
};

export interface ProcessSpawnOptions {
  executable: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface ProcessCallbacks {
  onChunk?: (chunk: ProcessOutputChunk) => void;
  onStateChange?: (session: ProcessSessionInfo) => void;
}

export interface CreateCommandRequestOptions {
  projectId: string;
  projectRoot: string;
  kind?: ProcessKind;
  scriptName: string;
  reason: string;
  initiator?: 'manual' | 'agent';
  runId?: string;
}

export interface PreProcessSafetySnapshot {
  snapshotId: string;
  checkpointId: string;
  projectId: string;
  createdAt: string;
  filesCount: number;
  totalBytes: number;
  files: Record<string, { originalSha256: string; sizeBytes: number }>;
}
