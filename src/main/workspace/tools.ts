import fs from 'node:fs';
import path from 'node:path';
import { WorkspaceGuard } from './guard';
import {
  DirectoryListResult,
  FileReadResult,
  ProjectProfile,
  TextSearchResult,
  WorkspaceEntry,
} from './types';
import { ProjectProfiler } from './project-profiler';
import {
  isBinaryFile,
  isIgnoredDirectory,
  MAX_LIST_ENTRIES,
  MAX_READ_BYTES,
  MAX_READ_LINES,
} from './file-policy';
import { normalizeWorkspacePath } from './path-policy';

export class WorkspaceTools {
  private guard: WorkspaceGuard;

  constructor(guard: WorkspaceGuard) {
    this.guard = guard;
  }

  /**
   * Tool 1: get_project_overview
   * Returns a comprehensive intelligence profile of the workspace.
   */
  public async getProjectOverview(): Promise<ProjectProfile> {
    return ProjectProfiler.profile(this.guard);
  }

  /**
   * Tool 2: list_directory
   * Lists entries within a workspace directory safely.
   */
  public async listDirectory(options?: {
    path?: string;
    recursive?: boolean;
    maxDepth?: number;
  }): Promise<DirectoryListResult> {
    const inputPath = options?.path || '';
    const recursive = Boolean(options?.recursive);
    const maxDepth = options?.maxDepth ?? 2;

    const check = this.guard.resolveReadPath(inputPath);
    if (!check.allowed) {
      throw new Error(check.error || `Access denied to directory: ${inputPath}`);
    }

    const targetDir = check.canonicalPath;
    if (!fs.existsSync(targetDir)) {
      throw new Error(`Directory does not exist: ${inputPath}`);
    }

    const stat = fs.statSync(targetDir);
    if (!stat.isDirectory()) {
      throw new Error(`Path is a file, not a directory: ${inputPath}`);
    }

    const entries: WorkspaceEntry[] = [];
    let truncated = false;

    const walk = (currentDir: string, currentDepth: number): void => {
      if (entries.length >= MAX_LIST_ENTRIES) {
        truncated = true;
        return;
      }

      const dirEntries = fs.readdirSync(currentDir, { withFileTypes: true });

      // Sort: directories first, then files
      dirEntries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const item of dirEntries) {
        if (entries.length >= MAX_LIST_ENTRIES) {
          truncated = true;
          return;
        }

        const fullPath = path.join(currentDir, item.name);
        const rel = path.relative(this.guard.canonicalRootPath, fullPath);
        const relativePath = normalizeWorkspacePath(rel);

        const isDir = item.isDirectory();
        const isIgnored = isIgnoredDirectory(item.name);

        if (isIgnored && currentDir === targetDir) {
          // If at root search level, show directory but do not recurse into ignored
          entries.push({
            name: item.name,
            path: fullPath,
            relativePath,
            type: 'directory',
            sizeBytes: 0,
            extension: '',
            isIgnored: true,
          });
          continue;
        } else if (isIgnored) {
          continue;
        }

        let sizeBytes = 0;
        try {
          if (!isDir) {
            sizeBytes = fs.statSync(fullPath).size;
          }
        } catch {
          // ignore stat errors
        }

        entries.push({
          name: item.name,
          path: fullPath,
          relativePath,
          type: isDir ? 'directory' : 'file',
          sizeBytes,
          extension: isDir ? '' : path.extname(item.name),
        });

        if (isDir && recursive && currentDepth < maxDepth) {
          walk(fullPath, currentDepth + 1);
        }
      }
    };

    walk(targetDir, 1);

    return {
      path: targetDir,
      relativePath: check.relativePath,
      entries,
      totalCount: entries.length,
      truncated,
    };
  }

  /**
   * Tool 3: read_file
   * Reads a text file safely with line-range, binary, and size safeguards.
   */
  public async readFile(options: {
    path: string;
    startLine?: number;
    endLine?: number;
  }): Promise<FileReadResult> {
    if (!options || typeof options.path !== 'string') {
      throw new Error('Missing file path');
    }

    const check = this.guard.resolveReadPath(options.path);
    if (!check.allowed) {
      throw new Error(check.error || `Access denied to file: ${options.path}`);
    }

    const filePath = check.canonicalPath;
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${options.path}`);
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      throw new Error(`Target path is a directory, not a file: ${options.path}. Use list_directory instead.`);
    }

    if (isBinaryFile(filePath)) {
      return {
        path: filePath,
        relativePath: check.relativePath,
        content: `[Binary file cannot be displayed: ${path.basename(filePath)} (${stat.size} bytes)]`,
        totalLines: 0,
        startLine: 1,
        endLine: 1,
        truncated: false,
        sizeBytes: stat.size,
        isBinary: true,
      };
    }

    let fileContent: string;
    let truncated = false;

    if (stat.size > MAX_READ_BYTES) {
      // Read first chunk only
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(MAX_READ_BYTES);
      const bytesRead = fs.readSync(fd, buffer, 0, MAX_READ_BYTES, 0);
      fs.closeSync(fd);
      fileContent = buffer.toString('utf8', 0, bytesRead);
      truncated = true;
    } else {
      fileContent = fs.readFileSync(filePath, 'utf8');
    }

    const allLines = fileContent.split(/\r?\n/);
    const totalLines = allLines.length;

    const startLine = Math.max(1, options.startLine ?? 1);
    const requestedEnd = options.endLine ?? Math.min(totalLines, startLine + MAX_READ_LINES - 1);
    const endLine = Math.min(totalLines, Math.max(startLine, requestedEnd));

    const selectedLines = allLines.slice(startLine - 1, endLine);
    const hasMoreLines = endLine < totalLines;

    const formattedLines = selectedLines.map((line, idx) => `${startLine + idx}: ${line}`).join('\n');

    let finalContent = formattedLines;
    if (hasMoreLines || truncated) {
      finalContent += `\n\n[Truncated: showing lines ${startLine}-${endLine} of ${totalLines} total lines]`;
      truncated = true;
    }

    return {
      path: filePath,
      relativePath: check.relativePath,
      content: finalContent,
      totalLines,
      startLine,
      endLine,
      truncated,
      sizeBytes: stat.size,
      isBinary: false,
    };
  }

  /**
   * Tool 4: search_text
   * Searches for text occurrences inside project text files.
   */
  public async searchText(options: {
    query: string;
    path?: string;
    caseSensitive?: boolean;
    maxMatches?: number;
  }): Promise<TextSearchResult> {
    if (!options || typeof options.query !== 'string' || !options.query.trim()) {
      throw new Error('Query must be a non-empty string');
    }

    const check = this.guard.resolveReadPath(options.path || '');
    if (!check.allowed) {
      throw new Error(check.error || `Access denied to search path`);
    }

    const startDir = check.canonicalPath;
    const query = options.query;
    const caseSensitive = Boolean(options.caseSensitive);
    const maxMatches = options.maxMatches ?? 30;

    const matches: Array<{ file: string; line: number; content: string }> = [];
    let scannedFiles = 0;
    let truncated = false;

    const targetQuery = caseSensitive ? query : query.toLowerCase();

    const walkAndSearch = (dir: string): void => {
      if (matches.length >= maxMatches) {
        truncated = true;
        return;
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (matches.length >= maxMatches) {
          truncated = true;
          return;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!isIgnoredDirectory(entry.name)) {
            walkAndSearch(fullPath);
          }
        } else if (entry.isFile()) {
          if (isBinaryFile(fullPath)) continue;

          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > MAX_READ_BYTES) continue; // Skip huge files for search

            scannedFiles++;
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split(/\r?\n/);

            const rel = normalizeWorkspacePath(path.relative(this.guard.canonicalRootPath, fullPath));

            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= maxMatches) {
                truncated = true;
                break;
              }

              const line = lines[i];
              const testLine = caseSensitive ? line : line.toLowerCase();

              if (testLine.includes(targetQuery)) {
                matches.push({
                  file: rel,
                  line: i + 1,
                  content: line.trim().slice(0, 200), // bounded snippet
                });
              }
            }
          } catch {
            // Ignore unreadable files
          }
        }
      }
    };

    walkAndSearch(startDir);

    return {
      query,
      matches,
      totalMatches: matches.length,
      scannedFiles,
      truncated,
    };
  }
}
