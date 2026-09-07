import fs from 'node:fs';
import path from 'node:path';
import {
  assertPathTraversalSafe,
  isPathContainedInRoot,
  isSystemForbiddenPath,
  normalizeWorkspacePath,
  resolveCanonicalPath,
} from './path-policy';
import { isBinaryFile, isIgnoredDirectory, isSensitiveFile } from './file-policy';
import { WorkspacePathInspection, WorkspaceSecurityError } from './types';

/**
 * Hard Workspace Jail for local projects.
 * Guarantees that all inspection and tool operations remain strictly confined
 * to the designated project root directory.
 */
export class WorkspaceGuard {
  public readonly rootPath: string;
  public readonly canonicalRootPath: string;

  constructor(rootPath: string) {
    if (!rootPath || typeof rootPath !== 'string' || !rootPath.trim()) {
      throw new WorkspaceSecurityError('Project rootPath must be a non-empty string', 'INVALID_ROOT_PATH');
    }

    assertPathTraversalSafe(rootPath);

    const resolved = path.resolve(rootPath.trim());
    if (!fs.existsSync(resolved)) {
      throw new WorkspaceSecurityError(`Project root path does not exist: ${resolved}`, 'ROOT_NOT_FOUND', resolved);
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new WorkspaceSecurityError(`Project root path is not a directory: ${resolved}`, 'ROOT_NOT_DIRECTORY', resolved);
    }

    this.rootPath = resolved;
    this.canonicalRootPath = resolveCanonicalPath(resolved);

    if (isSystemForbiddenPath(this.canonicalRootPath)) {
      throw new WorkspaceSecurityError(
        `System directory or drive root cannot be used as a project root: ${this.canonicalRootPath}`,
        'SYSTEM_PATH_FORBIDDEN',
        this.canonicalRootPath
      );
    }
  }

  /**
   * Resolves an input path (relative or absolute) and determines whether reading is allowed.
   */
  public resolveReadPath(inputPath: string): {
    allowed: boolean;
    canonicalPath: string;
    relativePath: string;
    error?: string;
  } {
    try {
      if (typeof inputPath !== 'string') {
        return {
          allowed: false,
          canonicalPath: '',
          relativePath: '',
          error: 'Path must be a string',
        };
      }

      const trimmed = inputPath.trim();
      const normalizedInput = trimmed === '' || trimmed === '.' ? '.' : trimmed;

      assertPathTraversalSafe(normalizedInput);

      const targetAbsolute = path.isAbsolute(normalizedInput)
        ? path.resolve(normalizedInput)
        : path.resolve(this.canonicalRootPath, normalizedInput);

      const targetCanonical = resolveCanonicalPath(targetAbsolute);

      if (!isPathContainedInRoot(targetCanonical, this.canonicalRootPath)) {
        return {
          allowed: false,
          canonicalPath: targetCanonical,
          relativePath: '',
          error: `Path escapes workspace jail root: "${inputPath}" -> "${targetCanonical}"`,
        };
      }

      const isDir = fs.existsSync(targetCanonical) && fs.statSync(targetCanonical).isDirectory();
      if (!isDir && isSensitiveFile(targetCanonical)) {
        return {
          allowed: false,
          canonicalPath: targetCanonical,
          relativePath: path.relative(this.canonicalRootPath, targetCanonical),
          error: `Access to sensitive credential or secret file is prohibited: ${path.basename(targetCanonical)}`,
        };
      }

      const rel = path.relative(this.canonicalRootPath, targetCanonical);
      const relativePath = normalizeWorkspacePath(rel);

      return {
        allowed: true,
        canonicalPath: targetCanonical,
        relativePath: relativePath === '.' ? '' : relativePath,
      };
    } catch (err) {
      return {
        allowed: false,
        canonicalPath: '',
        relativePath: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Asserts that a path is strictly contained within the project jail.
   * Throws WorkspaceSecurityError if the path violates containment.
   */
  public assertContained(targetPath: string): string {
    const check = this.resolveReadPath(targetPath);
    if (!check.allowed) {
      throw new WorkspaceSecurityError(
        check.error || `Path is outside the active workspace: ${targetPath}`,
        'WORKSPACE_CONTAINMENT_VIOLATION',
        targetPath
      );
    }
    return check.canonicalPath;
  }

  /**
   * Inspects a path within the workspace without exposing file contents.
   */
  public inspectPath(inputPath: string): WorkspacePathInspection {
    const check = this.resolveReadPath(inputPath);
    if (!check.allowed && check.error && !check.error.includes('sensitive')) {
      throw new WorkspaceSecurityError(check.error, 'WORKSPACE_CONTAINMENT_VIOLATION', inputPath);
    }

    const canonical = check.canonicalPath;
    const exists = fs.existsSync(canonical);

    if (!exists) {
      return {
        exists: false,
        isDirectory: false,
        isFile: false,
        isSymlink: false,
        sizeBytes: 0,
        modifiedAt: null,
        extension: path.extname(canonical),
        isBinary: false,
        isSensitive: isSensitiveFile(canonical),
        isIgnored: isIgnoredDirectory(canonical),
        relativePath: check.relativePath,
        canonicalPath: canonical,
      };
    }

    const stat = fs.statSync(canonical);
    const lstat = fs.lstatSync(canonical);

    return {
      exists: true,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      isSymlink: lstat.isSymbolicLink(),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      extension: path.extname(canonical),
      isBinary: stat.isFile() ? isBinaryFile(canonical) : false,
      isSensitive: isSensitiveFile(canonical),
      isIgnored: isIgnoredDirectory(canonical),
      relativePath: check.relativePath,
      canonicalPath: canonical,
    };
  }

  /**
   * Resolves an input path for mutation (create, modify, delete) and determines whether writing is allowed.
   */
  public resolveWritePath(inputPath: string): {
    allowed: boolean;
    canonicalPath: string;
    relativePath: string;
    error?: string;
  } {
    try {
      if (typeof inputPath !== 'string') {
        return {
          allowed: false,
          canonicalPath: '',
          relativePath: '',
          error: 'Path must be a string',
        };
      }

      const trimmed = inputPath.trim();
      if (!trimmed || trimmed === '.') {
        return {
          allowed: false,
          canonicalPath: '',
          relativePath: '',
          error: 'Cannot modify project root directory',
        };
      }

      assertPathTraversalSafe(trimmed);

      const targetAbsolute = path.isAbsolute(trimmed)
        ? path.resolve(trimmed)
        : path.resolve(this.canonicalRootPath, trimmed);

      // Verify no existing directory component along the path is a symlink escaping workspace
      let checkPart = targetAbsolute;
      while (checkPart && checkPart !== path.dirname(checkPart)) {
        if (fs.existsSync(checkPart)) {
          const lstat = fs.lstatSync(checkPart);
          if (lstat.isSymbolicLink()) {
            const linkTarget = fs.realpathSync(checkPart);
            if (!isPathContainedInRoot(linkTarget, this.canonicalRootPath)) {
              return {
                allowed: false,
                canonicalPath: targetAbsolute,
                relativePath: '',
                error: `Path contains symlink/junction escaping workspace jail: "${checkPart}" -> "${linkTarget}"`,
              };
            }
          }
        }
        checkPart = path.dirname(checkPart);
      }

      const targetCanonical = resolveCanonicalPath(targetAbsolute);

      if (!isPathContainedInRoot(targetCanonical, this.canonicalRootPath)) {
        return {
          allowed: false,
          canonicalPath: targetCanonical,
          relativePath: '',
          error: `Write path escapes workspace jail root: "${inputPath}" -> "${targetCanonical}"`,
        };
      }

      if (normalizeWorkspacePath(targetCanonical).toLowerCase() === normalizeWorkspacePath(this.canonicalRootPath).toLowerCase()) {
        return {
          allowed: false,
          canonicalPath: targetCanonical,
          relativePath: '',
          error: 'Cannot modify project root directory itself',
        };
      }

      if (isSensitiveFile(targetCanonical)) {
        return {
          allowed: false,
          canonicalPath: targetCanonical,
          relativePath: path.relative(this.canonicalRootPath, targetCanonical),
          error: `Modification of sensitive credential or secret file is prohibited: ${path.basename(targetCanonical)}`,
        };
      }

      const rel = path.relative(this.canonicalRootPath, targetCanonical);
      const relativePath = normalizeWorkspacePath(rel);

      const segments = relativePath.split('/');
      if (segments.some((s) => s.toLowerCase() === '.git' || s.toLowerCase() === 'node_modules')) {
        return {
          allowed: false,
          canonicalPath: targetCanonical,
          relativePath,
          error: `Modification inside protected directory is prohibited: ${relativePath}`,
        };
      }

      return {
        allowed: true,
        canonicalPath: targetCanonical,
        relativePath: relativePath === '.' ? '' : relativePath,
      };
    } catch (err) {
      return {
        allowed: false,
        canonicalPath: '',
        relativePath: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Universal permission check for workspace operations.
   */
  public isAllowed(inputPath: string, operation: 'read' | 'write'): boolean {
    if (operation === 'read') {
      const check = this.resolveReadPath(inputPath);
      return check.allowed;
    }
    if (operation === 'write') {
      const check = this.resolveWritePath(inputPath);
      return check.allowed;
    }
    return false;
  }
}
