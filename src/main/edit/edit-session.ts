import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WorkspaceGuard } from '../workspace/guard';
import { WorkspaceTools } from '../workspace/tools';
import { FileReadResult } from '../workspace/types';
import { MutationPolicy } from './mutation-policy';
import { CheckpointService } from './checkpoint-service';
import {
  CheckpointManifest,
  DEFAULT_MUTATION_LIMITS,
  EditToolResult,
  MutationLimits,
  ReadRecord,
} from './types';
import {
  ConcurrencyConflictError,
  MutationBlockedError,
  ReadBeforeWriteError,
} from './errors';
import { normalizeWorkspacePath } from '../workspace/path-policy';

export class EditSession {
  public readonly guard: WorkspaceGuard;
  public readonly tools: WorkspaceTools;
  public readonly mutationPolicy: MutationPolicy;
  public readonly checkpointService: CheckpointService;
  public readonly manifest: CheckpointManifest;
  public readonly limits: MutationLimits;

  private readFiles = new Map<string, ReadRecord>();
  private touchedFiles = new Set<string>();
  private cumulativeBytesWritten = 0;
  private appliedFingerprints = new Set<string>();

  public computeFingerprint(parts: string[]): string {
    return crypto.createHash('sha256').update(parts.join('\0')).digest('hex');
  }

  public hasMutationFingerprint(fingerprint: string): boolean {
    return this.appliedFingerprints.has(fingerprint);
  }

  public getAppliedFingerprints(): string[] {
    return Array.from(this.appliedFingerprints);
  }

  constructor(options: {
    guard: WorkspaceGuard;
    checkpointService: CheckpointService;
    manifest: CheckpointManifest;
    mutationPolicy?: MutationPolicy;
    limits?: Partial<MutationLimits>;
  }) {
    this.guard = options.guard;
    this.tools = new WorkspaceTools(options.guard);
    this.checkpointService = options.checkpointService;
    this.manifest = options.manifest;
    this.limits = {
      ...DEFAULT_MUTATION_LIMITS,
      ...options.limits,
    };
    this.mutationPolicy = options.mutationPolicy || new MutationPolicy(this.limits);
  }

  public async initialize(): Promise<void> {
    // Lifecycle hook for session setup
  }

  public async close(): Promise<void> {
    // Lifecycle hook for session teardown
  }

  public getManifest(): CheckpointManifest {
    return this.manifest;
  }

  public getTouchedFiles(): string[] {
    return Array.from(this.touchedFiles);
  }

  public getCumulativeBytesWritten(): number {
    return this.cumulativeBytesWritten;
  }

  /**
   * Safe read_file wrapper that tracks read state for Read-Before-Write and Concurrency protection.
   */
  public async readFile(options: string | {
    path: string;
    startLine?: number;
    endLine?: number;
  }): Promise<FileReadResult> {
    const opts = typeof options === 'string' ? { path: options } : options;
    const result = await this.tools.readFile(opts);

    // If text file and succeeded, record canonical hash
    if (!result.isBinary && fs.existsSync(result.path)) {
      try {
        const fullBuf = fs.readFileSync(result.path);
        const sha256 = crypto.createHash('sha256').update(fullBuf).digest('hex');
        this.readFiles.set(result.path, {
          canonicalPath: result.path,
          relativePath: result.relativePath,
          sha256,
          timestamp: Date.now(),
        });
      } catch {
        // If read failed, will not be tracked
      }
    }

    return result;
  }

  /**
   * Tool: create_file
   * Creates a brand new text file inside the active workspace.
   * Refuses to overwrite existing files.
   */
  public async createFile(options: { path: string; content: string }): Promise<EditToolResult> {
    if (!options || typeof options.path !== 'string') {
      throw new MutationBlockedError('Path is required for create_file');
    }

    const check = this.guard.resolveWritePath(options.path);
    if (!check.allowed) {
      throw new MutationBlockedError(check.error || `Access denied to path: ${options.path}`);
    }

    this.mutationPolicy.assertMutablePath(check.relativePath);
    const bytes = this.mutationPolicy.assertWriteContentSafe(options.content, check.relativePath);

    // Limit checks
    if (!this.touchedFiles.has(check.relativePath) && this.touchedFiles.size >= this.limits.maxTouchedFiles) {
      throw new MutationBlockedError(
        `Touched files limit (${this.limits.maxTouchedFiles}) exceeded for this Edit run.`
      );
    }
    if (this.cumulativeBytesWritten + bytes > this.limits.maxCumulativeWriteBytes) {
      throw new MutationBlockedError(
        `Cumulative write bytes limit (${this.limits.maxCumulativeWriteBytes} bytes) exceeded.`
      );
    }

    const contentHash = crypto.createHash('sha256').update(Buffer.from(options.content, 'utf8')).digest('hex');
    const fingerprint = this.computeFingerprint(['create', check.relativePath, contentHash]);

    if (fs.existsSync(check.canonicalPath)) {
      if (this.appliedFingerprints.has(fingerprint)) {
        try {
          const diskContent = fs.readFileSync(check.canonicalPath, 'utf8');
          if (diskContent === options.content) {
            return {
              success: true,
              status: 'success',
              alreadyApplied: true,
              message: `File "${check.relativePath}" has already been created with this identical content in this session. Do not repeat this operation.`,
              relativePath: check.relativePath,
              bytesWritten: 0,
              operation: 'create',
            };
          }
        } catch {
          // If disk read fails, fall through to error below
        }
      }

      throw new MutationBlockedError(
        `File already exists: "${check.relativePath}". Use replace_in_file or write_file to modify existing files.`,
        check.relativePath
      );
    }

    // Baseline snapshot before mutation
    this.checkpointService.snapshotFileBeforeMutation(
      this.manifest,
      check.relativePath,
      check.canonicalPath
    );

    // Track newly created parent directories for rollback cleanup
    const targetDir = path.dirname(check.canonicalPath);
    const createdDirs: string[] = [];
    let cur = targetDir;
    while (cur && cur !== this.guard.canonicalRootPath && !fs.existsSync(cur)) {
      const relDir = normalizeWorkspacePath(path.relative(this.guard.canonicalRootPath, cur));
      createdDirs.push(relDir);
      cur = path.dirname(cur);
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(check.canonicalPath, options.content, 'utf8');

    // Update hashes and tracking
    const newHash = crypto.createHash('sha256').update(Buffer.from(options.content, 'utf8')).digest('hex');
    this.readFiles.set(check.canonicalPath, {
      canonicalPath: check.canonicalPath,
      relativePath: check.relativePath,
      sha256: newHash,
      timestamp: Date.now(),
    });

    this.checkpointService.recordMutationSuccess(
      this.manifest,
      check.relativePath,
      newHash,
      createdDirs
    );

    this.appliedFingerprints.add(fingerprint);
    this.touchedFiles.add(check.relativePath);
    this.cumulativeBytesWritten += bytes;

    return {
      success: true,
      status: 'success',
      message: `Created file "${check.relativePath}" (${bytes} bytes).`,
      relativePath: check.relativePath,
      bytesWritten: bytes,
      operation: 'create',
    };
  }

  /**
   * Tool: replace_in_file
   * Performs surgical string replacement in an existing file.
   * Requires Read-Before-Write and Optimistic Concurrency verification.
   */
  public async replaceInFile(options: {
    path: string;
    oldText?: string;
    targetContent?: string;
    newText?: string;
    replacementContent?: string;
    replaceAll?: boolean;
    allowMultiple?: boolean;
  }): Promise<EditToolResult> {
    if (!options || typeof options.path !== 'string') {
      throw new MutationBlockedError('Path is required for replace_in_file');
    }

    const check = this.guard.resolveWritePath(options.path);
    if (!check.allowed) {
      throw new MutationBlockedError(check.error || `Access denied to path: ${options.path}`);
    }

    // Read-Before-Write check must happen on target file before oldText checking
    const readRecord = this.readFiles.get(check.canonicalPath);
    if (!readRecord) {
      throw new ReadBeforeWriteError(check.relativePath);
    }

    const oldText = options.oldText ?? options.targetContent;
    const newText = options.newText ?? options.replacementContent;
    const replaceAll = Boolean(options.replaceAll ?? options.allowMultiple);

    if (typeof oldText !== 'string' || oldText.length === 0) {
      throw new MutationBlockedError('oldText must be a non-empty string');
    }
    if (typeof newText !== 'string') {
      throw new MutationBlockedError('newText must be a string');
    }

    this.mutationPolicy.assertMutablePath(check.relativePath);

    if (!fs.existsSync(check.canonicalPath)) {
      throw new MutationBlockedError(
        `File does not exist: "${check.relativePath}". Use create_file to create new files.`,
        check.relativePath
      );
    }

    this.mutationPolicy.assertExistingFileIsText(check.canonicalPath, check.relativePath);

    // 2. Optimistic Concurrency check
    const currentBuf = fs.readFileSync(check.canonicalPath);
    const currentHash = crypto.createHash('sha256').update(currentBuf).digest('hex');
    if (currentHash !== readRecord.sha256) {
      throw new ConcurrencyConflictError(check.relativePath);
    }

    const currentText = currentBuf.toString('utf8');

    // 3. Match validation
    const fingerprint = this.computeFingerprint([
      'replace',
      check.relativePath,
      oldText,
      newText,
      replaceAll ? 'all' : 'single',
    ]);

    const occurrences = currentText.split(oldText).length - 1;
    if (occurrences === 0) {
      // Idempotency detection:
      // If this exact replacement was already successfully applied in this session,
      // and newText is present in the file, return alreadyApplied without disk mutation.
      if (this.appliedFingerprints.has(fingerprint) && currentText.includes(newText)) {
        return {
          success: true,
          status: 'success',
          alreadyApplied: true,
          message: `The requested edit is already applied to "${check.relativePath}". Do not repeat this operation. Continue with any remaining requested work or provide your final summary.`,
          relativePath: check.relativePath,
          bytesWritten: 0,
          operation: 'modify',
        };
      }

      throw new MutationBlockedError(
        `Target oldText was not found in "${check.relativePath}". Inspect the current file contents.`,
        check.relativePath
      );
    }

    if (occurrences > 1 && replaceAll !== true) {
      throw new MutationBlockedError(
        `Found ${occurrences} occurrences of target text in "${check.relativePath}". Provide a larger unique context block or set replaceAll: true.`,
        check.relativePath
      );
    }

    const replacedText = replaceAll
      ? currentText.split(oldText).join(newText)
      : currentText.replace(oldText, newText);

    const bytes = this.mutationPolicy.assertWriteContentSafe(replacedText, check.relativePath);

    // Limit checks
    if (!this.touchedFiles.has(check.relativePath) && this.touchedFiles.size >= this.limits.maxTouchedFiles) {
      throw new MutationBlockedError(
        `Touched files limit (${this.limits.maxTouchedFiles}) exceeded for this Edit run.`
      );
    }
    if (this.cumulativeBytesWritten + bytes > this.limits.maxCumulativeWriteBytes) {
      throw new MutationBlockedError(
        `Cumulative write bytes limit (${this.limits.maxCumulativeWriteBytes} bytes) exceeded.`
      );
    }

    // 4. Baseline snapshot before mutation
    this.checkpointService.snapshotFileBeforeMutation(
      this.manifest,
      check.relativePath,
      check.canonicalPath
    );

    // 5. Write mutation
    fs.writeFileSync(check.canonicalPath, replacedText, 'utf8');

    const newHash = crypto.createHash('sha256').update(Buffer.from(replacedText, 'utf8')).digest('hex');
    this.readFiles.set(check.canonicalPath, {
      canonicalPath: check.canonicalPath,
      relativePath: check.relativePath,
      sha256: newHash,
      timestamp: Date.now(),
    });

    this.checkpointService.recordMutationSuccess(this.manifest, check.relativePath, newHash);
    this.appliedFingerprints.add(fingerprint);
    this.touchedFiles.add(check.relativePath);
    this.cumulativeBytesWritten += bytes;

    return {
      success: true,
      status: 'success',
      message: `Replaced ${occurrences} occurrence(s) in "${check.relativePath}".`,
      relativePath: check.relativePath,
      bytesWritten: bytes,
      operation: 'modify',
    };
  }

  /**
   * Tool: write_file
   * Writes complete file content. If file exists, enforces Read-Before-Write and Concurrency checks.
   */
  public async writeFile(options: { path: string; content: string }): Promise<EditToolResult> {
    if (!options || typeof options.path !== 'string') {
      throw new MutationBlockedError('Path is required for write_file');
    }

    const check = this.guard.resolveWritePath(options.path);
    if (!check.allowed) {
      throw new MutationBlockedError(check.error || `Access denied to path: ${options.path}`);
    }

    // If file does not exist, treat as create
    if (!fs.existsSync(check.canonicalPath)) {
      return this.createFile(options);
    }

    this.mutationPolicy.assertMutablePath(check.relativePath);
    this.mutationPolicy.assertExistingFileIsText(check.canonicalPath, check.relativePath);
    const bytes = this.mutationPolicy.assertWriteContentSafe(options.content, check.relativePath);

    const contentHash = crypto.createHash('sha256').update(Buffer.from(options.content, 'utf8')).digest('hex');
    const fingerprint = this.computeFingerprint(['write', check.relativePath, contentHash]);

    // Read-Before-Write check
    const readRecord = this.readFiles.get(check.canonicalPath);
    if (!readRecord) {
      throw new ReadBeforeWriteError(check.relativePath);
    }

    // Concurrency check
    const currentBuf = fs.readFileSync(check.canonicalPath);
    const currentHash = crypto.createHash('sha256').update(currentBuf).digest('hex');
    if (currentHash !== readRecord.sha256) {
      throw new ConcurrencyConflictError(check.relativePath);
    }

    const currentText = currentBuf.toString('utf8');
    if (this.appliedFingerprints.has(fingerprint) && currentText === options.content) {
      return {
        success: true,
        status: 'success',
        alreadyApplied: true,
        message: `File "${check.relativePath}" already contains this exact content from this session. Do not repeat this write.`,
        relativePath: check.relativePath,
        bytesWritten: 0,
        operation: 'modify',
      };
    }

    // Limit checks
    if (!this.touchedFiles.has(check.relativePath) && this.touchedFiles.size >= this.limits.maxTouchedFiles) {
      throw new MutationBlockedError(
        `Touched files limit (${this.limits.maxTouchedFiles}) exceeded for this Edit run.`
      );
    }
    if (this.cumulativeBytesWritten + bytes > this.limits.maxCumulativeWriteBytes) {
      throw new MutationBlockedError(
        `Cumulative write bytes limit (${this.limits.maxCumulativeWriteBytes} bytes) exceeded.`
      );
    }

    // Baseline snapshot before mutation
    this.checkpointService.snapshotFileBeforeMutation(
      this.manifest,
      check.relativePath,
      check.canonicalPath
    );

    // Write file
    fs.writeFileSync(check.canonicalPath, options.content, 'utf8');

    const newHash = crypto.createHash('sha256').update(Buffer.from(options.content, 'utf8')).digest('hex');
    this.readFiles.set(check.canonicalPath, {
      canonicalPath: check.canonicalPath,
      relativePath: check.relativePath,
      sha256: newHash,
      timestamp: Date.now(),
    });

    this.checkpointService.recordMutationSuccess(this.manifest, check.relativePath, newHash);
    this.appliedFingerprints.add(fingerprint);
    this.touchedFiles.add(check.relativePath);
    this.cumulativeBytesWritten += bytes;

    return {
      success: true,
      status: 'success',
      message: `Overwrote file "${check.relativePath}" (${bytes} bytes).`,
      relativePath: check.relativePath,
      bytesWritten: bytes,
      operation: 'modify',
    };
  }

  /**
   * Tool: delete_file
   * Deletes a file. Directory deletion is strictly forbidden.
   * Requires Read-Before-Write and Concurrency checks.
   */
  public async deleteFile(options: string | { path: string }): Promise<EditToolResult> {
    const filePath = typeof options === 'string' ? options : options?.path;
    if (!filePath || typeof filePath !== 'string') {
      throw new MutationBlockedError('Path is required for delete_file');
    }

    const check = this.guard.resolveWritePath(filePath);
    if (!check.allowed) {
      throw new MutationBlockedError(check.error || `Access denied to path: ${filePath}`);
    }

    this.mutationPolicy.assertMutablePath(check.relativePath);

    const fingerprint = this.computeFingerprint(['delete', check.relativePath]);

    if (!fs.existsSync(check.canonicalPath)) {
      if (this.appliedFingerprints.has(fingerprint)) {
        return {
          success: true,
          status: 'success',
          alreadyApplied: true,
          message: `File "${check.relativePath}" was already successfully deleted in this session. Do not repeat this deletion.`,
          relativePath: check.relativePath,
          operation: 'delete',
        };
      }

      throw new MutationBlockedError(
        `Cannot delete non-existent file: "${check.relativePath}".`,
        check.relativePath
      );
    }

    const stat = fs.statSync(check.canonicalPath);
    if (stat.isDirectory()) {
      throw new MutationBlockedError(
        `Target is a directory: "${check.relativePath}". Directory deletion is not permitted.`,
        check.relativePath
      );
    }

    this.mutationPolicy.assertExistingFileIsText(check.canonicalPath, check.relativePath);

    // Read-Before-Write check
    const readRecord = this.readFiles.get(check.canonicalPath);
    if (!readRecord) {
      throw new ReadBeforeWriteError(check.relativePath);
    }

    // Concurrency check
    const currentBuf = fs.readFileSync(check.canonicalPath);
    const currentHash = crypto.createHash('sha256').update(currentBuf).digest('hex');
    if (currentHash !== readRecord.sha256) {
      throw new ConcurrencyConflictError(check.relativePath);
    }

    // Baseline snapshot before mutation
    this.checkpointService.snapshotFileBeforeMutation(
      this.manifest,
      check.relativePath,
      check.canonicalPath
    );

    // Delete file
    fs.unlinkSync(check.canonicalPath);

    this.checkpointService.recordFileDeleted(this.manifest, check.relativePath);
    this.appliedFingerprints.add(fingerprint);
    this.readFiles.delete(check.canonicalPath);
    this.touchedFiles.add(check.relativePath);

    return {
      success: true,
      status: 'success',
      message: `Deleted file "${check.relativePath}".`,
      relativePath: check.relativePath,
      operation: 'delete',
    };
  }
}
