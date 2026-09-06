import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { getDriveStorageForPath } from '../src/main/models/storage';

describe('Real Drive Storage Telemetry', () => {
  it('returns valid storage metrics for an existing directory path', () => {
    const tmp = os.tmpdir();
    const storage = getDriveStorageForPath(tmp);

    expect(storage).toBeDefined();
    if (storage) {
      expect(storage.totalBytes).toBeGreaterThan(0);
      expect(storage.freeBytes).toBeGreaterThan(0);
      expect(storage.usedBytes).toBeGreaterThanOrEqual(0);
      expect(storage.usedPercentage).toBeGreaterThanOrEqual(0);
      expect(storage.usedPercentage).toBeLessThanOrEqual(100);
      expect(storage.formattedTotal).toMatch(/(GB|TB)/);
      expect(storage.formattedUsed).toMatch(/(GB|TB)/);
    }
  });

  it('handles non-existent or invalid paths gracefully without throwing', () => {
    const invalidPath = path.join(os.tmpdir(), 'definitely-not-an-existing-dir-xyz-987');
    const result = getDriveStorageForPath(invalidPath);
    expect(result).toBeNull();
  });

  it('handles empty string path safely', () => {
    const result = getDriveStorageForPath('');
    expect(result).toBeNull();
  });
});
