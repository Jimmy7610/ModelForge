import fs from 'node:fs';
import path from 'node:path';

export interface DiscoveredFileInfo {
  path: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  mtimeMs: number;
  rootDirectory: string;
}

export function normalizePath(p: string): string {
  const resolved = path.resolve(p);
  // On Windows, drive letters and paths are case-insensitive
  if (process.platform === 'win32') {
    return resolved.toLowerCase().replace(/\\/g, '/');
  }
  return resolved.replace(/\\/g, '/');
}

export async function scanDirectoriesForGguf(
  rootDirectories: string[],
  onProgress?: (count: number, currentFile: string) => void
): Promise<DiscoveredFileInfo[]> {
  const discoveredMap = new Map<string, DiscoveredFileInfo>();
  const visitedRealpaths = new Set<string>();

  for (const rawRoot of rootDirectories) {
    if (!rawRoot || typeof rawRoot !== 'string') continue;
    const root = path.resolve(rawRoot);

    if (!fs.existsSync(root)) continue;

    let rootStat: fs.Stats;
    try {
      rootStat = fs.statSync(root);
      if (!rootStat.isDirectory()) continue;
    } catch {
      continue;
    }

    let rootRealpath: string;
    try {
      rootRealpath = fs.realpathSync(root);
    } catch {
      rootRealpath = root;
    }

    const queue: string[] = [rootRealpath];

    while (queue.length > 0) {
      const currentDir = queue.shift()!;
      let realDir: string;

      try {
        realDir = fs.realpathSync(currentDir);
      } catch {
        continue;
      }

      const normalizedRealDir = normalizePath(realDir);
      if (visitedRealpaths.has(normalizedRealDir)) {
        continue; // Prevent cycles
      }
      visitedRealpaths.add(normalizedRealDir);

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isSymbolicLink()) {
          // Do not follow symlinks if they point to directories to prevent infinite loops or escaping root
          try {
            const symStat = fs.statSync(fullPath);
            if (symStat.isDirectory()) {
              continue; // Skip directory symlinks
            }
          } catch {
            continue;
          }
        }

        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.gguf') {
          try {
            const stat = fs.statSync(fullPath);
            if (!stat.isFile()) continue;

            const normalizedKey = normalizePath(fullPath);
            if (!discoveredMap.has(normalizedKey)) {
              const fileInfo: DiscoveredFileInfo = {
                path: fullPath,
                fileName: entry.name,
                sizeBytes: stat.size,
                modifiedAt: stat.mtime.toISOString(),
                mtimeMs: stat.mtimeMs,
                rootDirectory: root,
              };
              discoveredMap.set(normalizedKey, fileInfo);

              if (onProgress) {
                onProgress(discoveredMap.size, entry.name);
              }
            }
          } catch {
            // Ignore unreadable file
          }
        }
      }
    }
  }

  return Array.from(discoveredMap.values());
}
