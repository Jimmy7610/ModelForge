export class WorkspaceSecurityError extends Error {
  public readonly code: string;
  public readonly targetPath?: string;

  constructor(message: string, code = 'WORKSPACE_SECURITY_VIOLATION', targetPath?: string) {
    super(`[WorkspaceSecurity] ${message}`);
    this.name = 'WorkspaceSecurityError';
    this.code = code;
    this.targetPath = targetPath;
  }
}

export interface WorkspacePathInspection {
  exists: boolean;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  sizeBytes: number;
  modifiedAt: string | null;
  extension: string;
  isBinary: boolean;
  isSensitive: boolean;
  isIgnored: boolean;
  relativePath: string;
  canonicalPath: string;
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  relativePath: string;
  type: 'file' | 'directory';
  sizeBytes: number;
  extension: string;
  isIgnored?: boolean;
}

export interface ProjectProfile {
  name: string;
  rootPath: string;
  canonicalRootPath: string;
  isGitRepository: boolean;
  packageManager: string | null;
  languages: string[];
  frameworkHints: string[];
  keyFiles: string[];
  topLevelDirectories: string[];
  scripts?: Record<string, string>;
  dependencies?: string[];
  devDependencies?: string[];
}

export interface FileReadResult {
  path: string;
  relativePath: string;
  content: string;
  rawContent: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  truncated: boolean;
  sizeBytes: number;
  isBinary?: boolean;
}

export interface DirectoryListResult {
  path: string;
  relativePath: string;
  entries: WorkspaceEntry[];
  totalCount: number;
  truncated: boolean;
}

export interface TextSearchResult {
  query: string;
  matches: Array<{
    file: string;
    line: number;
    content: string;
  }>;
  totalMatches: number;
  scannedFiles: number;
  truncated: boolean;
}
