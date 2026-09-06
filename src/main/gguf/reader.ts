import fs from 'node:fs';

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KB buffer
const MAX_SAFE_STRING_LENGTH = 10 * 1024 * 1024; // 10 MB absolute maximum for a single string

export class ChunkedFileReader {
  private fd: number;
  private fileSize: number;
  private fileOffset: number = 0;
  private buffer: Buffer;
  private bufferStart: number = 0;
  private bufferEnd: number = 0;

  constructor(fd: number, fileSize: number) {
    this.fd = fd;
    this.fileSize = fileSize;
    this.buffer = Buffer.alloc(DEFAULT_CHUNK_SIZE);
  }

  public getOffset(): number {
    return this.fileOffset;
  }

  public getFileSize(): number {
    return this.fileSize;
  }

  /** Ensures that at least `required` bytes are available in buffer from `this.fileOffset` */
  private ensure(required: number): void {
    if (this.fileOffset + required > this.fileSize) {
      throw new Error(`Unexpected end of file at offset ${this.fileOffset}, required ${required} bytes, file size is ${this.fileSize}`);
    }

    const available = this.bufferEnd - this.fileOffset;
    if (available >= required) {
      return;
    }

    // Need to reload buffer starting at fileOffset
    const toRead = Math.min(Math.max(DEFAULT_CHUNK_SIZE, required), this.fileSize - this.fileOffset);
    if (toRead > this.buffer.length) {
      this.buffer = Buffer.alloc(toRead);
    }

    const bytesRead = fs.readSync(this.fd, this.buffer, 0, toRead, this.fileOffset);
    if (bytesRead < required) {
      throw new Error(`Failed to read required ${required} bytes at offset ${this.fileOffset}, read ${bytesRead}`);
    }

    this.bufferStart = this.fileOffset;
    this.bufferEnd = this.fileOffset + bytesRead;
  }

  public readUint8(): number {
    this.ensure(1);
    const val = this.buffer.readUInt8(this.fileOffset - this.bufferStart);
    this.fileOffset += 1;
    return val;
  }

  public readInt8(): number {
    this.ensure(1);
    const val = this.buffer.readInt8(this.fileOffset - this.bufferStart);
    this.fileOffset += 1;
    return val;
  }

  public readUint16(): number {
    this.ensure(2);
    const val = this.buffer.readUInt16LE(this.fileOffset - this.bufferStart);
    this.fileOffset += 2;
    return val;
  }

  public readInt16(): number {
    this.ensure(2);
    const val = this.buffer.readInt16LE(this.fileOffset - this.bufferStart);
    this.fileOffset += 2;
    return val;
  }

  public readUint32(): number {
    this.ensure(4);
    const val = this.buffer.readUInt32LE(this.fileOffset - this.bufferStart);
    this.fileOffset += 4;
    return val;
  }

  public readInt32(): number {
    this.ensure(4);
    const val = this.buffer.readInt32LE(this.fileOffset - this.bufferStart);
    this.fileOffset += 4;
    return val;
  }

  public readFloat32(): number {
    this.ensure(4);
    const val = this.buffer.readFloatLE(this.fileOffset - this.bufferStart);
    this.fileOffset += 4;
    return val;
  }

  public readFloat64(): number {
    this.ensure(8);
    const val = this.buffer.readDoubleLE(this.fileOffset - this.bufferStart);
    this.fileOffset += 8;
    return val;
  }

  public readUint64(): number {
    this.ensure(8);
    const big = this.buffer.readBigUInt64LE(this.fileOffset - this.bufferStart);
    this.fileOffset += 8;
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`uint64 exceeds safe integer range at offset ${this.fileOffset}`);
    }
    return Number(big);
  }

  public readInt64(): number {
    this.ensure(8);
    const big = this.buffer.readBigInt64LE(this.fileOffset - this.bufferStart);
    this.fileOffset += 8;
    return Number(big);
  }

  public readBool(): boolean {
    return this.readUint8() !== 0;
  }

  /**
   * Reads a GGUF string: uint64 length followed by utf8 bytes.
   */
  public readString(maxLength: number = MAX_SAFE_STRING_LENGTH): string {
    const len = this.readUint64();
    if (len < 0 || len > maxLength) {
      throw new Error(`String length ${len} exceeds safe limit ${maxLength}`);
    }
    if (len === 0) return '';

    this.ensure(len);
    const str = this.buffer.toString('utf8', this.fileOffset - this.bufferStart, this.fileOffset - this.bufferStart + len);
    this.fileOffset += len;
    return str;
  }

  /**
   * Skips `bytes` without reading them into memory.
   */
  public skipBytes(bytes: number): void {
    if (bytes < 0) throw new Error(`Cannot skip negative bytes: ${bytes}`);
    if (this.fileOffset + bytes > this.fileSize) {
      throw new Error(`Cannot skip ${bytes} bytes: exceeds file size ${this.fileSize}`);
    }
    this.fileOffset += bytes;
  }

  /**
   * Reads string length and skips the string payload without allocating memory.
   */
  public skipString(): void {
    const len = this.readUint64();
    this.skipBytes(len);
  }
}
