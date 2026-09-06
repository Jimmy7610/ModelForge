import fs from 'node:fs';
import { GgufValueType } from '../../src/main/gguf/types';

export class GgufBuilder {
  private version: number = 3;
  private tensorCount: bigint = 0n;
  private kvPairs: Array<{ key: string; type: GgufValueType; value: unknown }> = [];

  public setVersion(v: number): this {
    this.version = v;
    return this;
  }

  public setTensorCount(c: bigint | number): this {
    this.tensorCount = BigInt(c);
    return this;
  }

  public addString(key: string, val: string): this {
    this.kvPairs.push({ key, type: GgufValueType.STRING, value: val });
    return this;
  }

  public addUint32(key: string, val: number): this {
    this.kvPairs.push({ key, type: GgufValueType.UINT32, value: val });
    return this;
  }

  public addUint64(key: string, val: bigint | number): this {
    this.kvPairs.push({ key, type: GgufValueType.UINT64, value: BigInt(val) });
    return this;
  }

  public addBool(key: string, val: boolean): this {
    this.kvPairs.push({ key, type: GgufValueType.BOOL, value: val });
    return this;
  }

  public addStringArray(key: string, items: string[]): this {
    this.kvPairs.push({
      key,
      type: GgufValueType.ARRAY,
      value: { itemType: GgufValueType.STRING, items },
    });
    return this;
  }

  public toBuffer(): Buffer {
    const buffers: Buffer[] = [];

    // Magic: 'GGUF'
    buffers.push(Buffer.from('GGUF'));

    // Version (uint32)
    const vBuf = Buffer.alloc(4);
    vBuf.writeUInt32LE(this.version, 0);
    buffers.push(vBuf);

    // Tensor Count (uint64)
    const tcBuf = Buffer.alloc(8);
    tcBuf.writeBigUInt64LE(this.tensorCount, 0);
    buffers.push(tcBuf);

    // KV Count (uint64)
    const kvcBuf = Buffer.alloc(8);
    kvcBuf.writeBigUInt64LE(BigInt(this.kvPairs.length), 0);
    buffers.push(kvcBuf);

    for (const pair of this.kvPairs) {
      // Key string
      const keyBytes = Buffer.from(pair.key, 'utf8');
      const keyLenBuf = Buffer.alloc(8);
      keyLenBuf.writeBigUInt64LE(BigInt(keyBytes.length), 0);
      buffers.push(keyLenBuf, keyBytes);

      // Value type (uint32)
      const typeBuf = Buffer.alloc(4);
      typeBuf.writeUInt32LE(pair.type, 0);
      buffers.push(typeBuf);

      // Value payload
      if (pair.type === GgufValueType.STRING) {
        const valBytes = Buffer.from(pair.value as string, 'utf8');
        const valLenBuf = Buffer.alloc(8);
        valLenBuf.writeBigUInt64LE(BigInt(valBytes.length), 0);
        buffers.push(valLenBuf, valBytes);
      } else if (pair.type === GgufValueType.UINT32) {
        const b = Buffer.alloc(4);
        b.writeUInt32LE(pair.value as number, 0);
        buffers.push(b);
      } else if (pair.type === GgufValueType.UINT64) {
        const b = Buffer.alloc(8);
        b.writeBigUInt64LE(pair.value as bigint, 0);
        buffers.push(b);
      } else if (pair.type === GgufValueType.BOOL) {
        buffers.push(Buffer.from([(pair.value as boolean) ? 1 : 0]));
      } else if (pair.type === GgufValueType.ARRAY) {
        const arr = pair.value as { itemType: GgufValueType; items: string[] };
        const itemTypeBuf = Buffer.alloc(4);
        itemTypeBuf.writeUInt32LE(arr.itemType, 0);

        const countBuf = Buffer.alloc(8);
        countBuf.writeBigUInt64LE(BigInt(arr.items.length), 0);

        buffers.push(itemTypeBuf, countBuf);

        if (arr.itemType === GgufValueType.STRING) {
          for (const item of arr.items) {
            const sBytes = Buffer.from(item, 'utf8');
            const sLenBuf = Buffer.alloc(8);
            sLenBuf.writeBigUInt64LE(BigInt(sBytes.length), 0);
            buffers.push(sLenBuf, sBytes);
          }
        }
      }
    }

    return Buffer.concat(buffers);
  }

  public writeToFile(filePath: string): void {
    fs.writeFileSync(filePath, this.toBuffer());
  }
}
