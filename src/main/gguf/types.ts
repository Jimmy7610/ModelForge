export const GGUF_MAGIC_UINT32 = 0x46554747; // 'GGUF' in Little-Endian
export const GGUF_MAGIC_BYTES = Buffer.from([0x47, 0x47, 0x55, 0x46]);

export enum GgufValueType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12,
}

export const GGUF_FILE_TYPE_MAP: Record<number, string> = {
  0: 'F32',
  1: 'F16',
  2: 'Q4_0',
  3: 'Q4_1',
  7: 'Q8_0',
  8: 'Q5_0',
  9: 'Q5_1',
  10: 'Q2_K',
  11: 'Q3_K_S',
  12: 'Q3_K_M',
  13: 'Q3_K_L',
  14: 'Q4_K_S',
  15: 'Q4_K_M',
  16: 'Q5_K_S',
  17: 'Q5_K_M',
  18: 'Q6_K',
  19: 'IQ2_XXS',
  20: 'IQ2_XS',
  21: 'Q2_K_S',
  22: 'IQ3_XS',
  23: 'IQ3_XXS',
  24: 'IQ1_S',
  25: 'IQ4_NL',
  26: 'IQ3_S',
  27: 'IQ3_M',
  28: 'IQ2_S',
  29: 'IQ2_M',
  30: 'IQ4_XS',
  31: 'IQ1_M',
  32: 'BF16',
  33: 'Q4_0_4_4',
  34: 'Q4_0_4_8',
  35: 'Q4_0_8_8',
};

export interface ParsedGgufData {
  ggufVersion: number;
  tensorCount: number;
  kvCount: number;
  name?: string;
  architecture?: string;
  basename?: string;
  fileType?: number;
  quantizationVersion?: number;
  quantization?: string;
  quantizationSource?: 'metadata' | 'filename';
  contextLength?: number;
  tokenizerModel?: string;
  rawKv: Record<string, string | number | boolean>;
}

export interface GgufParseResult {
  status: 'available' | 'error';
  data?: ParsedGgufData;
  error?: string;
}
