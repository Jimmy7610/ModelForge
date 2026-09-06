import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseGgufHeaderSync, extractQuantizationFromFilename } from '../src/main/gguf/parser';
import { GgufBuilder } from './fixtures/gguf-builder';

describe('GGUF Binary Parser & Header Inspector', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelforge-gguf-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('parses valid minimal GGUF v3 file and extracts architecture and file_type', () => {
    const filePath = path.join(tempDir, 'model.gguf');
    new GgufBuilder()
      .setVersion(3)
      .addString('general.name', 'Qwen3 Coder')
      .addString('general.architecture', 'qwen2')
      .addUint32('general.file_type', 15) // Q4_K_M
      .addUint32('qwen2.context_length', 32768)
      .writeToFile(filePath);

    const result = parseGgufHeaderSync(filePath);
    expect(result.status).toBe('available');
    expect(result.data).toBeDefined();
    expect(result.data?.ggufVersion).toBe(3);
    expect(result.data?.name).toBe('Qwen3 Coder');
    expect(result.data?.architecture).toBe('qwen2');
    expect(result.data?.quantization).toBe('Q4_K_M');
    expect(result.data?.quantizationSource).toBe('metadata');
    expect(result.data?.contextLength).toBe(32768);
  });

  it('parses valid GGUF v2 file and maps Q8_0 file_type', () => {
    const filePath = path.join(tempDir, 'llama-model.gguf');
    new GgufBuilder()
      .setVersion(2)
      .addString('general.name', 'Llama 3 8B')
      .addString('general.architecture', 'llama')
      .addUint32('general.file_type', 7) // Q8_0
      .addUint64('llama.context_length', 8192)
      .writeToFile(filePath);

    const result = parseGgufHeaderSync(filePath);
    expect(result.status).toBe('available');
    expect(result.data?.ggufVersion).toBe(2);
    expect(result.data?.quantization).toBe('Q8_0');
    expect(result.data?.quantizationSource).toBe('metadata');
    expect(result.data?.contextLength).toBe(8192);
  });

  it('falls back to filename quantization when metadata does not specify file_type', () => {
    const filePath = path.join(tempDir, 'Gemma-2-9B-It-Q5_K_M.gguf');
    new GgufBuilder()
      .setVersion(3)
      .addString('general.architecture', 'gemma2')
      .writeToFile(filePath);

    const result = parseGgufHeaderSync(filePath);
    expect(result.status).toBe('available');
    expect(result.data?.quantization).toBe('Q5_K_M');
    expect(result.data?.quantizationSource).toBe('filename');
  });

  it('correctly extracts quantization labels from filenames', () => {
    expect(extractQuantizationFromFilename('qwen-14b-Q4_K_M.gguf')).toBe('Q4_K_M');
    expect(extractQuantizationFromFilename('model.q8_0.GGUF')).toBe('Q8_0');
    expect(extractQuantizationFromFilename('mistral-IQ3_XS.gguf')).toBe('IQ3_XS');
    expect(extractQuantizationFromFilename('plain-model.gguf')).toBeNull();
  });

  it('rejects files with invalid GGUF magic header without crashing', () => {
    const filePath = path.join(tempDir, 'invalid-magic.gguf');
    fs.writeFileSync(filePath, Buffer.from('FAKE-HEADER-DATA-THAT-IS-NOT-GGUF'));

    const result = parseGgufHeaderSync(filePath);
    expect(result.status).toBe('error');
    expect(result.error).toContain('Invalid GGUF magic');
  });

  it('rejects truncated files gracefully without crashing', () => {
    const filePath = path.join(tempDir, 'truncated.gguf');
    // Write only magic and partial version (6 bytes)
    fs.writeFileSync(filePath, Buffer.from([0x47, 0x47, 0x55, 0x46, 0x03, 0x00]));

    const result = parseGgufHeaderSync(filePath);
    expect(result.status).toBe('error');
    expect(result.error).toContain('less than 24 bytes');
  });

  it('handles EOF mid-header gracefully', () => {
    const filePath = path.join(tempDir, 'cut-off.gguf');
    const valid = new GgufBuilder()
      .addString('general.name', 'Very Long Header That Will Be Truncated')
      .toBuffer();

    // Slice buffer in half
    fs.writeFileSync(filePath, valid.subarray(0, Math.floor(valid.length / 2)));

    const result = parseGgufHeaderSync(filePath);
    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
  });

  it('guards against absurd metadata KV counts', () => {
    const filePath = path.join(tempDir, 'absurd-kv.gguf');
    const buf = Buffer.alloc(32);
    buf.write('GGUF', 0); // magic
    buf.writeUInt32LE(3, 4); // version 3
    buf.writeBigUInt64LE(0n, 8); // tensor count
    buf.writeBigUInt64LE(999999n, 16); // absurd KV count: 999,999

    fs.writeFileSync(filePath, buf);

    const result = parseGgufHeaderSync(filePath);
    expect(result.status).toBe('error');
    expect(result.error).toContain('exceeds safe threshold');
  });

  it('safely skips massive tokenizer string arrays without allocating memory', () => {
    const filePath = path.join(tempDir, 'huge-tokenizer.gguf');

    // Create 1000 dummy token strings in an array
    const tokens: string[] = [];
    for (let i = 0; i < 1000; i++) {
      tokens.push(`<token_${i}>`);
    }

    new GgufBuilder()
      .setVersion(3)
      .addString('general.architecture', 'llama')
      .addStringArray('tokenizer.ggml.tokens', tokens)
      .addUint32('general.file_type', 2) // Q4_0
      .writeToFile(filePath);

    const result = parseGgufHeaderSync(filePath);
    expect(result.status).toBe('available');
    expect(result.data?.architecture).toBe('llama');
    expect(result.data?.quantization).toBe('Q4_0');
  });
});
