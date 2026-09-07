import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  CheckpointDiffResult,
  CheckpointManifest,
  FileDiffItem,
} from './types';

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export class DiffService {
  /**
   * Compares the baseline files in a checkpoint manifest against the current files
   * on disk in the project root, returning a detailed CheckpointDiffResult.
   */
  public static computeCheckpointDiff(
    manifest: CheckpointManifest,
    checkpointDir: string,
    projectRoot: string
  ): CheckpointDiffResult {
    const fileItems: FileDiffItem[] = [];
    let totalInsertions = 0;
    let totalDeletions = 0;
    let hasOverallConflict = false;

    for (const [relPath, entry] of Object.entries(manifest.files)) {
      const currentDiskPath = path.join(projectRoot, relPath);
      const currentExists = fs.existsSync(currentDiskPath);

      // Check external conflict if lastAgentSha256 was recorded
      let fileConflict = false;
      let conflictReason: string | undefined;

      if (currentExists && entry.lastAgentSha256) {
        try {
          const currentBuf = fs.readFileSync(currentDiskPath);
          const currentHash = crypto.createHash('sha256').update(currentBuf).digest('hex');
          if (currentHash !== entry.lastAgentSha256) {
            fileConflict = true;
            conflictReason = 'File modified outside Model Forge after agent edit.';
            hasOverallConflict = true;
          }
        } catch {
          // Ignore read error for conflict check
        }
      }

      if (!entry.existedBefore) {
        // Created file scenario
        if (!currentExists) {
          // Created by agent then deleted externally or not yet written
          continue;
        }

        let newContent = '';
        try {
          newContent = fs.readFileSync(currentDiskPath, 'utf8');
        } catch {
          newContent = '[Unreadable file]';
        }

        const newLines = newContent.length === 0 ? [] : newContent.split(/\r?\n/);
        const insertions = newLines.length;
        const deletions = 0;

        const patchLines = [
          `--- /dev/null`,
          `+++ b/${relPath}`,
          `@@ -0,0 +1,${insertions} @@`,
          ...newLines.map((l) => `+${l}`),
        ];

        fileItems.push({
          relativePath: relPath,
          status: 'created',
          insertions,
          deletions,
          unifiedDiff: patchLines.join('\n'),
          hasConflict: fileConflict,
          conflictReason,
        });

        totalInsertions += insertions;
      } else {
        // Existed before scenario
        const backupPath = entry.backupFileName
          ? path.join(checkpointDir, 'files', entry.backupFileName)
          : null;

        let originalContent = '';
        if (backupPath && fs.existsSync(backupPath)) {
          originalContent = fs.readFileSync(backupPath, 'utf8');
        }

        if (!currentExists) {
          // Deleted file scenario
          const oldLines = originalContent.length === 0 ? [] : originalContent.split(/\r?\n/);
          const deletions = oldLines.length;
          const insertions = 0;

          const patchLines = [
            `--- a/${relPath}`,
            `+++ /dev/null`,
            `@@ -1,${deletions} +0,0 @@`,
            ...oldLines.map((l) => `-${l}`),
          ];

          fileItems.push({
            relativePath: relPath,
            status: 'deleted',
            insertions,
            deletions,
            unifiedDiff: patchLines.join('\n'),
            hasConflict: fileConflict,
            conflictReason,
          });

          totalDeletions += deletions;
        } else {
          // Modified file scenario
          let currentContent = '';
          try {
            currentContent = fs.readFileSync(currentDiskPath, 'utf8');
          } catch {
            currentContent = '';
          }

          if (currentContent === originalContent) {
            // No changes
            continue;
          }

          const diffResult = DiffService.generateUnifiedDiff(
            originalContent,
            currentContent,
            relPath
          );

          fileItems.push({
            relativePath: relPath,
            status: 'modified',
            insertions: diffResult.insertions,
            deletions: diffResult.deletions,
            unifiedDiff: diffResult.unifiedDiff,
            hasConflict: fileConflict,
            conflictReason,
          });

          totalInsertions += diffResult.insertions;
          totalDeletions += diffResult.deletions;
        }
      }
    }

    return {
      checkpointId: manifest.id,
      projectId: manifest.projectId,
      files: fileItems,
      totalFilesChanged: fileItems.length,
      totalInsertions,
      totalDeletions,
      hasConflict: hasOverallConflict,
    };
  }

  /**
   * Generates a standard unified diff patch between two text strings.
   */
  public static generateUnifiedDiff(
    oldText: string,
    newText: string,
    filePath: string,
    contextLines = 3
  ): { unifiedDiff: string; insertions: number; deletions: number } {
    const oldLines = oldText.length === 0 ? [] : oldText.split(/\r?\n/);
    const newLines = newText.length === 0 ? [] : newText.split(/\r?\n/);

    const edits = DiffService.computeLcsEdits(oldLines, newLines);

    let insertions = 0;
    let deletions = 0;
    for (const edit of edits) {
      if (edit.type === 'add') insertions++;
      else if (edit.type === 'delete') deletions++;
    }

    if (insertions === 0 && deletions === 0) {
      return { unifiedDiff: '', insertions: 0, deletions: 0 };
    }

    // Group edits into hunks with context
    const hunks = DiffService.buildHunks(edits, contextLines);

    const out: string[] = [
      `--- a/${filePath}`,
      `+++ b/${filePath}`,
    ];

    for (const hunk of hunks) {
      const oldRange = hunk.oldLines === 1 ? `${hunk.oldStart}` : `${hunk.oldStart},${hunk.oldLines}`;
      const newRange = hunk.newLines === 1 ? `${hunk.newStart}` : `${hunk.newStart},${hunk.newLines}`;
      out.push(`@@ -${oldRange} +${newRange} @@`);
      out.push(...hunk.lines);
    }

    return {
      unifiedDiff: out.join('\n'),
      insertions,
      deletions,
    };
  }

  /**
   * Longest Common Subsequence line diff
   */
  private static computeLcsEdits(
    a: string[],
    b: string[]
  ): Array<{ type: 'equal' | 'add' | 'delete'; line: string; oldIndex?: number; newIndex?: number }> {
    const n = a.length;
    const m = b.length;

    // Boundary cases
    if (n === 0) {
      return b.map((line, idx) => ({ type: 'add' as const, line, newIndex: idx + 1 }));
    }
    if (m === 0) {
      return a.map((line, idx) => ({ type: 'delete' as const, line, oldIndex: idx + 1 }));
    }

    // Compute LCS matrix (for moderate files; max 5000 lines)
    // If files are very large (> 4000 lines), fall back to simple chunk comparison
    if (n * m > 16000000) {
      return [
        ...a.map((l, i) => ({ type: 'delete' as const, line: l, oldIndex: i + 1 })),
        ...b.map((l, i) => ({ type: 'add' as const, line: l, newIndex: i + 1 })),
      ];
    }

    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to reconstruct edits
    let i = n;
    let j = m;
    const editsReversed: Array<{
      type: 'equal' | 'add' | 'delete';
      line: string;
      oldIndex?: number;
      newIndex?: number;
    }> = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        editsReversed.push({ type: 'equal', line: a[i - 1], oldIndex: i, newIndex: j });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        editsReversed.push({ type: 'add', line: b[j - 1], newIndex: j });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        editsReversed.push({ type: 'delete', line: a[i - 1], oldIndex: i });
        i--;
      }
    }

    return editsReversed.reverse();
  }

  private static buildHunks(
    edits: Array<{ type: 'equal' | 'add' | 'delete'; line: string; oldIndex?: number; newIndex?: number }>,
    context: number
  ): DiffHunk[] {
    const hunks: DiffHunk[] = [];

    // Find indices of changes
    const changeIndices: number[] = [];
    for (let i = 0; i < edits.length; i++) {
      if (edits[i].type !== 'equal') {
        changeIndices.push(i);
      }
    }

    if (changeIndices.length === 0) {
      return hunks;
    }

    // Group changes into clusters separated by > 2 * context equal lines
    const clusters: Array<{ start: number; end: number }> = [];
    let currentCluster = {
      start: Math.max(0, changeIndices[0] - context),
      end: Math.min(edits.length - 1, changeIndices[0] + context),
    };

    for (let c = 1; c < changeIndices.length; c++) {
      const idx = changeIndices[c];
      const start = Math.max(0, idx - context);
      const end = Math.min(edits.length - 1, idx + context);

      if (start <= currentCluster.end) {
        currentCluster.end = Math.max(currentCluster.end, end);
      } else {
        clusters.push(currentCluster);
        currentCluster = { start, end };
      }
    }
    clusters.push(currentCluster);

    // Build DiffHunk for each cluster
    for (const cluster of clusters) {
      const slice = edits.slice(cluster.start, cluster.end + 1);
      const hunkLines: string[] = [];
      let oldLines = 0;
      let newLines = 0;
      let oldStart: number | undefined;
      let newStart: number | undefined;

      // Track running old/new line numbers
      let currentOld = 1;
      let currentNew = 1;
      for (let i = 0; i < cluster.start; i++) {
        if (edits[i].type === 'equal') {
          currentOld++;
          currentNew++;
        } else if (edits[i].type === 'delete') {
          currentOld++;
        } else if (edits[i].type === 'add') {
          currentNew++;
        }
      }

      oldStart = currentOld;
      newStart = currentNew;

      for (const item of slice) {
        if (item.type === 'equal') {
          hunkLines.push(` ${item.line}`);
          oldLines++;
          newLines++;
        } else if (item.type === 'delete') {
          hunkLines.push(`-${item.line}`);
          oldLines++;
        } else if (item.type === 'add') {
          hunkLines.push(`+${item.line}`);
          newLines++;
        }
      }

      hunks.push({
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: hunkLines,
      });
    }

    return hunks;
  }
}
