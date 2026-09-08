import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
  private historyFilePath?: string;

  constructor(storageDirOrHooks?: string | ProcessServiceHooks, maybeHooks?: ProcessServiceHooks) {
    let customDir: string | undefined;
    if (typeof storageDirOrHooks === 'string') {
      customDir = storageDirOrHooks;
      this.hooks = maybeHooks;
    } else if (storageDirOrHooks && typeof storageDirOrHooks === 'object') {
      this.hooks = storageDirOrHooks;
    }

    this.initHistoryStorage(customDir);
  }

  private initHistoryStorage(customDir?: string): void {
    try {
      let baseDir = customDir;
      if (!baseDir) {
        if (process.env.MODELFORGE_PROCESS_HISTORY_DIR) {
          baseDir = process.env.MODELFORGE_PROCESS_HISTORY_DIR;
        } else {
          try {
            const electron = require('electron');
            if (electron?.app?.getPath) {
              baseDir = electron.app.getPath('userData');
            }
          } catch {
            // Non-electron environment (tests)
          }
          if (!baseDir) {
            baseDir = path.join(os.homedir(), '.model-forge');
          }
        }
      }

      const resolvedDir = path.resolve(baseDir);
      if (!fs.existsSync(resolvedDir)) {
        fs.mkdirSync(resolvedDir, { recursive: true });
      }
      this.historyFilePath = path.join(resolvedDir, 'modelforge-process-history.json');
      this.loadHistory();
    } catch (err) {
      console.error('[ProcessService] Failed to initialize history storage:', err);
    }
  }

  private loadHistory(): void {
    if (!this.historyFilePath || !fs.existsSync(this.historyFilePath)) return;
    try {
      const content = fs.readFileSync(this.historyFilePath, 'utf8');
      const data = JSON.parse(content);
      if (data && Array.isArray(data.runs)) {
        this.processHistory = data.runs.map((r: ProcessSessionInfo) => {
          // Honest representation: if app exited while a process was running, mark interrupted
          if (r.status === 'running' || r.status === 'starting') {
            return { ...r, status: 'interrupted' as const };
          }
          return r;
        });
      }
    } catch (err) {
      console.error('[ProcessService] Failed to read process history:', err);
    }
  }

  private saveHistory(): void {
    if (!this.historyFilePath) return;
    try {
      // Keep up to 100 recent runs; persist only safe metadata with bounded logs, strictly no environment or secrets
      const safeRuns = this.processHistory.slice(0, 100).map((r) => ({
        id: r.id,
        requestId: r.requestId,
        runId: r.runId,
        projectId: r.projectId,
        commandDisplay: r.commandDisplay,
        packageManager: r.packageManager,
        executable: r.executable,
        args: [...(r.args || [])],
        cwd: r.cwd,
        pid: r.pid,
        status: r.status,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        durationMs: r.durationMs,
        exitCode: r.exitCode,
        outputTruncated: r.outputTruncated,
        retainedStdout: (r.retainedStdout || '').slice(-32 * 1024),
        retainedStderr: (r.retainedStderr || '').slice(-32 * 1024),
        retainedOutput: (r.retainedOutput || '').slice(-64 * 1024),
      }));

      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        runs: safeRuns,
      };

      const tmpPath = `${this.historyFilePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.historyFilePath);
    } catch (err) {
      console.error('[ProcessService] Failed to persist process history:', err);
    }
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

  public getProcessHistory(projectId?: string): ProcessSessionInfo[] {
    if (projectId && projectId.trim()) {
      return this.processHistory.filter((p) => p.projectId === projectId.trim());
    }
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
      packageManager: invocation.packageManager,
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
      packageManager: request.packageManager,
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
        if (this.processHistory.length > 100) this.processHistory.pop();
        this.saveHistory();

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
