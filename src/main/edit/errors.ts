export class EditSystemError extends Error {
  public readonly code: string;
  public readonly targetPath?: string;

  constructor(message: string, code: string, targetPath?: string) {
    super(`[EditSystem] ${message}`);
    this.name = 'EditSystemError';
    this.code = code;
    this.targetPath = targetPath;
  }
}

export class MutationBlockedError extends EditSystemError {
  constructor(message: string, targetPath?: string) {
    super(message, 'MUTATION_BLOCKED', targetPath);
    this.name = 'MutationBlockedError';
  }
}

export class ReadBeforeWriteError extends EditSystemError {
  constructor(targetPath: string) {
    super('Read the file before modifying it.', 'READ_BEFORE_WRITE_REQUIRED', targetPath);
    this.name = 'ReadBeforeWriteError';
  }
}

export class ConcurrencyConflictError extends EditSystemError {
  constructor(targetPath: string) {
    super(
      'File changed after it was inspected. Read the file again before editing.',
      'CONCURRENCY_CONFLICT',
      targetPath
    );
    this.name = 'ConcurrencyConflictError';
  }
}

export class CheckpointError extends EditSystemError {
  constructor(message: string, targetPath?: string) {
    super(message, 'CHECKPOINT_ERROR', targetPath);
    this.name = 'CheckpointError';
  }
}

export class RollbackConflictError extends EditSystemError {
  constructor(targetPath: string, detail?: string) {
    super(
      detail || `File was modified externally after the agent edited it: ${targetPath}`,
      'ROLLBACK_CONFLICT',
      targetPath
    );
    this.name = 'RollbackConflictError';
  }
}
