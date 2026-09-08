import crypto from 'node:crypto';
import {
  PendingCommandRequest,
  ProcessSessionInfo,
  ProcessOutputChunk,
  CreateCommandRequestOptions,
  ProcessCallbacks,
} from './types';
import { ProcessExecutionError } from './errors';
import { ExecutableResolver } from './executable-resolver';
import { CommandPolicy } from './command-policy';
import { ProcessSession } from './process-session';

export interface ProcessServiceHooks {
  beforeExecute?: (request: PendingCommandRequest) => Promise<void>;
  afterExecute?: (request: PendingCommandRequest, session: ProcessSessionInfo) => Promise<void>;
}

export class ProcessService {
  private activeSession: ProcessSession | null = null;
  private pendingRequests = new Map<
    string,
    {
      request: PendingCommandRequest;
      timer: NodeJS.Timeout;
      resolve: (value: any) => void;
      reject: (reason: any) => void;
    }
  >();
  private processHistory: ProcessSessionInfo[] = [];
  private callbacks: ProcessCallbacks & {
    onRequestCreated?: (request: PendingCommandRequest) => void;
  } = {};
  private hooks?: ProcessServiceHooks;

  constructor(hooks?: ProcessServiceHooks) {
    this.hooks = hooks;
  }

  public setHooks(hooks: ProcessServiceHooks): void {
    this.hooks = hooks;
  }

  public setCallbacks(callbacks: ProcessCallbacks & { onRequestCreated?: (request: PendingCommandRequest) => void }): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public setOutputChunkCallback(cb: (chunk: ProcessOutputChunk) => void): void {
    this.callbacks.onChunk = cb;
  }

  public getActiveSession(): ProcessSessionInfo | null {
    return this.activeSession ? this.activeSession.getSessionInfo() : null;
  }

  public getLastSession(): ProcessSessionInfo | null {
    return this.processHistory.length > 0 ? this.processHistory[0] : null;
  }

  public getPendingRequest(): PendingCommandRequest | null {
    for (const item of this.pendingRequests.values()) {
      if (item.request.status === 'pending') {
        return { ...item.request };
      }
    }
    return null;
  }

  public getProcessHistory(): ProcessSessionInfo[] {
    return [...this.processHistory];
  }

  /**
   * Discovers package.json scripts for a given project.
   */
  public getProjectScripts(projectDir: string) {
    return ExecutableResolver.discoverScripts(projectDir);
  }

  public discoverScripts(projectDir: string) {
    return ExecutableResolver.discoverScripts(projectDir);
  }

  /**
   * Creates a frozen, immutable command request and awaits user approval.
   */
  public async createCommandRequest(
    options: CreateCommandRequestOptions
  ): Promise<{
    success: boolean;
    denied?: boolean;
    cancelled?: boolean;
    status?: string;
    script: string;
    exitCode?: number | null;
    startedAt?: string;
    endedAt?: string;
    durationMs?: number;
    output?: string;
    stdout?: string;
    stderr?: string;
    message?: string;
  }> {
    // 1. One process at a time check
    if (this.activeSession && this.activeSession.getSessionInfo().status === 'running') {
      throw new ProcessExecutionError('Another process is already running. Stop it before starting a new command.');
    }
    if (this.pendingRequests.size > 0) {
      throw new ProcessExecutionError('Another command request is already pending approval.');
    }

    // 2. Resolve invocation immutably
    const invocation = ExecutableResolver.resolveScriptInvocation(options.projectRoot, options.scriptName);

    const isPersistent = CommandPolicy.isPersistentScript(options.scriptName);
    const riskSummary = isPersistent
      ? 'Persistent project server. Runs until stopped. Executes with your normal Windows user permissions.'
      : 'Supervised project script. Executes with your normal Windows user permissions.';

    const requestId = `cmdreq_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const request: PendingCommandRequest = {
      requestId,
      runId: options.runId,
      projectId: options.projectId,
      kind: options.kind || 'package_script',
      scriptName: options.scriptName,
      resolvedExecutable: invocation.executable,
      resolvedArgs: [...invocation.args],
      cwd: invocation.cwd,
      reason: options.reason,
      initiator: options.initiator || 'agent',
      timestamp: new Date().toISOString(),
      riskSummary,
      status: 'pending',
    };

    // 3. Setup 10-minute approval timeout
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cancelPendingRequest(requestId, 'Command approval request timed out (10 minutes)');
      }, 10 * 60 * 1000);

      this.pendingRequests.set(requestId, {
        request,
        timer,
        resolve,
        reject,
      });

      this.callbacks.onRequestCreated?.(request);
    });
  }

  /**
   * Approves and executes a pending command request.
   */
  public async approveRequest(requestId: string): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    const entry = this.pendingRequests.get(requestId);
    if (!entry) {
      return { success: false, error: `No pending command request with ID "${requestId}"` };
    }

    const { request, timer, resolve } = entry;
    clearTimeout(timer);
    this.pendingRequests.delete(requestId);

    request.status = 'approved';

    // 1. Hook: Pre-Process Safety Snapshot
    if (this.hooks?.beforeExecute) {
      try {
        await this.hooks.beforeExecute(request);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        resolve({
          success: false,
          script: request.scriptName,
          exitCode: 1,
          message: `Pre-process safety snapshot failed: ${msg}. Command execution blocked.`,
        });
        return { success: false, error: msg };
      }
    }

    // 2. Formulate session
    const commandDisplay = `${request.resolvedExecutable} ${request.resolvedArgs.join(' ')}`;
    const timeoutMs = CommandPolicy.resolveTimeoutMs(request.scriptName);

    const session = new ProcessSession({
      requestId: request.requestId,
      runId: request.runId,
      projectId: request.projectId,
      commandDisplay,
      executable: request.resolvedExecutable,
      args: request.resolvedArgs,
      cwd: request.cwd,
      timeoutMs,
      callbacks: {
        onChunk: (chunk: ProcessOutputChunk) => {
          this.callbacks.onChunk?.(chunk);
        },
        onStateChange: (state: ProcessSessionInfo) => {
          this.callbacks.onStateChange?.(state);
        },
      },
    });

    this.activeSession = session;

    // 3. Launch process asynchronously and handle completion
    session
      .start()
      .then(async (sessionInfo) => {
        this.processHistory.unshift(sessionInfo);
        if (this.processHistory.length > 50) this.processHistory.pop();

        // 4. Hook: Post-Process Filesystem Scan
        if (this.hooks?.afterExecute) {
          try {
            await this.hooks.afterExecute(request, sessionInfo);
          } catch (err) {
            console.error('[ProcessService] post-execution hook error:', err);
          }
        }

        const modelOutput = session.getBoundedOutputForModel();
        if (this.activeSession === session) {
          this.activeSession = null;
        }

        resolve({
          success: sessionInfo.exitCode === 0,
          status: sessionInfo.status,
          script: request.scriptName,
          exitCode: sessionInfo.exitCode,
          startedAt: sessionInfo.startedAt,
          endedAt: sessionInfo.endedAt,
          durationMs: sessionInfo.durationMs,
          output: sessionInfo.retainedOutput,
          stdout: modelOutput.stdout,
          stderr: modelOutput.stderr,
          message:
            sessionInfo.exitCode === 0
              ? `Command "${commandDisplay}" completed successfully (exit 0).`
              : `Command "${commandDisplay}" failed with exit code ${sessionInfo.exitCode}.`,
        });
      })
      .catch((err) => {
        if (this.activeSession === session) {
          this.activeSession = null;
        }
        const msg = err instanceof Error ? err.message : String(err);
        resolve({
          success: false,
          script: request.scriptName,
          exitCode: 1,
          message: `Process execution failed: ${msg}`,
        });
      })
      .finally(() => {
        if (this.activeSession === session) {
          this.activeSession = null;
        }
      });

    return { success: true, sessionId: session.id };
  }

  /**
   * Denies a pending command request.
   */
  public denyRequest(requestId: string, reason?: string): { success: boolean } {
    const entry = this.pendingRequests.get(requestId);
    if (!entry) {
      return { success: false };
    }

    const { request, timer, resolve } = entry;
    clearTimeout(timer);
    this.pendingRequests.delete(requestId);

    request.status = 'denied';

    resolve({
      success: false,
      denied: true,
      script: request.scriptName,
      message: reason || 'User denied this command.',
    });

    return { success: true };
  }

  /**
   * Cancels a pending request (e.g. timeout, stop agent, project switch).
   */
  public cancelPendingRequest(requestId: string, reason: string = 'Command request cancelled'): boolean {
    const entry = this.pendingRequests.get(requestId);
    if (!entry) return false;

    const { request, timer, resolve } = entry;
    clearTimeout(timer);
    this.pendingRequests.delete(requestId);

    request.status = 'cancelled';

    resolve({
      success: false,
      cancelled: true,
      script: request.scriptName,
      message: reason,
    });

    return true;
  }

  /**
   * Cancels all pending requests for a project.
   */
  public cancelAllPending(projectId?: string, reason: string = 'Cancelled'): void {
    for (const [id, entry] of this.pendingRequests.entries()) {
      if (!projectId || entry.request.projectId === projectId) {
        this.cancelPendingRequest(id, reason);
      }
    }
  }

  /**
   * Stops the active running process.
   */
  public async stopActiveProcess(): Promise<{ success: boolean }> {
    if (!this.activeSession) {
      return { success: false };
    }
    await this.activeSession.stop('cancelled');
    return { success: true };
  }
}
