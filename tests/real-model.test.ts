import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseGgufHeaderSync } from '../src/main/gguf/parser';

describe('Real-World Local GGUF Validation', () => {
  const realModelPath = 'C:\\Users\\Jimmy\\Downloads\\Muse-Glimmer-30B-UD-Q4_K_XL.gguf';

  it('inspects real-world GGUF model without reading entire file into RAM', () => {
    if (!fs.existsSync(realModelPath)) {
      console.info('Real model not present, skipping real fixture test');
      return;
    }

    const startMemory = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    const result = parseGgufHeaderSync(realModelPath);

    const elapsedMs = Date.now() - startTime;
    const memoryDiff = process.memoryUsage().heapUsed - startMemory;

    expect(result.status).toBe('available');
    expect(result.data).toBeDefined();
    expect(result.data?.ggufVersion).toBeGreaterThanOrEqual(2);

    console.info('=== REAL MODEL INSPECTED ===');
    console.info('Path:', realModelPath);
    console.info('Name:', result.data?.name || result.data?.basename);
    console.info('Architecture:', result.data?.architecture);
    console.info('Quantization:', result.data?.quantization, `(source: ${result.data?.quantizationSource})`);
    console.info('Context Length:', result.data?.contextLength);
    console.info('Elapsed ms:', elapsedMs);
    console.info('Heap used diff (bytes):', memoryDiff);

    // Assert that we did NOT load the file into memory! (The file is multi-gigabytes, heap diff must be < 50MB)
    expect(memoryDiff).toBeLessThan(50 * 1024 * 1024);
    expect(elapsedMs).toBeLessThan(5000);
  });
});
