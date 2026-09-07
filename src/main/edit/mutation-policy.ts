import path from 'node:path';
import fs from 'node:fs';
import { MutationBlockedError } from './errors';
import { DEFAULT_MUTATION_LIMITS, MutationLimits } from './types';
import { normalizeWorkspacePath } from '../workspace/path-policy';

export const FORBIDDEN_MUTATION_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  'vendor',
  'target',
  'bin',
  'obj',
  '.godot',
  '__pycache__',
  '.venv',
  'venv',
  '.turbo',
  '.cache',
  '.idea',
  '.vscode',
]);

export const FORBIDDEN_EXTENSIONS = new Set([
  // Binaries and executables
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.com',
  '.msi',
  '.cmd',
  '.bat',
  '.ps1', // Disallow modifying host execution scripts
  '.sh',
  '.bash',
  // Model weights
  '.gguf',
  '.bin',
  '.safetensors',
  '.pt',
  '.onnx',
  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.7z',
  '.rar',
  '.bz2',
  '.xz',
  // Media
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.webm',
  // Databases and documents
  '.db',
  '.sqlite',
  '.sqlite3',
  '.pdf',
  '.doc',
  '.docx',
  // Bytecode / native objects
  '.wasm',
  '.pyc',
  '.pyo',
  '.class',
  '.o',
  '.obj',
  '.a',
  '.lib',
]);

const SENSITIVE_BASENAME_PATTERNS = [
  /^\.env(\..+)?$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /^id_ecdsa/i,
  /^credentials(\.json)?$/i,
  /^secret(s)?(\.json|\.ya?ml)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /\.keystore$/i,
  /^\.npmrc$/i,
  /^\.bashrc$/i,
  /^\.zshrc$/i,
  /authorized_keys/i,
  /known_hosts/i,
];

export class MutationPolicy {
  private readonly limits: MutationLimits;

  constructor(limits?: Partial<MutationLimits>) {
    this.limits = {
      ...DEFAULT_MUTATION_LIMITS,
      ...limits,
    };
  }

  public getLimits(): MutationLimits {
    return { ...this.limits };
  }

  /**
   * Unified validator for a proposed mutation.
   */
  public validateMutation(options: {
    operation: 'create' | 'modify' | 'delete' | 'write';
    relativePath: string;
    absolutePath?: string;
    workspaceRoot?: string;
    content?: string;
    currentSessionStats?: { totalWrittenBytes: number; modifiedFilesCount: number };
  }): void {
    this.assertMutablePath(options.relativePath);

    if (options.content !== undefined) {
      const bytes = this.assertWriteContentSafe(options.content, options.relativePath);
      if (options.currentSessionStats) {
        if (options.currentSessionStats.totalWrittenBytes + bytes > this.limits.maxCumulativeWriteBytes) {
          throw new MutationBlockedError(
            `Session write cap (${this.limits.maxCumulativeWriteBytes} bytes) exceeded.`,
            options.relativePath
          );
        }
      }
    }

    if (options.currentSessionStats) {
      if (options.currentSessionStats.modifiedFilesCount > this.limits.maxTouchedFiles) {
        throw new MutationBlockedError(
          `Session modified file limit (${this.limits.maxTouchedFiles}) exceeded.`,
          options.relativePath
        );
      }
    }
  }

  /**
   * Asserts that a relative path within the workspace is legally mutable.
   * Throws MutationBlockedError if target is in a protected directory, sensitive,
   * binary, or forbidden.
   */
  public assertMutablePath(relativePath: string): void {
    if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
      throw new MutationBlockedError('Path traversal or outside workspace path is prohibited.', relativePath);
    }

    const normalized = normalizeWorkspacePath(relativePath);
    if (!normalized || normalized === '.') {
      throw new MutationBlockedError('Cannot mutate workspace root directory itself.', relativePath);
    }

    const segments = normalized.split('/');
    const basename = segments[segments.length - 1];

    // Check directory segments
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i].toLowerCase();
      if (FORBIDDEN_MUTATION_DIRS.has(seg)) {
        throw new MutationBlockedError(
          `Mutation forbidden inside protected project directory: "${seg}/"`,
          relativePath
        );
      }
    }

    // Check if filename is a protected directory itself
    if (FORBIDDEN_MUTATION_DIRS.has(basename.toLowerCase())) {
      throw new MutationBlockedError(
        `Mutation forbidden for protected project directory name: "${basename}"`,
        relativePath
      );
    }

    // Check sensitive file patterns
    for (const pattern of SENSITIVE_BASENAME_PATTERNS) {
      if (pattern.test(basename)) {
        throw new MutationBlockedError(
          `Mutation forbidden for sensitive credential/secret file: "${basename}"`,
          relativePath
        );
      }
    }

    // Check forbidden extension
    const ext = path.extname(basename).toLowerCase();
    if (FORBIDDEN_EXTENSIONS.has(ext)) {
      throw new MutationBlockedError(
        `Mutation forbidden for binary or non-source extension: "${ext}"`,
        relativePath
      );
    }
  }

  /**
   * Asserts that the write content meets size limits and text constraints.
   */
  public assertWriteContentSafe(content: string, relativePath: string): number {
    if (typeof content !== 'string') {
      throw new MutationBlockedError('Write content must be a string.', relativePath);
    }

    const byteLength = Buffer.byteLength(content, 'utf8');

    if (byteLength > this.limits.maxSingleWriteBytes) {
      throw new MutationBlockedError(
        `Write content size (${byteLength} bytes) exceeds single-file limit of ${this.limits.maxSingleWriteBytes} bytes.`,
        relativePath
      );
    }

    // Check for binary content (null bytes)
    if (content.includes('\0')) {
      throw new MutationBlockedError(
        'Write content contains null bytes and appears to be binary data.',
        relativePath
      );
    }

    return byteLength;
  }

  /**
   * Asserts that an existing file on disk is not a binary file before editing.
   */
  public assertExistingFileIsText(canonicalPath: string, relativePath: string): void {
    if (!fs.existsSync(canonicalPath)) {
      return;
    }

    const stat = fs.statSync(canonicalPath);
    if (stat.isDirectory()) {
      throw new MutationBlockedError(
        `Target is a directory, not a file: "${relativePath}". Directory deletion is not permitted.`,
        relativePath
      );
    }

    // Sample first 4KB for null bytes
    const sampleSize = Math.min(4096, stat.size);
    if (sampleSize > 0) {
      const fd = fs.openSync(canonicalPath, 'r');
      const buffer = Buffer.alloc(sampleSize);
      const bytesRead = fs.readSync(fd, buffer, 0, sampleSize, 0);
      fs.closeSync(fd);

      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          throw new MutationBlockedError(
            `Target file "${relativePath}" is detected as binary and cannot be mutated.`,
            relativePath
          );
        }
      }
    }
  }
}
