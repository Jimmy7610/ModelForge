import { spawn, ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import {
  ProcessSessionInfo,
  ProcessStatus,
  ProcessOutputChunk,
  ProcessCallbacks,
  PackageManagerType,
} from './types';
import { CommandPolicy } from './command-policy';
import { ExecutableResolver } from './executable-resolver';

const MAX_RETAINED_OUTPUT_CHARS = 5 * 1024 * 1024; // 5 MB

export interface ProcessSessionConfig {
  requestId: string;
  runId?: string;
  projectId: string;
  commandDisplay: string;
  packageManager?: PackageManagerType;
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  callbacks?: ProcessCallbacks;
}

export class ProcessSession {
  public readonly id: string;
  public readonly requestId: string;
  public readonly runId?: string;
  public readonly projectId: string;
  public readonly commandDisplay: string;
  public readonly packageManager?: PackageManagerType;
  public readonly executable: string;
  public readonly args: string[];
  public readonly cwd: string;

  private child: ChildProcess | null = null;
  private status: ProcessStatus = 'starting';
  private startedAt?: string;
  private endedAt?: string;
  private durationMs?: number;
  private exitCode: number | null = null;
  private retainedStdout: string = '';
  private retainedStderr: string = '';
  private retainedOutput: string = '';
  private stdoutTruncated: boolean = false;
  private stderrTruncated: boolean = false;
  private outputTruncated: boolean = false;
  private pid?: number;
  private timeoutTimer?: NodeJS.Timeout;
  private startTimeMs: number = 0;
  private callbacks?: ProcessCallbacks;

  private completionPromise: Promise<ProcessSessionInfo>;
  private resolveCompletion!: (value: ProcessSessionInfo) => void;
  private isFinalized: boolean = false;

  constructor(config: ProcessSessionConfig) {
    this.id = `proc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    this.requestId = config.requestId;
    this.runId = config.runId;
    this.projectId = config.projectId;
    this.commandDisplay = config.commandDisplay;
    this.packageManager = config.packageManager;
    this.executable = config.executable;
    this.args = [...config.args];
    this.cwd = config.cwd;
    this.callbacks = config.callbacks;

    this.completionPromise = new Promise<ProcessSessionInfo>((resolve) => {
      this.resolveCompletion = resolve;
    });

    if (config.timeoutMs && config.timeoutMs > 0) {
      this.timeoutTimer = setTimeout(() => {
        this.stop('timed_out');
      }, config.timeoutMs);
    }
  }

  /**
   * Spawns the child process with shell: false and begins streaming stdout/stderr.
   */
  public start(): Promise<ProcessSessionInfo> {
    this.startedAt = new Date().toISOString();
    this.startTimeMs = Date.now();
    this.status = 'running';

    const safeEnv = CommandPolicy.buildControlledEnvironment();
    const native = ExecutableResolver.resolveNativeInvocation(this.executable, this.args);

    try {
      // STRICT: shell: false is non-negotiable
      this.child = spawn(native.executable, native.args, {
        cwd: this.cwd,
        env: safeEnv,
        shell: false,
        windowsHide: true,
      });

      this.pid = this.child.pid;
      this.notifyState();

      if (this.child.stdout) {
        this.child.stdout.on('data', (data: Buffer) => {
          this.handleChunk('stdout', data.toString('utf8'));
        });
      }

      if (this.child.stderr) {
        this.child.stderr.on('data', (data: Buffer) => {
          this.handleChunk('stderr', data.toString('utf8'));
        });
      }

      this.child.on('error', (err: Error) => {
        this.handleChunk('stderr', `\n[Process Error]: ${err.message}\n`);
        this.finalize(1, 'failed');
      });

      this.child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        const finalCode = code !== null ? code : signal ? 1 : 0;
        const finalStatus: ProcessStatus =
          this.status === 'timed_out' || this.status === 'cancelled'
            ? this.status
            : finalCode === 0
            ? 'completed'
            : 'failed';
        this.finalize(finalCode, finalStatus);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.handleChunk('stderr', `\n[Spawn Failure]: ${msg}\n`);
      this.finalize(1, 'failed');
    }

    return this.completionPromise;
  }

  /**
   * Safely stops the process and its descendants on Windows / POSIX.
   */
  public async stop(reason: 'cancelled' | 'timed_out' = 'cancelled'): Promise<void> {
    if (this.isFinalized || !this.child || this.child.killed) {
      return;
    }

    this.status = reason;
    this.notifyState();

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }

    const targetPid = this.pid;

    if (targetPid && process.platform === 'win32') {
      try {
        // Windows process-tree termination using taskkill.exe with shell: false
        await new Promise<void>((resolve) => {
          const killer = spawn('taskkill.exe', ['/pid', String(targetPid), '/T', '/F'], {
            shell: false,
            windowsHide: true,
          });
          killer.on('close', () => resolve());
          killer.on('error', () => resolve());
          setTimeout(resolve, 2000); // 2 second timeout for taskkill
        });
      } catch {
        // Fall back to SIGKILL
      }
    }

    try {
      this.child.kill('SIGKILL');
    } catch {
      // Ignored if already dead
    }

    this.finalize(1, reason);
  }

  private handleChunk(stream: 'stdout' | 'stderr', text: string): void {
    if (stream === 'stdout') {
      this.retainedStdout += text;
      if (this.retainedStdout.length > MAX_RETAINED_OUTPUT_CHARS) {
        this.stdoutTruncated = true;
        this.retainedStdout =
          '\n--- [STDOUT TRUNCATED — EXCEEDED 5 MB BUFFER] ---\n' +
          this.retainedStdout.slice(this.retainedStdout.length - 4 * 1024 * 1024);
      }
    } else {
      this.retainedStderr += text;
      if (this.retainedStderr.length > MAX_RETAINED_OUTPUT_CHARS) {
        this.stderrTruncated = true;
        this.retainedStderr =
          '\n--- [STDERR TRUNCATED — EXCEEDED 5 MB BUFFER] ---\n' +
          this.retainedStderr.slice(this.retainedStderr.length - 4 * 1024 * 1024);
      }
    }

    this.retainedOutput += text;
    if (this.retainedOutput.length > MAX_RETAINED_OUTPUT_CHARS) {
      this.outputTruncated = true;
      // Retain the last 4 MB
      this.retainedOutput =
        '\n--- [OUTPUT TRUNCATED — LOG EXCEEDED 5 MB RETAINED BUFFER] ---\n' +
        this.retainedOutput.slice(this.retainedOutput.length - 4 * 1024 * 1024);
    }

    const chunk: ProcessOutputChunk = {
      sessionId: this.id,
      stream,
      text,
      timestamp: new Date().toISOString(),
    };

    this.callbacks?.onChunk?.(chunk);
  }

  private finalize(exitCode: number, status: ProcessStatus): void {
    if (this.isFinalized) return;
    this.isFinalized = true;

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }

    this.exitCode = exitCode;
    this.status = status;
    this.endedAt = new Date().toISOString();
    this.durationMs = Date.now() - this.startTimeMs;

    const info = this.getSessionInfo();
    this.notifyState();
    this.resolveCompletion(info);
  }

  private notifyState(): void {
    this.callbacks?.onStateChange?.(this.getSessionInfo());
  }

  public getSessionInfo(): ProcessSessionInfo {
    return {
      id: this.id,
      requestId: this.requestId,
      runId: this.runId,
      projectId: this.projectId,
      commandDisplay: this.commandDisplay,
      packageManager: this.packageManager,
      executable: this.executable,
      args: [...this.args],
      cwd: this.cwd,
      pid: this.pid,
      status: this.status,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      durationMs: this.durationMs,
      exitCode: this.exitCode,
      retainedStdout: this.retainedStdout,
      retainedStderr: this.retainedStderr,
      retainedOutput: this.retainedOutput,
      stdoutTruncated: this.stdoutTruncated,
      stderrTruncated: this.stderrTruncated,
      outputTruncated: this.outputTruncated,
    };
  }

  public getBoundedOutputForModel(maxBytes: number = 32 * 1024): { stdout: string; stderr: string } {
    const stdout = this.retainedStdout;
    const stderr = this.retainedStderr;

    if (stdout.length + stderr.length <= maxBytes) {
      return { stdout, stderr };
    }

    // Allocate budget: if stderr is non-empty, ensure it gets a fair share (up to half the budget)
    let stderrBudget = Math.floor(maxBytes / 2);
    let stdoutBudget = maxBytes - stderrBudget;

    if (stderr.length < stderrBudget) {
      // Stderr needs less than half, give remainder to stdout
      stdoutBudget = maxBytes - stderr.length;
      stderrBudget = stderr.length;
    } else if (stdout.length < stdoutBudget) {
      // Stdout needs less than half, give remainder to stderr
      stderrBudget = maxBytes - stdout.length;
      stdoutBudget = stdout.length;
    }

    const boundStream = (text: string, budget: number): string => {
      if (text.length <= budget) return text;
      const prefix = '... [truncated output] ...\n';
      const sliceLength = Math.max(0, budget - prefix.length);
      return prefix + text.slice(text.length - sliceLength);
    };

    return {
      stdout: boundStream(stdout, stdoutBudget),
      stderr: boundStream(stderr, stderrBudget),
    };
  }
}
