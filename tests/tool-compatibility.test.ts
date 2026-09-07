import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolCallingCompatibility } from '../src/main/inference/compatibility';
import { LlamaModel, LlamaContext } from 'node-llama-cpp';

describe('ToolCallingCompatibility', () => {
  let compat: ToolCallingCompatibility;
  let mockModel: Partial<LlamaModel>;
  let mockContext: Partial<LlamaContext>;

  beforeEach(() => {
    compat = new ToolCallingCompatibility();
    const tokenizerFn = vi.fn().mockReturnValue([1, 2, 3]);
    mockModel = {
      fileInfo: {
        metadata: {
          tokenizer: {
            chat_template: '{{ messages }}',
          },
        },
      } as any,
      tokenizer: tokenizerFn as any,
    };
    mockContext = {
      disposed: false,
      sequencesLeft: 1,
      getSequence: vi.fn().mockReturnValue({
        dispose: vi.fn(),
      }),
    };
  });

  it('initializes with unknown status for uncached models', () => {
    const info = compat.getCachedCapability('model-unknown');
    expect(info.status).toBe('unknown');
  });

  it('marks model as supported when default probe succeeds', async () => {
    const probeSpy = vi.spyOn(compat as any, 'runSingleProbe').mockResolvedValue({
      fired: true,
      tokenMatched: true,
    });

    const result = await compat.probeModelToolCapability(
      mockModel as LlamaModel,
      mockContext as LlamaContext,
      'model-1'
    );

    expect(result.status).toBe('supported');
    expect(result.usingNoJinjaFallback).toBe(false);
    expect(probeSpy).toHaveBeenCalledTimes(1);

    // Subsequent call uses cache and does not re-probe
    const cached = compat.getCachedCapability('model-1');
    expect(cached.status).toBe('supported');

    const result2 = await compat.probeModelToolCapability(
      mockModel as LlamaModel,
      mockContext as LlamaContext,
      'model-1'
    );
    expect(result2.status).toBe('supported');
    expect(probeSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to jinja-noJinja when default wrapper fails but noJinja succeeds', async () => {
    const probeSpy = vi.spyOn(compat as any, 'runSingleProbe')
      .mockResolvedValueOnce({ fired: false, tokenMatched: false })
      .mockResolvedValueOnce({ fired: true, tokenMatched: true });

    const result = await compat.probeModelToolCapability(
      mockModel as LlamaModel,
      mockContext as LlamaContext,
      'model-qwen'
    );

    expect(result.status).toBe('supported');
    expect(result.usingNoJinjaFallback).toBe(true);
    expect(result.wrapperName).toContain('noJinja');
    expect(probeSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to chatML when default and jinja-noJinja fail but chatML succeeds', async () => {
    const probeSpy = vi.spyOn(compat as any, 'runSingleProbe')
      .mockResolvedValueOnce({ fired: false, tokenMatched: false })
      .mockResolvedValueOnce({ fired: false, tokenMatched: false })
      .mockResolvedValueOnce({ fired: true, tokenMatched: true });

    const result = await compat.probeModelToolCapability(
      mockModel as LlamaModel,
      mockContext as LlamaContext,
      'model-chatml'
    );

    expect(result.status).toBe('supported');
    expect(result.usingNoJinjaFallback).toBe(true);
    expect(result.wrapperName).toBe('ChatMLChatWrapper');
    expect(probeSpy).toHaveBeenCalledTimes(3);
  });

  it('marks model as unsupported when all wrapper probes fail', async () => {
    vi.spyOn(compat as any, 'runSingleProbe').mockResolvedValue({
      fired: false,
      tokenMatched: false,
    });

    const result = await compat.probeModelToolCapability(
      mockModel as LlamaModel,
      mockContext as LlamaContext,
      'model-unsupported'
    );

    expect(result.status).toBe('unsupported');
    expect(result.reason).toContain('did not trigger native function call handler');

    const cached = compat.getCachedCapability('model-unsupported');
    expect(cached.status).toBe('unsupported');
  });

  it('supports resetting a single model and resetting all models', async () => {
    vi.spyOn(compat as any, 'runSingleProbe').mockResolvedValue({
      fired: true,
      tokenMatched: true,
    });

    await compat.probeModelToolCapability(
      mockModel as LlamaModel,
      mockContext as LlamaContext,
      'model-a'
    );
    await compat.probeModelToolCapability(
      mockModel as LlamaModel,
      mockContext as LlamaContext,
      'model-b'
    );

    expect(compat.getCachedCapability('model-a').status).toBe('supported');
    expect(compat.getCachedCapability('model-b').status).toBe('supported');

    compat.resetModel('model-a');
    expect(compat.getCachedCapability('model-a').status).toBe('unknown');
    expect(compat.getCachedCapability('model-b').status).toBe('supported');

    compat.resetAll();
    expect(compat.getCachedCapability('model-b').status).toBe('unknown');
  });
});
