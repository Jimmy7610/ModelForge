export type {
  CheckpointFileEntry,
  CheckpointManifest,
  CheckpointStatus,
  CheckpointSummary,
  FileDiffItem,
  FileDiffStatus,
  CheckpointDiffResult,
  RollbackResult,
} from '../../shared/types';


export interface MutationLimits {
  /** Maximum size for a single write operation (default: 2 MB) */
  maxSingleWriteBytes: number;
  /** Maximum cumulative newly written/changed bytes per edit session (default: 10 MB) */
  maxCumulativeWriteBytes: number;
  /** Maximum number of touched/mutated files per edit session (default: 50) */
  maxTouchedFiles: number;
  /** Maximum total checkpoint storage allowed per edit transaction (default: 50 MB) */
  maxCheckpointTransactionBytes: number;
}

export const DEFAULT_MUTATION_LIMITS: MutationLimits = {
  maxSingleWriteBytes: 2 * 1024 * 1024, // 2 MB
  maxCumulativeWriteBytes: 10 * 1024 * 1024, // 10 MB
  maxTouchedFiles: 50,
  maxCheckpointTransactionBytes: 50 * 1024 * 1024, // 50 MB
};

export interface ReadRecord {
  canonicalPath: string;
  relativePath: string;
  sha256: string;
  timestamp: number;
}

export type MutationOperation = 'create' | 'modify' | 'delete';

export interface MutationValidationResult {
  allowed: boolean;
  canonicalPath: string;
  relativePath: string;
  error?: string;
  isNewFile?: boolean;
}

export interface EditToolResult {
  success: boolean;
  status?: 'success' | 'error';
  message: string;
  relativePath: string;
  bytesWritten?: number;
  operation: MutationOperation;
}
