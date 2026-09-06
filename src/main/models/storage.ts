import fs from 'node:fs';
import path from 'node:path';
import { DriveStorageInfo } from '../../shared/types';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 GB';
  const tb = 1024 * 1024 * 1024 * 1024;
  const gb = 1024 * 1024 * 1024;

  if (bytes >= tb) {
    const val = Math.round((bytes / tb) * 100) / 100;
    return `${val.toFixed(2)} TB`;
  }
  const val = Math.round((bytes / gb) * 10) / 10;
  return `${val.toFixed(1)} GB`;
}

export function getDriveStorageForPath(targetPath: string): DriveStorageInfo | null {
  try {
    if (!targetPath || !fs.existsSync(targetPath)) {
      return null;
    }

    // Use Node.js built-in statfs
    if (typeof fs.statfsSync !== 'function') {
      return null;
    }

    const stat = fs.statfsSync(targetPath);
    if (!stat || stat.blocks <= 0) {
      return null;
    }

    const totalBytes = Number(BigInt(stat.blocks) * BigInt(stat.bsize));
    const freeBytes = Number(BigInt(stat.bavail) * BigInt(stat.bsize));
    const usedBytes = Math.max(0, totalBytes - freeBytes);

    const usedPercentage = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

    return {
      mountPath: path.resolve(targetPath),
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercentage,
      formattedUsed: formatBytes(usedBytes),
      formattedTotal: formatBytes(totalBytes),
    };
  } catch (err) {
    console.warn(`Failed to inspect drive storage for "${targetPath}":`, err);
    return null;
  }
}
