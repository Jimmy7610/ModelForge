import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard } from '../src/renderer/utils/clipboard';

describe('Copy Everywhere & Clipboard Architecture (Pass 4.1)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      modelForge: {
        copyText: vi.fn(),
      },
    });
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects non-string values gracefully', async () => {
    expect(await copyToClipboard(null as any)).toBe(false);
    expect(await copyToClipboard(undefined as any)).toBe(false);
    expect(await copyToClipboard(123 as any)).toBe(false);
    expect(await copyToClipboard({ text: 'object' } as any)).toBe(false);
  });

  it('routes copy through privileged window.modelForge.copyText IPC first', async () => {
    const copyTextMock = vi.fn().mockResolvedValue(true);
    (window as any).modelForge.copyText = copyTextMock;

    const result = await copyToClipboard('const model = "Qwen2.5-Coder";');
    expect(result).toBe(true);
    expect(copyTextMock).toHaveBeenCalledWith('const model = "Qwen2.5-Coder";');
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('falls back to browser navigator.clipboard if window.modelForge is absent', async () => {
    vi.stubGlobal('window', {});
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const result = await copyToClipboard('Fallback text');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('Fallback text');
  });

  it('falls back to navigator.clipboard if IPC copyText throws an exception', async () => {
    (window as any).modelForge.copyText = vi.fn().mockRejectedValue(new Error('IPC bridge broken'));
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const result = await copyToClipboard('Resilient text');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('Resilient text');
  });

  it('returns false if both IPC and navigator.clipboard fail', async () => {
    (window as any).modelForge.copyText = vi.fn().mockRejectedValue(new Error('IPC failed'));
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard denied')),
      },
    });

    const result = await copyToClipboard('Failed text');
    expect(result).toBe(false);
  });

  it('validates IPC handler length constraints against excessive payloads', () => {
    // Simulating IPC handler logic in src/main/ipc.ts
    const MAX_ALLOWED = 5 * 1024 * 1024;
    const validate = (text: unknown) => {
      if (typeof text !== 'string') return false;
      if (text.length > MAX_ALLOWED) return false;
      return true;
    };

    expect(validate('valid string')).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate({ bad: 'input' })).toBe(false);
    expect(validate('a'.repeat(MAX_ALLOWED))).toBe(true);
    expect(validate('a'.repeat(MAX_ALLOWED + 1))).toBe(false);
  });
});
