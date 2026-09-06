import fs from 'node:fs';
import path from 'node:path';
import { ChunkedFileReader } from './reader';
import {
  GGUF_FILE_TYPE_MAP,
  GGUF_MAGIC_UINT32,
  GgufParseResult,
  GgufValueType,
  ParsedGgufData,
} from './types';

const MAX_SAFE_KV_COUNT = 20000;
const MAX_HEADER_SCAN_BYTES = 50 * 1024 * 1024; // 50 MB max header exploration

const PRIMITIVE_SIZES: Record<number, number> = {
  [GgufValueType.UINT8]: 1,
  [GgufValueType.INT8]: 1,
  [GgufValueType.UINT16]: 2,
  [GgufValueType.INT16]: 2,
  [GgufValueType.UINT32]: 4,
  [GgufValueType.INT32]: 4,
  [GgufValueType.FLOAT32]: 4,
  [GgufValueType.BOOL]: 1,
  [GgufValueType.UINT64]: 8,
  [GgufValueType.INT64]: 8,
  [GgufValueType.FLOAT64]: 8,
};

export function extractQuantizationFromFilename(fileName: string): string | null {
  const match = fileName.match(/(Q[0-9]_[A-Z0-9_]+|IQ[0-9]_[A-Z0-9_]+|F16|F32|BF16)/i);
  return match ? match[1].toUpperCase() : null;
}

export function cleanDisplayName(fileName: string, metadataName?: string): string {
  if (metadataName && metadataName.trim() && metadataName.length < 80) {
    return metadataName.trim();
  }
  // Strip .gguf / .GGUF extension and clean dashes/underscores
  const base = path.basename(fileName, path.extname(fileName));
  return base.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseGgufHeaderSync(filePath: string): GgufParseResult {
  let fd: number | null = null;

  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return { status: 'error', error: 'Path is not a regular file' };
    }

    if (stats.size < 24) {
      return { status: 'error', error: 'File is too small to be a valid GGUF binary (less than 24 bytes)' };
    }

    fd = fs.openSync(filePath, 'r');
    const reader = new ChunkedFileReader(fd, stats.size);

    // 1. Magic check (4 bytes)
    const magic = reader.readUint32();
    if (magic !== GGUF_MAGIC_UINT32) {
      return { status: 'error', error: `Invalid GGUF magic header (0x${magic.toString(16)})` };
    }

    // 2. Version (uint32)
    const version = reader.readUint32();
    if (version < 1 || version > 3) {
      return { status: 'error', error: `Unsupported GGUF version ${version}` };
    }

    // 3. Tensor count (uint64)
    const tensorCount = reader.readUint64();

    // 4. Metadata KV count (uint64)
    const kvCount = reader.readUint64();
    if (kvCount > MAX_SAFE_KV_COUNT) {
      return { status: 'error', error: `Metadata KV count ${kvCount} exceeds safe threshold ${MAX_SAFE_KV_COUNT}` };
    }

    const rawKv: Record<string, string | number | boolean> = {};
    let arch: string | undefined;
    let name: string | undefined;
    let basename: string | undefined;
    let fileType: number | undefined;
    let quantizationVersion: number | undefined;
    let contextLength: number | undefined;
    let tokenizerModel: string | undefined;

    for (let i = 0; i < kvCount; i++) {
      if (reader.getOffset() > MAX_HEADER_SCAN_BYTES) {
        break; // Safety limit
      }

      const key = reader.readString(1024);
      const valType = reader.readUint32();

      if (valType === GgufValueType.ARRAY) {
        const itemType = reader.readUint32();
        const itemCount = reader.readUint64();

        // Check if this is a large array or tokenizer array to skip safely
        const isTokenizerOrLarge =
          key.startsWith('tokenizer.') ||
          (itemType === GgufValueType.STRING && itemCount > 50) ||
          itemCount > 100000;

        if (isTokenizerOrLarge) {
          // Skip array items without keeping in memory
          if (itemType === GgufValueType.STRING) {
            for (let j = 0; j < itemCount; j++) {
              reader.skipString();
            }
          } else {
            const itemSize = PRIMITIVE_SIZES[itemType] || 1;
            reader.skipBytes(itemSize * itemCount);
          }
        } else {
          // Parse small non-tokenizer array (e.g. architecture dimension arrays) or skip
          if (itemType === GgufValueType.STRING) {
            for (let j = 0; j < itemCount; j++) {
              reader.skipString();
            }
          } else {
            const itemSize = PRIMITIVE_SIZES[itemType] || 1;
            reader.skipBytes(itemSize * itemCount);
          }
        }
      } else if (valType === GgufValueType.STRING) {
        const strVal = reader.readString(32768);
        rawKv[key] = strVal;

        if (key === 'general.name') name = strVal;
        else if (key === 'general.architecture') arch = strVal;
        else if (key === 'general.basename') basename = strVal;
        else if (key === 'tokenizer.ggml.model') tokenizerModel = strVal;
      } else if (valType === GgufValueType.BOOL) {
        const b = reader.readBool();
        rawKv[key] = b;
      } else if (valType === GgufValueType.UINT8 || valType === GgufValueType.INT8) {
        const num = valType === GgufValueType.UINT8 ? reader.readUint8() : reader.readInt8();
        rawKv[key] = num;
        if (key === 'general.file_type') fileType = num;
      } else if (valType === GgufValueType.UINT16 || valType === GgufValueType.INT16) {
        const num = valType === GgufValueType.UINT16 ? reader.readUint16() : reader.readInt16();
        rawKv[key] = num;
        if (key === 'general.file_type') fileType = num;
      } else if (valType === GgufValueType.UINT32 || valType === GgufValueType.INT32) {
        const num = valType === GgufValueType.UINT32 ? reader.readUint32() : reader.readInt32();
        rawKv[key] = num;

        if (key === 'general.file_type') fileType = num;
        else if (key === 'general.quantization_version') quantizationVersion = num;
        else if (key.endsWith('.context_length') || key === 'context_length') {
          contextLength = num;
        }
      } else if (valType === GgufValueType.UINT64 || valType === GgufValueType.INT64) {
        const num = valType === GgufValueType.UINT64 ? reader.readUint64() : reader.readInt64();
        rawKv[key] = num;
        if (key.endsWith('.context_length') || key === 'context_length') {
          contextLength = num;
        }
      } else if (valType === GgufValueType.FLOAT32) {
        rawKv[key] = reader.readFloat32();
      } else if (valType === GgufValueType.FLOAT64) {
        rawKv[key] = reader.readFloat64();
      } else {
        return { status: 'error', error: `Unknown GGUF value type ${valType} for key "${key}"` };
      }
    }

    // Determine quantization
    let quantization: string | null = null;
    let quantizationSource: 'metadata' | 'filename' | null = null;

    if (fileType !== undefined && GGUF_FILE_TYPE_MAP[fileType]) {
      quantization = GGUF_FILE_TYPE_MAP[fileType];
      quantizationSource = 'metadata';
    } else {
      const filenameQuant = extractQuantizationFromFilename(path.basename(filePath));
      if (filenameQuant) {
        quantization = filenameQuant;
        quantizationSource = 'filename';
      }
    }

    const data: ParsedGgufData = {
      ggufVersion: version,
      tensorCount,
      kvCount,
      name,
      architecture: arch,
      basename,
      fileType,
      quantizationVersion,
      quantization: quantization || undefined,
      quantizationSource: quantizationSource || undefined,
      contextLength,
      tokenizerModel,
      rawKv,
    };

    return { status: 'available', data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', error: `GGUF parse failure: ${message}` };
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close errors
      }
    }
  }
}
