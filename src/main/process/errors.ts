export class ProcessExecutionError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'ProcessExecutionError';
  }
}

export class CommandPolicyError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'CommandPolicyError';
  }
}

export class ApprovalTimeoutError extends Error {
  constructor(message: string = 'Command approval request timed out') {
    super(message);
    this.name = 'ApprovalTimeoutError';
  }
}
