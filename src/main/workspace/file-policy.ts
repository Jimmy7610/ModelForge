import path from 'node:path';
import fs from 'node:fs';

export const MAX_READ_BYTES = 512 * 1024; // 512 KB max per file read
export const MAX_READ_LINES = 2000;
export const MAX_LIST_ENTRIES = 100;

export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '.turbo',
  'tmp',
  'temp',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
]);

const BINARY_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.gguf',
  '.iso',
  '.img',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.mp3',
  '.mp4',
  '.wav',
  '.mov',
  '.avi',
  '.pdf',
  '.wasm',
  '.pyc',
  '.class',
  '.db',
  '.sqlite',
]);

const SENSITIVE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /credentials\.json$/i,
  /secret/i,
  /^\.npmrc$/i,
  /^\.bashrc$/i,
  /^\.zshrc$/i,
  /authorized_keys/i,
  /known_hosts/i,
];

/**
 * Checks whether a directory name is typically ignored (build artifacts, dependencies).
 */
export function isIgnoredDirectory(dirName: string): boolean {
  const base = path.basename(dirName).toLowerCase();
  return IGNORED_DIRECTORIES.has(base);
}

/**
 * Checks if a file is considered sensitive (passwords, tokens, keys).
 */
export function isSensitiveFile(filePath: string): boolean {
  const base = path.basename(filePath);
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(base)) {
      return true;
    }
  }
  return false;
}

/**
 * Determines whether a file is binary based on extension and optional buffer sample.
 */
export function isBinaryFile(filePath: string, sampleBuffer?: Buffer): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return true;
  }

  // If sample buffer is provided or file is small enough to sample
  if (sampleBuffer && sampleBuffer.length > 0) {
    // Look for null bytes in the first 8000 bytes
    const checkLength = Math.min(sampleBuffer.length, 8000);
    for (let i = 0; i < checkLength; i++) {
      if (sampleBuffer[i] === 0) {
        return true;
      }
    }
  } else if (fs.existsSync(filePath)) {
    try {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(1024);
      const bytesRead = fs.readSync(fd, buf, 0, 1024, 0);
      fs.closeSync(fd);
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 0) {
          return true;
        }
      }
    } catch {
      // If cannot read sample, rely on extension
    }
  }

  return false;
}
