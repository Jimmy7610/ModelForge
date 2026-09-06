import path from 'node:path';
import fs from 'node:fs';
import { WorkspaceSecurityError } from './types';

/**
 * Normalizes a path to use forward slashes and removes trailing slashes
 */
export function normalizeWorkspacePath(inputPath: string): string {
  if (!inputPath) return '.';
  let normalized = inputPath.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Asserts that the input path does not contain illegal traversal tricks,
 * null bytes, URL encoded attempts, or Windows alternate data streams.
 */
export function assertPathTraversalSafe(inputPath: string): void {
  if (typeof inputPath !== 'string') {
    throw new WorkspaceSecurityError('Invalid path: must be a string', 'INVALID_PATH_TYPE');
  }

  // Null byte injection check
  if (inputPath.includes('\0')) {
    throw new WorkspaceSecurityError('Null byte detected in path', 'PATH_TRAVERSAL_NULL_BYTE', inputPath);
  }

  // URL-encoded traversal check (e.g., %2e%2e, %2f, %5c)
  if (/%2e|%2f|%5c/i.test(inputPath)) {
    throw new WorkspaceSecurityError('URL-encoded path traversal attempt detected', 'PATH_TRAVERSAL_ENCODED', inputPath);
  }

  // Windows Alternate Data Stream check (e.g., file.txt:hidden)
  // Exclude standard Windows drive letter (e.g., C:\)
  const strippedDrive = inputPath.replace(/^[a-zA-Z]:[/\\]/, '');
  if (strippedDrive.includes(':')) {
    throw new WorkspaceSecurityError('Windows Alternate Data Stream notation detected', 'PATH_ADS_NOT_ALLOWED', inputPath);
  }

  // Windows DOS device names check (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const baseName = path.basename(inputPath).split('.')[0].toUpperCase();
  const reservedDevices = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  if (reservedDevices.includes(baseName)) {
    throw new WorkspaceSecurityError(`Reserved system device name "${baseName}" is not allowed`, 'PATH_RESERVED_DEVICE', inputPath);
  }
}

/**
 * Checks whether a canonical path targets sensitive system directories.
 */
export function isSystemForbiddenPath(canonicalPath: string): boolean {
  const norm = normalizeWorkspacePath(canonicalPath).toLowerCase();

  // Root of system drive (e.g. "c:" or "c:/")
  if (/^[a-z]:\/?$/i.test(norm) || norm === '/') {
    return true;
  }

  // Windows system folders
  const forbiddenSubstrings = [
    '/windows',
    '/windows/system32',
    '/program files',
    '/program files (x86)',
    '/programdata',
    '/.ssh',
    '/.aws',
    '/.azure',
    '/.gnupg',
  ];

  for (const forbidden of forbiddenSubstrings) {
    if (norm === forbidden || norm.endsWith(forbidden) || norm.includes(forbidden + '/')) {
      return true;
    }
  }

  return false;
}

/**
 * Verifies if targetCanonical is strictly contained inside or equal to rootCanonical.
 * Respects OS case-insensitivity on Windows.
 */
export function isPathContainedInRoot(targetCanonical: string, rootCanonical: string): boolean {
  const isWindows = process.platform === 'win32';
  
  const normRoot = normalizeWorkspacePath(rootCanonical);
  const normTarget = normalizeWorkspacePath(targetCanonical);

  const compareRoot = isWindows ? normRoot.toLowerCase() : normRoot;
  const compareTarget = isWindows ? normTarget.toLowerCase() : normTarget;

  if (compareTarget === compareRoot) {
    return true;
  }

  const rootPrefix = compareRoot.endsWith('/') ? compareRoot : compareRoot + '/';
  if (!compareTarget.startsWith(rootPrefix)) {
    return false;
  }

  // Double-check via path.relative
  const rel = path.relative(normRoot, normTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return false;
  }

  return true;
}

/**
 * Resolves the real canonical path for a target on disk, resolving symlinks.
 * If the path does not exist, resolves the nearest existing parent directory's
 * realpath to ensure symlink escape does not occur even for non-existent targets.
 */
export function resolveCanonicalPath(targetPath: string): string {
  try {
    if (fs.existsSync(targetPath)) {
      if (fs.realpathSync.native) {
        return fs.realpathSync.native(targetPath);
      }
      return fs.realpathSync(targetPath);
    }
  } catch {
    // If realpath fails, fallback to ancestor resolution below
  }

  // For non-existent paths, traverse up to find existing parent
  const resolved = path.resolve(targetPath);
  let current = resolved;
  const missingParts: string[] = [];

  while (!fs.existsSync(current) && current !== path.dirname(current)) {
    missingParts.unshift(path.basename(current));
    current = path.dirname(current);
  }

  if (fs.existsSync(current)) {
    const parentCanonical = fs.realpathSync.native ? fs.realpathSync.native(current) : fs.realpathSync(current);
    return path.join(parentCanonical, ...missingParts);
  }

  return resolved;
}
