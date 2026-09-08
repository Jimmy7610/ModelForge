import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  CheckpointFileEntry,
  CheckpointManifest,
  CheckpointSummary,
  RollbackResult,
  RollbackVerificationFailure,
} from './types';
import { CheckpointError } from './errors';
import { isBinaryFile, isIgnoredDirectory, isSensitiveFile } from '../workspace/file-policy';
import { normalizeWorkspacePath, resolveCanonicalPath } from '../workspace/path-policy';
import { WorkspaceGuard } from '../workspace/guard';
import { CHECKPOINT_SCHEMA_VERSION } from '../../shared/constants';

export class CheckpointService {
  private readonly baseStorageDir: string;
  private readonly maxTransactionBytes: number;

  constructor(customBaseDir?: string, maxTransactionBytes = 50 * 1024 * 1024) {
    if (customBaseDir) {
      this.baseStorageDir = path.resolve(customBaseDir);
    } else if (process.env.MODELFORGE_CHECKPOINTS_DIR) {
      this.baseStorageDir = path.resolve(process.env.MODELFORGE_CHECKPOINTS_DIR);
    } else {
      let userDataDir: string | undefined;
      try {
        // Attempt to resolve Electron app userData path if available
        const electron = require('electron');
        if (electron?.app?.getPath) {
          userDataDir = electron.app.getPath('userData');
        }
      } catch {
        // Not in Electron main runtime (e.g. unit tests)
      }
      this.baseStorageDir = userDataDir
        ? path.resolve(userDataDir, 'checkpoints')
        : path.resolve(os.homedir(), '.model-forge', 'checkpoints');
    }
    this.maxTransactionBytes = maxTransactionBytes;

    try {
      if (!fs.existsSync(this.baseStorageDir)) {
        fs.mkdirSync(this.baseStorageDir, { recursive: true });
      }
    } catch {
      // Handled lazily when writing
    }
  }

  /**
   * Validates that an identifier does not contain path separators, traversal, or invalid characters.
   */
  public static isValidProjectId(id: unknown): id is string {
    if (typeof id !== 'string' || !id.trim() || id.length > 128) {
      return false;
    }
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(id)) {
      return false;
    }
    const lower = id.toLowerCase();
    if (
      id === '.' ||
      id === '..' ||
      id.includes('..') ||
      id.includes('/') ||
      id.includes('\\') ||
      id.includes(':') ||
      id.includes('\0') ||
      lower.includes('%2e') ||
      lower.includes('%2f') ||
      lower.includes('%5c') ||
      lower.includes('%00')
    ) {
      return false;
    }
    return true;
  }

  /**
   * Validates that a checkpoint identifier matches the strict internal format.
   */
  public static isValidCheckpointId(id: unknown): id is string {
    if (typeof id !== 'string' || !id.trim() || id.length > 128) {
      return false;
    }
    if (!/^chk_[a-zA-Z0-9_\-]+$/.test(id)) {
      return false;
    }
    const lower = id.toLowerCase();
    if (
      id.includes('..') ||
      id.includes('/') ||
      id.includes('\\') ||
      id.includes(':') ||
      id.includes('\0') ||
      lower.includes('%2e') ||
      lower.includes('%2f') ||
      lower.includes('%5c') ||
      lower.includes('%00')
    ) {
      return false;
    }
    return true;
  }

  public getBaseStorageDir(): string {
    return this.baseStorageDir;
  }

  public getProjectCheckpointsDir(projectId: string): string {
    if (!CheckpointService.isValidProjectId(projectId)) {
      throw new CheckpointError(`Invalid project identifier: "${projectId}"`);
    }
    const resolved = path.resolve(this.baseStorageDir, projectId);
    const rel = path.relative(this.baseStorageDir, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new CheckpointError(`Project checkpoint path escape detected: "${projectId}"`);
    }
    return resolved;
  }

  public getCheckpointDir(projectId: string, checkpointId: string): string {
    if (!CheckpointService.isValidProjectId(projectId)) {
      throw new CheckpointError(`Invalid project identifier: "${projectId}"`);
    }
    if (!CheckpointService.isValidCheckpointId(checkpointId)) {
      throw new CheckpointError(`Invalid checkpoint identifier: "${checkpointId}"`);
    }
    const projDir = this.getProjectCheckpointsDir(projectId);
    const resolved = path.resolve(projDir, checkpointId);
    const rel = path.relative(projDir, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new CheckpointError(`Checkpoint path escape detected: "${checkpointId}"`);
    }
    return resolved;
  }

  private getManifestPath(projectId: string, checkpointId: string): string {
    return path.join(this.getCheckpointDir(projectId, checkpointId), 'manifest.json');
  }

  /**
   * Initializes an in-memory/on-disk automatic edit checkpoint.
   */
  public armAutomaticCheckpoint(
    projectId: string,
    projectRoot: string,
    description?: string
  ): CheckpointManifest {
    if (!CheckpointService.isValidProjectId(projectId)) {
      throw new CheckpointError(`Invalid project identifier: "${projectId}"`);
    }
    const checkpointId = `chk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const manifest: CheckpointManifest = {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      id: checkpointId,
      projectId,
      projectRoot: path.resolve(projectRoot),
      timestamp: new Date().toISOString(),
      type: 'automatic',
      status: 'armed',
      description: description || 'Automatic Edit Checkpoint',
      files: {},
      totalBackupBytes: 0,
    };

    return manifest;
  }

  public async createPendingCheckpoint(
    projectId: string,
    description?: string,
    projectRoot?: string
  ): Promise<CheckpointManifest> {
    const root = projectRoot || path.join(this.baseStorageDir, projectId, '_ws');
    const manifest = this.armAutomaticCheckpoint(projectId, root, description);
    this.ensurePending(manifest);
    return manifest;
  }

  public async getManifest(checkpointId: string, projectId: string): Promise<CheckpointManifest | null> {
    return this.loadManifest(projectId, checkpointId);
  }

  public async capturePreMutationSnapshot(
    checkpointId: string,
    projectId: string,
    relativePath: string,
    canonicalPath: string
  ): Promise<void> {
    const manifest = this.loadManifest(projectId, checkpointId);
    if (!manifest) throw new CheckpointError(`Checkpoint not found: ${checkpointId}`);
    this.snapshotFileBeforeMutation(manifest, relativePath, canonicalPath);
  }

  public async recordFileMutation(
    checkpointId: string,
    projectId: string,
    relativePath: string,
    op: 'create' | 'modify' | 'delete',
    canonicalPath: string
  ): Promise<void> {
    const manifest = this.loadManifest(projectId, checkpointId);
    if (!manifest) throw new CheckpointError(`Checkpoint not found: ${checkpointId}`);
    if (op === 'delete') {
      this.recordFileDeleted(manifest, relativePath);
    } else {
      let sha256 = '';
      if (fs.existsSync(canonicalPath)) {
        sha256 = crypto.createHash('sha256').update(fs.readFileSync(canonicalPath)).digest('hex');
      }
      this.recordMutationSuccess(manifest, relativePath, sha256);
    }
  }

  public async rollbackCheckpoint(
    checkpointId: string,
    projectId: string,
    authoritativeGuard: WorkspaceGuard
  ): Promise<RollbackResult> {
    return this.rollback(checkpointId, projectId, authoritativeGuard);
  }

  public async acceptCheckpoint(
    checkpointId: string,
    projectId: string,
    authoritativeGuard: WorkspaceGuard
  ): Promise<void> {
    const res = this.accept(checkpointId, projectId, authoritativeGuard);
    if (!res.success) {
      throw new CheckpointError(`Failed to accept checkpoint: ${checkpointId}`);
    }
  }

  public async scanForInterruptedCheckpoints(projectId: string): Promise<CheckpointSummary[]> {
    const list = this.listCheckpoints(projectId);
    return list.filter((c) => c.status === 'pending' || c.status === 'interrupted' || c.status === 'conflict');
  }

  /**
   * Ensures the checkpoint directory exists and writes the manifest with status 'pending'
   * BEFORE any file mutation occurs.
   */
  public ensurePending(manifest: CheckpointManifest): void {
    const checkpointDir = this.getCheckpointDir(manifest.projectId, manifest.id);
    const filesDir = path.join(checkpointDir, 'files');

    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }

    manifest.status = 'pending';
    this.saveManifest(manifest);
  }

  /**
   * Snapshots a file's original state BEFORE its first mutation in the current session.
   * If the file was already snapshotted, does nothing (preserves original baseline).
   */
  public snapshotFileBeforeMutation(
    manifest: CheckpointManifest,
    relativePath: string,
    canonicalPath: string
  ): void {
    const normRel = normalizeWorkspacePath(relativePath);

    // If already snapshotted during this transaction, do not overwrite original baseline!
    if (manifest.files[normRel]) {
      return;
    }

    this.ensurePending(manifest);

    const checkpointDir = this.getCheckpointDir(manifest.projectId, manifest.id);
    const filesDir = path.join(checkpointDir, 'files');

    if (!fs.existsSync(canonicalPath)) {
      // File did not exist before mutation
      manifest.files[normRel] = {
        relativePath: normRel,
        existedBefore: false,
      };
      this.saveManifest(manifest);
      return;
    }

    // Existing file baseline
    const buf = fs.readFileSync(canonicalPath);
    if (manifest.totalBackupBytes + buf.length > this.maxTransactionBytes) {
      throw new CheckpointError(
        `Unable to create a safe checkpoint for this change. Total transaction size limit (${this.maxTransactionBytes} bytes) exceeded.`,
        relativePath
      );
    }

    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const backupFileName = `${sha256}.bak`;
    const backupPath = path.join(filesDir, backupFileName);

    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, buf);
    }

    // Detect newline and BOM
    const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    const textSample = buf.toString('utf8', 0, Math.min(buf.length, 4096));
    const newlineStyle: 'crlf' | 'lf' = textSample.includes('\r\n') ? 'crlf' : 'lf';

    const entry: CheckpointFileEntry = {
      relativePath: normRel,
      existedBefore: true,
      originalSha256: sha256,
      originalSizeBytes: buf.length,
      backupFileName,
      newlineStyle,
      hasBom,
    };

    manifest.files[normRel] = entry;
    manifest.totalBackupBytes += buf.length;
    this.saveManifest(manifest);
  }

  /**
   * Records the post-mutation SHA-256 written by the agent for conflict detection.
   */
  public recordMutationSuccess(
    manifest: CheckpointManifest,
    relativePath: string,
    newSha256: string,
    createdParentDirs?: string[]
  ): void {
    const normRel = normalizeWorkspacePath(relativePath);
    const entry = manifest.files[normRel];
    if (entry) {
      entry.lastAgentSha256 = newSha256;
      if (createdParentDirs && createdParentDirs.length > 0) {
        entry.createdParentDirs = createdParentDirs;
      }
      this.saveManifest(manifest);
    }
  }

  /**
   * Records that a file was deleted by the agent.
   */
  public recordFileDeleted(manifest: CheckpointManifest, relativePath: string): void {
    const normRel = normalizeWorkspacePath(relativePath);
    const entry = manifest.files[normRel];
    if (entry) {
      entry.lastAgentSha256 = undefined;
      this.saveManifest(manifest);
    }
  }

  /**
   * Saves the manifest to disk atomically using a temp file and rename.
   *
   * WINDOWS SAFETY: Node.js fs.renameSync on Windows CAN atomically replace an existing
   * destination file without deleting it first (verified with Node runtime). We NEVER
   * unlink the destination before rename — that would create a crash window where no valid
   * manifest exists on disk.
   *
   * Flow:
   *   1. Write to temp file in same directory (same filesystem = atomic rename)
   *   2. fsync the file descriptor for durability
   *   3. Close the file descriptor
   *   4. Atomically rename temp over destination (replaces atomically on Windows)
   *   5. Cleanup temp only on failure — never delete destination first
   */
  public saveManifest(manifest: CheckpointManifest): void {
    const manifestPath = this.getManifestPath(manifest.projectId, manifest.id);
    const dir = path.dirname(manifestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = path.join(dir, `manifest.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`);

    // Step 1-3: Write, fsync, close via fd
    let fd: number | undefined;
    try {
      fd = fs.openSync(tempPath, 'w');
      const content = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
      fs.writeSync(fd, content);
      try {
        fs.fsyncSync(fd);
      } catch {
        // fsync may fail on some virtual filesystems - non-fatal for correctness
      }
      fs.closeSync(fd);
      fd = undefined;
    } catch (err) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* ignore */ }
      }
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* ignore */ }
      throw new CheckpointError(`Failed to write checkpoint manifest temp file: ${err}`);
    }

    // Step 4: Atomic rename — never unlink destination first
    try {
      fs.renameSync(tempPath, manifestPath);
    } catch (err) {
      // Rename failed — original manifest is untouched, clean up temp
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* ignore */ }
      throw new CheckpointError(`Failed to atomically replace checkpoint manifest: ${err}`);
    }
  }

  /**
   * Loads a manifest from disk with strict schema version, namespace, and integrity checks.
   */
  public loadManifest(projectId: string, checkpointId: string): CheckpointManifest | null {
    try {
      const manifestPath = this.getManifestPath(projectId, checkpointId);
      if (!fs.existsSync(manifestPath)) {
        return null;
      }
      const content = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(content) as CheckpointManifest;

      if (!manifest || typeof manifest !== 'object') {
        throw new CheckpointError('Malformed checkpoint manifest');
      }

      // Check schemaVersion
      if (typeof manifest.schemaVersion !== 'number' || manifest.schemaVersion > CHECKPOINT_SCHEMA_VERSION) {
        throw new CheckpointError(`Unsupported checkpoint schema version: ${manifest?.schemaVersion}`);
      }

      // Namespace validation
      if (manifest.projectId !== projectId) {
        throw new CheckpointError(
          `Checkpoint project ID mismatch: manifest belongs to "${manifest.projectId}", requested for "${projectId}"`
        );
      }

      if (manifest.id !== checkpointId) {
        throw new CheckpointError(
          `Checkpoint ID mismatch: manifest ID "${manifest.id}" does not match requested "${checkpointId}"`
        );
      }

      return manifest;
    } catch (err) {
      if (err instanceof CheckpointError) throw err;
      return null;
    }
  }

  /**
   * Marks a pending checkpoint as accepted after validating registered project authority.
   * authoritativeGuard is MANDATORY - manifest.projectRoot is never trusted as authority.
   */
  public accept(
    checkpointId: string,
    projectId: string,
    authoritativeGuard: WorkspaceGuard
  ): { success: boolean } {
    if (!(authoritativeGuard instanceof WorkspaceGuard)) {
      throw new CheckpointError(
        'accept() requires a mandatory WorkspaceGuard constructed from the registered project. manifest.projectRoot is not a security authority.'
      );
    }

    const manifest = this.loadManifest(projectId, checkpointId);
    if (!manifest) {
      throw new CheckpointError(`Checkpoint not found: ${checkpointId}`);
    }

    // Verify manifest belongs to the requested project (namespace)
    if (manifest.projectId !== projectId) {
      throw new CheckpointError(
        `Checkpoint project mismatch: manifest belongs to "${manifest.projectId}", not "${projectId}"`
      );
    }

    // Verify authoritative guard root matches manifest root exactly
    const canonicalManifestRoot = resolveCanonicalPath(manifest.projectRoot);
    const matchesRoot =
      process.platform === 'win32'
        ? normalizeWorkspacePath(authoritativeGuard.canonicalRootPath).toLowerCase() ===
          normalizeWorkspacePath(canonicalManifestRoot).toLowerCase()
        : authoritativeGuard.canonicalRootPath === canonicalManifestRoot;

    if (!matchesRoot) {
      throw new CheckpointError('Checkpoint workspace location no longer matches the registered project.');
    }

    manifest.status = 'accepted';
    this.saveManifest(manifest);
    this.cleanupOldCheckpoints(projectId);

    return { success: true };
  }

  /**
   * Restores files to their exact pre-edit baseline.
   *
   * SECURITY ENFORCEMENTS:
   * 1. manifest.projectRoot is NEVER trusted as authorization; registered project guard is authoritative.
   * 2. Every relative path is re-validated through WorkspaceGuard.resolveWritePath().
   * 3. Backup file names must match strict format ^[a-f0-9]{64}\.bak$ and resolve strictly inside files/.
   * 4. Backup SHA-256 integrity is checked before restoration.
   * 5. Preflight is ALL-OR-NOTHING: any conflict or validation failure aborts before ANY file is modified.
   * 6. authoritativeGuard is MANDATORY - manifest.projectRoot is NEVER used as security authority.
   */
  public rollback(
    checkpointId: string,
    projectId: string,
    authoritativeGuard: WorkspaceGuard
  ): RollbackResult {
    // Guard must be a real WorkspaceGuard from the registered project
    if (!(authoritativeGuard instanceof WorkspaceGuard)) {
      return {
        success: false,
        checkpointId,
        restoredFiles: [],
        deletedCreatedFiles: [],
        cleanedDirs: [],
        conflicts: [],
        error: 'rollback() requires a mandatory WorkspaceGuard from the registered project. manifest.projectRoot is not a security authority.',
      };
    }

    let manifest: CheckpointManifest | null = null;
    try {
      manifest = this.loadManifest(projectId, checkpointId);
    } catch (err: any) {
      return {
        success: false,
        checkpointId,
        restoredFiles: [],
        deletedCreatedFiles: [],
        cleanedDirs: [],
        conflicts: [],
        error: err.message || `Malformed checkpoint: ${checkpointId}`,
      };
    }

    if (!manifest) {
      return {
        success: false,
        checkpointId,
        restoredFiles: [],
        deletedCreatedFiles: [],
        cleanedDirs: [],
        conflicts: [],
        error: `Checkpoint not found: ${checkpointId}`,
      };
    }

    // Verify manifest belongs to the requested project namespace
    if (manifest.projectId !== projectId) {
      return {
        success: false,
        checkpointId,
        restoredFiles: [],
        deletedCreatedFiles: [],
        cleanedDirs: [],
        conflicts: [],
        error: `Checkpoint project mismatch: manifest belongs to "${manifest.projectId}", not "${projectId}"`,
      };
    }

    const guard = authoritativeGuard;
    const canonicalTarget = guard.canonicalRootPath;
    const canonicalManifestRoot = resolveCanonicalPath(manifest.projectRoot);
    const matchesRoot =
      process.platform === 'win32'
        ? normalizeWorkspacePath(canonicalTarget).toLowerCase() ===
          normalizeWorkspacePath(canonicalManifestRoot).toLowerCase()
        : canonicalTarget === canonicalManifestRoot;

    if (!matchesRoot) {
      return {
        success: false,
        checkpointId,
        restoredFiles: [],
        deletedCreatedFiles: [],
        cleanedDirs: [],
        conflicts: [],
        error: 'Checkpoint workspace location no longer matches the registered project.',
      };
    }

    const checkpointDir = this.getCheckpointDir(projectId, checkpointId);
    const filesDir = path.join(checkpointDir, 'files');
    const conflicts: Array<{ relativePath: string; reason: string }> = [];

    interface ValidatedItem {
      relPath: string;
      entry: CheckpointFileEntry;
      targetCanonicalPath: string;
      backupBytes: Buffer | null;
    }

    const validatedItems: ValidatedItem[] = [];

    // ==========================================
    // STEP 1: ALL-OR-NOTHING PREFLIGHT
    // ==========================================
    for (const [relPath, entry] of Object.entries(manifest.files)) {
      // Path syntax check
      if (
        !relPath ||
        typeof relPath !== 'string' ||
        path.isAbsolute(relPath) ||
        relPath.includes('..') ||
        relPath.includes('\0') ||
        relPath.includes(':')
      ) {
        return {
          success: false,
          checkpointId,
          restoredFiles: [],
          deletedCreatedFiles: [],
          cleanedDirs: [],
          conflicts: [],
          error: `Invalid or unsafe path in checkpoint manifest: "${relPath}"`,
        };
      }

      // Authoritative workspace containment validation
      let targetCanonicalPath: string;
      try {
        const writeCheck = guard.resolveWritePath(relPath);
        if (!writeCheck.allowed) {
          return {
            success: false,
            checkpointId,
            restoredFiles: [],
            deletedCreatedFiles: [],
            cleanedDirs: [],
            conflicts: [],
            error: `Manifest path failed workspace containment validation: "${relPath}" (${writeCheck.error})`,
          };
        }
        targetCanonicalPath = writeCheck.canonicalPath;
      } catch (err: any) {
        return {
          success: false,
          checkpointId,
          restoredFiles: [],
          deletedCreatedFiles: [],
          cleanedDirs: [],
          conflicts: [],
          error: `Manifest path failed workspace containment validation: "${relPath}" (${err.message})`,
        };
      }

      let backupBytes: Buffer | null = null;

      if (entry.existedBefore) {
        if (!entry.backupFileName || typeof entry.backupFileName !== 'string') {
          return {
            success: false,
            checkpointId,
            restoredFiles: [],
            deletedCreatedFiles: [],
            cleanedDirs: [],
            conflicts: [],
            error: `Missing backupFileName for existing file entry: "${relPath}"`,
          };
        }

        // Strict backup filename format
        if (!/^[a-f0-9]{64}\.bak$/.test(entry.backupFileName)) {
          return {
            success: false,
            checkpointId,
            restoredFiles: [],
            deletedCreatedFiles: [],
            cleanedDirs: [],
            conflicts: [],
            error: `Invalid or untrusted backup filename: "${entry.backupFileName}"`,
          };
        }

        const backupFullPath = path.resolve(filesDir, entry.backupFileName);
        const backupRel = path.relative(filesDir, backupFullPath);
        if (backupRel.startsWith('..') || path.isAbsolute(backupRel)) {
          return {
            success: false,
            checkpointId,
            restoredFiles: [],
            deletedCreatedFiles: [],
            cleanedDirs: [],
            conflicts: [],
            error: `Backup path escape detected for: "${entry.backupFileName}"`,
          };
        }

        if (!fs.existsSync(backupFullPath)) {
          return {
            success: false,
            checkpointId,
            restoredFiles: [],
            deletedCreatedFiles: [],
            cleanedDirs: [],
            conflicts: [],
            error: `Checkpoint backup file missing: "${entry.backupFileName}"`,
          };
        }

        // Backup integrity check
        backupBytes = fs.readFileSync(backupFullPath);
        const backupSha256 = crypto.createHash('sha256').update(backupBytes).digest('hex');
        if (entry.originalSha256 && backupSha256 !== entry.originalSha256) {
          return {
            success: false,
            checkpointId,
            restoredFiles: [],
            deletedCreatedFiles: [],
            cleanedDirs: [],
            conflicts: [],
            error: 'Checkpoint backup integrity verification failed.',
          };
        }

        // External conflict check
        if (entry.lastAgentSha256 && fs.existsSync(targetCanonicalPath)) {
          try {
            const currentDiskBytes = fs.readFileSync(targetCanonicalPath);
            const currentDiskSha256 = crypto.createHash('sha256').update(currentDiskBytes).digest('hex');
            if (currentDiskSha256 !== entry.lastAgentSha256) {
              conflicts.push({
                relativePath: relPath,
                reason: 'File changed outside Model Forge after agent edit.',
              });
            }
          } catch (err) {
            conflicts.push({
              relativePath: relPath,
              reason: `Unable to inspect current file for conflict: ${err}`,
            });
          }
        }
      } else {
        // File did not exist before agent created it
        if (entry.lastAgentSha256 && fs.existsSync(targetCanonicalPath)) {
          try {
            const currentDiskBytes = fs.readFileSync(targetCanonicalPath);
            const currentDiskSha256 = crypto.createHash('sha256').update(currentDiskBytes).digest('hex');
            if (currentDiskSha256 !== entry.lastAgentSha256) {
              conflicts.push({
                relativePath: relPath,
                reason: 'File created by agent was modified outside Model Forge.',
              });
            }
          } catch (err) {
            conflicts.push({
              relativePath: relPath,
              reason: `Unable to inspect current file for conflict: ${err}`,
            });
          }
        }
      }

      validatedItems.push({
        relPath,
        entry,
        targetCanonicalPath,
        backupBytes,
      });
    }

    if (conflicts.length > 0) {
      manifest.status = 'conflict';
      this.saveManifest(manifest);
      return {
        success: false,
        checkpointId,
        restoredFiles: [],
        deletedCreatedFiles: [],
        cleanedDirs: [],
        conflicts,
        error: `${conflicts.length} rollback conflict(s) detected. File was changed outside Model Forge after agent edit.`,
      };
    }

    // ==========================================
    // STEP 2: ATOMIC EXECUTION (ZERO WRITES BEFORE THIS POINT)
    // ==========================================
    // Capture pre-rollback in-memory backups of files about to be modified
    // for safe rollback-of-rollback if a disk write fails mid-execution.
    const preRollbackBackups = new Map<string, { existed: boolean; bytes?: Buffer }>();
    for (const item of validatedItems) {
      if (fs.existsSync(item.targetCanonicalPath)) {
        try {
          preRollbackBackups.set(item.targetCanonicalPath, {
            existed: true,
            bytes: fs.readFileSync(item.targetCanonicalPath),
          });
        } catch {
          // ignore read error during pre-backup
        }
      } else {
        preRollbackBackups.set(item.targetCanonicalPath, { existed: false });
      }
    }

    const restoredFiles: string[] = [];
    const deletedCreatedFiles: string[] = [];
    const cleanedDirs: string[] = [];

    try {
      for (const item of validatedItems) {
        if (!item.entry.existedBefore) {
          if (fs.existsSync(item.targetCanonicalPath)) {
            fs.unlinkSync(item.targetCanonicalPath);
            deletedCreatedFiles.push(item.relPath);
          }

          if (item.entry.createdParentDirs && item.entry.createdParentDirs.length > 0) {
            for (const dirRel of item.entry.createdParentDirs) {
              try {
                const checkDir = guard.resolveWritePath(dirRel);
                if (checkDir.allowed && fs.existsSync(checkDir.canonicalPath) && fs.readdirSync(checkDir.canonicalPath).length === 0) {
                  fs.rmdirSync(checkDir.canonicalPath);
                  cleanedDirs.push(dirRel);
                }
              } catch {
                // ignore directory removal error
              }
            }
          }
        } else {
          if (item.backupBytes) {
            const parentDir = path.dirname(item.targetCanonicalPath);
            if (!fs.existsSync(parentDir)) {
              fs.mkdirSync(parentDir, { recursive: true });
            }
            fs.writeFileSync(item.targetCanonicalPath, item.backupBytes);
            restoredFiles.push(item.relPath);
          }
        }
      }
    } catch (writeErr: any) {
      // Disk write failed mid-execution: attempt restoring pre-rollback in-memory state
      for (const [targetPath, backup] of preRollbackBackups.entries()) {
        try {
          if (backup.existed && backup.bytes) {
            fs.writeFileSync(targetPath, backup.bytes);
          } else if (!backup.existed && fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
        } catch {
          // ignore fallback restore errors
        }
      }
      manifest.status = 'conflict';
      this.saveManifest(manifest);
      return {
        success: false,
        verified: false,
        checkpointId,
        restoredFiles,
        deletedCreatedFiles,
        cleanedDirs,
        conflicts: [{ relativePath: 'rollback', reason: `Disk write failed during rollback: ${writeErr.message}` }],
        error: `Disk write failed during rollback: ${writeErr.message}`,
      };
    }

    // ==========================================
    // STEP 3: MANDATORY POSTCONDITION VERIFICATION
    // Verify that the disk state ACTUALLY matches baseline before declaring success.
    // ==========================================
    const verifiedFiles: string[] = [];
    const verificationFailures: RollbackVerificationFailure[] = [];

    for (const item of validatedItems) {
      if (!item.entry.existedBefore) {
        // Agent-created file must NOT exist on disk after rollback
        if (fs.existsSync(item.targetCanonicalPath)) {
          verificationFailures.push({
            relativePath: item.relPath,
            reason: `Agent-created file still exists on disk after rollback: "${item.relPath}"`,
          });
        } else {
          verifiedFiles.push(item.relPath);
        }
      } else {
        // Pre-existing file must exist on disk AND its SHA-256 must match originalSha256
        if (!fs.existsSync(item.targetCanonicalPath)) {
          verificationFailures.push({
            relativePath: item.relPath,
            expectedSha256: item.entry.originalSha256,
            reason: `Restored baseline file is missing on disk: "${item.relPath}"`,
          });
        } else {
          try {
            const diskBytes = fs.readFileSync(item.targetCanonicalPath);
            const diskSha = crypto.createHash('sha256').update(diskBytes).digest('hex');
            if (item.entry.originalSha256 && diskSha !== item.entry.originalSha256) {
              verificationFailures.push({
                relativePath: item.relPath,
                expectedSha256: item.entry.originalSha256,
                actualSha256: diskSha,
                reason: `Restored file SHA-256 mismatch on disk: expected ${item.entry.originalSha256}, got ${diskSha}`,
              });
            } else {
              verifiedFiles.push(item.relPath);
            }
          } catch (readErr: any) {
            verificationFailures.push({
              relativePath: item.relPath,
              expectedSha256: item.entry.originalSha256,
              reason: `Failed to verify restored file on disk: ${readErr.message}`,
            });
          }
        }
      }
    }

    if (verificationFailures.length > 0) {
      // DO NOT mark rolled_back if even one file fails verification
      manifest.status = 'conflict';
      this.saveManifest(manifest);
      return {
        success: false,
        verified: false,
        checkpointId,
        restoredFiles,
        deletedCreatedFiles,
        cleanedDirs,
        conflicts: verificationFailures.map((vf) => ({
          relativePath: vf.relativePath,
          reason: vf.reason,
        })),
        verificationFailures,
        error: `Rollback verification failed for ${verificationFailures.length} file(s). Workspace was not fully restored to baseline.`,
      };
    }

    // ONLY when EVERY file is verified against the filesystem:
    manifest.status = 'rolled_back';
    this.saveManifest(manifest);
    this.cleanupOldCheckpoints(projectId);

    return {
      success: true,
      verified: true,
      checkpointId,
      restoredFiles,
      deletedCreatedFiles,
      cleanedDirs,
      conflicts: [],
      verifiedFiles,
    };
  }

  /**
   * Scans for any checkpoint with status 'pending', 'interrupted', or 'conflict' for crash recovery.
   */
  public getPendingCheckpoint(projectId: string): CheckpointSummary | null {
    const list = this.listCheckpoints(projectId);
    const pending = list.find((c) => c.status === 'pending' || c.status === 'interrupted' || c.status === 'conflict');
    return pending || null;
  }

  /**
   * Lists all checkpoints for a project.
   */
  public listCheckpoints(projectId: string): CheckpointSummary[] {
    let projectDir: string;
    try {
      projectDir = this.getProjectCheckpointsDir(projectId);
    } catch {
      return [];
    }

    if (!fs.existsSync(projectDir)) {
      return [];
    }

    const summaries: CheckpointSummary[] = [];
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(projectDir);
    } catch {
      return [];
    }

    for (const id of entries) {
      if (!CheckpointService.isValidCheckpointId(id)) {
        continue;
      }
      try {
        const manifest = this.loadManifest(projectId, id);
        if (manifest) {
          summaries.push({
            id: manifest.id,
            projectId: manifest.projectId,
            timestamp: manifest.timestamp,
            type: manifest.type,
            status: manifest.status,
            description: manifest.description,
            filesCount: Object.keys(manifest.files).length,
            totalBackupBytes: manifest.totalBackupBytes,
          });
        }
      } catch {
        // Skip corrupt or invalid manifests
      }
    }

    return summaries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Creates a manual full snapshot of all text source files in the project.
   */
  public createManualCheckpoint(
    projectId: string,
    projectRoot: string,
    description?: string
  ): CheckpointSummary {
    if (!CheckpointService.isValidProjectId(projectId)) {
      throw new CheckpointError(`Invalid project identifier: "${projectId}"`);
    }
    if (description && (typeof description !== 'string' || description.length > 500)) {
      throw new CheckpointError('Manual checkpoint description exceeds maximum allowed length (500 chars)');
    }

    const canonicalRoot = path.resolve(projectRoot);
    if (!fs.existsSync(canonicalRoot)) {
      throw new CheckpointError(`Project root does not exist: ${projectRoot}`);
    }

    const checkpointId = `chk_manual_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const checkpointDir = this.getCheckpointDir(projectId, checkpointId);
    const filesDir = path.join(checkpointDir, 'files');
    fs.mkdirSync(filesDir, { recursive: true });

    const manifest: CheckpointManifest = {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      id: checkpointId,
      projectId,
      projectRoot: canonicalRoot,
      timestamp: new Date().toISOString(),
      type: 'manual',
      status: 'accepted',
      description: description || 'Manual Workspace Checkpoint',
      files: {},
      totalBackupBytes: 0,
    };

    let totalBytes = 0;

    const walk = (currentDir: string) => {
      const items = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(currentDir, item.name);
        const rel = path.relative(canonicalRoot, fullPath);
        const relPath = normalizeWorkspacePath(rel);

        if (item.isDirectory()) {
          if (isIgnoredDirectory(item.name)) continue;
          walk(fullPath);
        } else if (item.isFile()) {
          if (isSensitiveFile(fullPath) || isBinaryFile(fullPath)) continue;

          const stat = fs.statSync(fullPath);
          if (totalBytes + stat.size > this.maxTransactionBytes) {
            // Clean up partial snapshot
            try {
              fs.rmSync(checkpointDir, { recursive: true, force: true });
            } catch {}
            throw new CheckpointError(
              `Manual checkpoint would exceed safety cap (${this.maxTransactionBytes} bytes). Cancelled cleanly.`
            );
          }

          const buf = fs.readFileSync(fullPath);
          const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
          const backupFileName = `${sha256}.bak`;
          const backupPath = path.join(filesDir, backupFileName);

          if (!fs.existsSync(backupPath)) {
            fs.writeFileSync(backupPath, buf);
          }

          manifest.files[relPath] = {
            relativePath: relPath,
            existedBefore: true,
            originalSha256: sha256,
            originalSizeBytes: buf.length,
            backupFileName,
          };

          totalBytes += buf.length;
        }
      }
    };

    walk(canonicalRoot);
    manifest.totalBackupBytes = totalBytes;
    this.saveManifest(manifest);
    this.cleanupOldCheckpoints(projectId);

    return {
      id: manifest.id,
      projectId: manifest.projectId,
      timestamp: manifest.timestamp,
      type: manifest.type,
      status: manifest.status,
      description: manifest.description,
      filesCount: Object.keys(manifest.files).length,
      totalBackupBytes: totalBytes,
    };
  }

  /**
   * Creates or augments an active checkpoint with a complete safety snapshot of all writable
   * source/text files BEFORE a supervised process executes in AGENT mode.
   *
   * Hard cap: 100 MB. If cap exceeded, blocks execution safely without partial snapshots.
   */
  public async createPreProcessSafetySnapshot(
    projectId: string,
    projectRoot: string,
    checkpointId?: string
  ): Promise<CheckpointManifest> {
    if (!CheckpointService.isValidProjectId(projectId)) {
      throw new CheckpointError(`Invalid project identifier: "${projectId}"`);
    }

    const canonicalRoot = path.resolve(projectRoot);
    if (!fs.existsSync(canonicalRoot)) {
      throw new CheckpointError(`Project root does not exist: "${projectRoot}"`);
    }

    let manifest: CheckpointManifest | null = null;

    if (checkpointId) {
      manifest = this.loadManifest(projectId, checkpointId);
    }
    if (!manifest) {
      const summary = this.getPendingCheckpoint(projectId);
      if (summary) {
        manifest = this.loadManifest(projectId, summary.id);
      }
    }
    if (!manifest) {
      manifest = this.armAutomaticCheckpoint(projectId, canonicalRoot, 'Pre-Process Safety Checkpoint');
      this.ensurePending(manifest);
    }

    const checkpointDir = this.getCheckpointDir(projectId, manifest.id);
    const filesDir = path.join(checkpointDir, 'files');
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }

    const maxSafetyBytes = 100 * 1024 * 1024; // 100 MB hard cap
    let totalBytes = manifest.totalBackupBytes;

    const filesToBackup: Array<{ fullPath: string; relPath: string; stat: fs.Stats }> = [];

    const walk = (currentDir: string) => {
      const items = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(currentDir, item.name);
        const rel = path.relative(canonicalRoot, fullPath);
        const relPath = normalizeWorkspacePath(rel);

        if (item.isDirectory()) {
          if (isIgnoredDirectory(item.name)) continue;
          walk(fullPath);
        } else if (item.isFile()) {
          if (isSensitiveFile(fullPath) || isBinaryFile(fullPath)) continue;

          const stat = fs.statSync(fullPath);
          // If not already snapshotted, track prospective bytes
          if (!manifest!.files[relPath]) {
            totalBytes += stat.size;
            if (totalBytes > maxSafetyBytes) {
              throw new CheckpointError(
                `Unable to create a safe pre-process snapshot: project source files would exceed 100 MB safety cap (${totalBytes} bytes). Command execution was blocked.`
              );
            }
            filesToBackup.push({ fullPath, relPath, stat });
          }
        }
      }
    };

    walk(canonicalRoot);

    // Apply all backups
    for (const item of filesToBackup) {
      const buf = fs.readFileSync(item.fullPath);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const backupFileName = `${sha256}.bak`;
      const backupPath = path.join(filesDir, backupFileName);

      if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, buf);
      }

      manifest.files[item.relPath] = {
        relativePath: item.relPath,
        existedBefore: true,
        originalSha256: sha256,
        originalSizeBytes: buf.length,
        backupFileName,
      };
      manifest.totalBackupBytes += buf.length;
    }

    manifest.status = 'pending';
    this.saveManifest(manifest);
    return manifest;
  }

  /**
   * Scans project workspace AFTER a process completes to detect any source/text files
   * modified, created, or deleted by the process, merging them into the active checkpoint.
   */
  public async scanForProcessSourceChanges(
    projectId: string,
    projectRoot: string,
    checkpointId: string
  ): Promise<{ modifiedFiles: string[]; createdFiles: string[]; deletedFiles: string[] }> {
    const manifest = this.loadManifest(projectId, checkpointId);
    if (!manifest) {
      throw new CheckpointError(`Checkpoint not found: "${checkpointId}"`);
    }

    const canonicalRoot = path.resolve(projectRoot);
    const foundOnDisk = new Set<string>();
    const modifiedFiles: string[] = [];
    const createdFiles: string[] = [];
    const deletedFiles: string[] = [];

    const walk = (currentDir: string) => {
      const items = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(currentDir, item.name);
        const rel = path.relative(canonicalRoot, fullPath);
        const relPath = normalizeWorkspacePath(rel);

        if (item.isDirectory()) {
          if (isIgnoredDirectory(item.name)) continue;
          walk(fullPath);
        } else if (item.isFile()) {
          if (isSensitiveFile(fullPath) || isBinaryFile(fullPath)) continue;

          foundOnDisk.add(relPath);
          const buf = fs.readFileSync(fullPath);
          const currentSha256 = crypto.createHash('sha256').update(buf).digest('hex');

          if (manifest.files[relPath]) {
            const entry = manifest.files[relPath];
            const previousSha = entry.lastAgentSha256 || entry.originalSha256;
            if (previousSha !== currentSha256) {
              entry.lastAgentSha256 = currentSha256;
              modifiedFiles.push(relPath);
            }
          } else {
            // New file created by process
            manifest.files[relPath] = {
              relativePath: relPath,
              existedBefore: false,
              lastAgentSha256: currentSha256,
            };
            createdFiles.push(relPath);
          }
        }
      }
    };

    walk(canonicalRoot);

    // Check for files deleted by process
    for (const [relPath, entry] of Object.entries(manifest.files)) {
      if (entry.existedBefore && !foundOnDisk.has(relPath) && entry.lastAgentSha256 !== undefined) {
        entry.lastAgentSha256 = undefined;
        deletedFiles.push(relPath);
      }
    }

    if (modifiedFiles.length > 0 || createdFiles.length > 0 || deletedFiles.length > 0) {
      this.saveManifest(manifest);
    }

    return { modifiedFiles, createdFiles, deletedFiles };
  }

  /**
   * Retention cleanup: keeps 5 recent completed/manual checkpoints per project.
   * NEVER cleans a currently pending recovery checkpoint.
   */
  private cleanupOldCheckpoints(projectId: string): void {
    const list = this.listCheckpoints(projectId);
    const nonPending = list.filter((c) => c.status !== 'pending' && c.status !== 'conflict');

    if (nonPending.length > 5) {
      const toDelete = nonPending.slice(5);
      for (const item of toDelete) {
        try {
          const dir = this.getCheckpointDir(projectId, item.id);
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // Ignore deletion error during cleanup
        }
      }
    }
  }
}
