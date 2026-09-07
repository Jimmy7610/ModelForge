import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  CheckpointFileEntry,
  CheckpointManifest,
  CheckpointSummary,
  RollbackResult,
} from './types';
import { CheckpointError } from './errors';
import { isBinaryFile, isIgnoredDirectory, isSensitiveFile } from '../workspace/file-policy';
import { normalizeWorkspacePath } from '../workspace/path-policy';

export class CheckpointService {
  private readonly baseStorageDir: string;
  private readonly maxTransactionBytes: number;

  constructor(customBaseDir?: string, maxTransactionBytes = 50 * 1024 * 1024) {
    if (customBaseDir) {
      this.baseStorageDir = customBaseDir;
    } else if (process.env.MODELFORGE_CHECKPOINTS_DIR) {
      this.baseStorageDir = process.env.MODELFORGE_CHECKPOINTS_DIR;
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
        ? path.join(userDataDir, 'checkpoints')
        : path.join(os.homedir(), '.model-forge', 'checkpoints');
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

  public getBaseStorageDir(): string {
    return this.baseStorageDir;
  }

  public getProjectCheckpointsDir(projectId: string): string {
    return path.join(this.baseStorageDir, projectId);
  }

  public getCheckpointDir(projectId: string, checkpointId: string): string {
    return path.join(this.baseStorageDir, projectId, checkpointId);
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
    const checkpointId = `chk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const manifest: CheckpointManifest = {
      id: checkpointId,
      projectId,
      projectRoot,
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
    _guard?: any
  ): Promise<RollbackResult> {
    const overrideRoot = _guard?.canonicalRootPath;
    return this.rollback(checkpointId, projectId, overrideRoot);
  }

  public async acceptCheckpoint(checkpointId: string, projectId: string): Promise<void> {
    const manifest = this.loadManifest(projectId, checkpointId);
    if (!manifest) {
      throw new CheckpointError(`Checkpoint not found: ${checkpointId}`);
    }
    manifest.status = 'accepted';
    this.saveManifest(manifest);
    this.cleanupOldCheckpoints(projectId);
  }

  public async scanForInterruptedCheckpoints(projectId: string): Promise<CheckpointSummary[]> {
    const list = this.listCheckpoints(projectId);
    return list.filter((c) => c.status === 'pending' || c.status === 'interrupted');
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
   * Saves the manifest to disk.
   */
  public saveManifest(manifest: CheckpointManifest): void {
    const manifestPath = this.getManifestPath(manifest.projectId, manifest.id);
    const dir = path.dirname(manifestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  /**
   * Loads a manifest from disk.
   */
  public loadManifest(projectId: string, checkpointId: string): CheckpointManifest | null {
    const manifestPath = this.getManifestPath(projectId, checkpointId);
    if (!fs.existsSync(manifestPath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      return JSON.parse(content) as CheckpointManifest;
    } catch {
      return null;
    }
  }

  /**
   * Marks a pending checkpoint as accepted.
   */
  public accept(checkpointId: string, projectId: string): { success: boolean } {
    const manifest = this.loadManifest(projectId, checkpointId);
    if (!manifest) {
      throw new CheckpointError(`Checkpoint not found: ${checkpointId}`);
    }

    manifest.status = 'accepted';
    this.saveManifest(manifest);
    this.cleanupOldCheckpoints(projectId);

    return { success: true };
  }

  /**
   * Restores files to their exact pre-edit baseline.
   * Enforces conflict protection: if a file was modified externally after the agent edited it,
   * rollback is rejected with ROLLBACK CONFLICT.
   */
  public rollback(checkpointId: string, projectId: string, overrideRoot?: string): RollbackResult {
    const manifest = this.loadManifest(projectId, checkpointId);
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

    const checkpointDir = this.getCheckpointDir(projectId, checkpointId);
    const projectRoot = overrideRoot || manifest.projectRoot;
    const conflicts: Array<{ relativePath: string; reason: string }> = [];

    // Step 1: Pre-flight conflict check across all touched files
    for (const [relPath, entry] of Object.entries(manifest.files)) {
      const currentDiskPath = path.join(projectRoot, relPath);
      const currentExists = fs.existsSync(currentDiskPath);

      if (entry.lastAgentSha256 && currentExists) {
        try {
          const currentBuf = fs.readFileSync(currentDiskPath);
          const currentHash = crypto.createHash('sha256').update(currentBuf).digest('hex');
          if (currentHash !== entry.lastAgentSha256) {
            conflicts.push({
              relativePath: relPath,
              reason: 'File changed outside Model Forge after agent edit.',
            });
          }
        } catch (err) {
          conflicts.push({
            relativePath: relPath,
            reason: `Unable to inspect current file for conflict check: ${err}`,
          });
        }
      }
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

    // Step 2: Perform atomic rollback operations
    const restoredFiles: string[] = [];
    const deletedCreatedFiles: string[] = [];
    const cleanedDirs: string[] = [];

    for (const [relPath, entry] of Object.entries(manifest.files)) {
      const currentDiskPath = path.join(projectRoot, relPath);

      if (!entry.existedBefore) {
        // File did not exist before agent created it: delete it
        if (fs.existsSync(currentDiskPath)) {
          fs.unlinkSync(currentDiskPath);
          deletedCreatedFiles.push(relPath);
        }

        // Clean up empty created parent directories bottom-up
        if (entry.createdParentDirs && entry.createdParentDirs.length > 0) {
          for (const dirRel of entry.createdParentDirs) {
            const dirFull = path.join(projectRoot, dirRel);
            try {
              if (fs.existsSync(dirFull) && fs.readdirSync(dirFull).length === 0) {
                fs.rmdirSync(dirFull);
                cleanedDirs.push(dirRel);
              }
            } catch {
              // Ignore directory removal failure if not empty
            }
          }
        }
      } else {
        // File existed before: restore exact original bytes
        const backupPath = entry.backupFileName
          ? path.join(checkpointDir, 'files', entry.backupFileName)
          : null;

        if (backupPath && fs.existsSync(backupPath)) {
          const originalBytes = fs.readFileSync(backupPath);
          const parentDir = path.dirname(currentDiskPath);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          fs.writeFileSync(currentDiskPath, originalBytes);
          restoredFiles.push(relPath);
        }
      }
    }

    manifest.status = 'rolled_back';
    this.saveManifest(manifest);
    this.cleanupOldCheckpoints(projectId);

    return {
      success: true,
      checkpointId,
      restoredFiles,
      deletedCreatedFiles,
      cleanedDirs,
      conflicts: [],
    };
  }

  /**
   * Scans for any checkpoint with status 'pending' or 'interrupted' for crash recovery.
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
    const projectDir = this.getProjectCheckpointsDir(projectId);
    if (!fs.existsSync(projectDir)) {
      return [];
    }

    const summaries: CheckpointSummary[] = [];
    const entries = fs.readdirSync(projectDir);

    for (const id of entries) {
      const manifestPath = path.join(projectDir, id, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const content = fs.readFileSync(manifestPath, 'utf8');
          const manifest = JSON.parse(content) as CheckpointManifest;
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
        } catch {
          // Skip corrupt manifests
        }
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
    if (!fs.existsSync(projectRoot)) {
      throw new CheckpointError(`Project root does not exist: ${projectRoot}`);
    }

    const checkpointId = `chk_manual_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const checkpointDir = this.getCheckpointDir(projectId, checkpointId);
    const filesDir = path.join(checkpointDir, 'files');
    fs.mkdirSync(filesDir, { recursive: true });

    const manifest: CheckpointManifest = {
      id: checkpointId,
      projectId,
      projectRoot,
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
        const rel = path.relative(projectRoot, fullPath);
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

    walk(projectRoot);
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
   * Retention cleanup: keeps 5 recent completed/manual checkpoints per project.
   * NEVER cleans a currently pending recovery checkpoint.
   */
  private cleanupOldCheckpoints(projectId: string): void {
    const list = this.listCheckpoints(projectId);
    const nonPending = list.filter((c) => c.status !== 'pending' && c.status !== 'conflict');

    if (nonPending.length > 5) {
      const toDelete = nonPending.slice(5);
      for (const item of toDelete) {
        const dir = this.getCheckpointDir(projectId, item.id);
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // Ignore deletion error during cleanup
        }
      }
    }
  }
}
