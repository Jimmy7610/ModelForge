import {
  LlamaModel,
  LlamaContext,
  LlamaChatSession,
  defineChatSessionFunction,
  resolveChatWrapper,
  JinjaTemplateChatWrapper,
  ChatMLChatWrapper,
  ChatWrapper,
} from 'node-llama-cpp';
import { ToolCapabilityInfo } from '../../shared/types';

interface CachedCapability extends ToolCapabilityInfo {
  workingWrapperType?: 'default' | 'jinja-noJinja' | 'chatML';
}

export class ToolCallingCompatibility {
  private cache = new Map<string, CachedCapability>();

  /**
   * Retrieves the cached tool capability status for a model, or 'unknown'.
   */
  public getCachedCapability(modelId: string): ToolCapabilityInfo {
    const found = this.cache.get(modelId);
    if (!found) {
      return { status: 'unknown' };
    }
    return {
      status: found.status,
      testedAt: found.testedAt,
      wrapperName: found.wrapperName,
      isJinja: found.isJinja,
      usingNoJinjaFallback: found.usingNoJinjaFallback,
      reason: found.reason,
    };
  }

  /**
   * Resolves the verified agent ChatWrapper for a given model.
   * If a non-default fallback wrapper was validated during probing, uses that working wrapper.
   */
  public resolveAgentChatWrapper(model: LlamaModel, modelId: string): ChatWrapper {
    const cached = this.cache.get(modelId);

    if (cached?.status === 'supported' && cached.workingWrapperType) {
      if (cached.workingWrapperType === 'jinja-noJinja') {
        const rawTemplate = model.fileInfo?.metadata?.tokenizer?.chat_template;
        if (rawTemplate) {
          try {
            return new JinjaTemplateChatWrapper({
              template: rawTemplate,
              tokenizer: model.tokenizer,
              functionCallMessageTemplate: 'noJinja',
            });
          } catch {
            // Fall through to resolveChatWrapper on error
          }
        }
      } else if (cached.workingWrapperType === 'chatML') {
        try {
          return new ChatMLChatWrapper();
        } catch {
          // Fall through
        }
      }
    }

    // Default resolution
    return resolveChatWrapper(model);
  }

  /**
   * Runs a lightweight local tool capability probe on the resident model.
   * Tests whether the native function call handler actually executes.
   */
  public async probeModelToolCapability(
    model: LlamaModel,
    context: LlamaContext,
    modelId: string
  ): Promise<ToolCapabilityInfo> {
    const existing = this.cache.get(modelId);
    if (existing && (existing.status === 'supported' || existing.status === 'unsupported')) {
      return this.getCachedCapability(modelId);
    }

    this.cache.set(modelId, { status: 'testing' });

    // Step 1: Probe default recommended chat wrapper
    const defaultWrapper = resolveChatWrapper(model);
    const defaultName = defaultWrapper?.constructor?.name ?? 'UnknownWrapper';
    const isDefaultJinja = defaultWrapper instanceof JinjaTemplateChatWrapper;

    const res1 = await this.runSingleProbe(context, defaultWrapper);
    if (res1.fired) {
      const result: CachedCapability = {
        status: 'supported',
        testedAt: new Date().toISOString(),
        wrapperName: defaultName,
        isJinja: isDefaultJinja,
        usingNoJinjaFallback: false,
        workingWrapperType: 'default',
      };
      this.cache.set(modelId, result);
      return result;
    }

    // Step 2: Test JinjaTemplateChatWrapper with noJinja function-call fallback
    const rawTemplate = model.fileInfo?.metadata?.tokenizer?.chat_template;
    if (rawTemplate) {
      try {
        const noJinjaWrapper = new JinjaTemplateChatWrapper({
          template: rawTemplate,
          tokenizer: model.tokenizer,
          functionCallMessageTemplate: 'noJinja',
        });
        const res2 = await this.runSingleProbe(context, noJinjaWrapper);
        if (res2.fired) {
          const result: CachedCapability = {
            status: 'supported',
            testedAt: new Date().toISOString(),
            wrapperName: 'JinjaTemplateChatWrapper (noJinja)',
            isJinja: true,
            usingNoJinjaFallback: true,
            workingWrapperType: 'jinja-noJinja',
          };
          this.cache.set(modelId, result);
          return result;
        }
      } catch {
        // Continue to fallback
      }
    }

    // Step 3: Test ChatMLChatWrapper fallback
    try {
      const chatMLWrapper = new ChatMLChatWrapper();
      const res3 = await this.runSingleProbe(context, chatMLWrapper);
      if (res3.fired) {
        const result: CachedCapability = {
          status: 'supported',
          testedAt: new Date().toISOString(),
          wrapperName: 'ChatMLChatWrapper',
          isJinja: false,
          usingNoJinjaFallback: true,
          workingWrapperType: 'chatML',
        };
        this.cache.set(modelId, result);
        return result;
      }
    } catch {
      // Continue to unsupported
    }

    // All probes failed
    const unsupportedResult: CachedCapability = {
      status: 'unsupported',
      testedAt: new Date().toISOString(),
      wrapperName: defaultName,
      isJinja: isDefaultJinja,
      reason: 'Model did not trigger native function call handler during capability probe.',
    };
    this.cache.set(modelId, unsupportedResult);
    return unsupportedResult;
  }

  /**
   * Helper to execute a single capability probe prompt on an isolated sequence.
   */
  private async runSingleProbe(
    context: LlamaContext,
    wrapper: ChatWrapper
  ): Promise<{ fired: boolean; tokenMatched: boolean }> {
    let handlerFired = false;
    let returnedToken = '';
    const nonce = 'mf-nonce-' + Math.random().toString(36).substring(2, 8);

    const probeFunc = {
      model_forge_probe: defineChatSessionFunction({
        description: 'Call this function to confirm project-tool capability.',
        params: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'Nonce verification token' },
          },
        },
        handler: async (args: { token?: string }) => {
          handlerFired = true;
          returnedToken = args?.token || '';
          return JSON.stringify({ ok: true, token: args?.token ?? nonce });
        },
      }),
    };

    let seq: any = null;
    let tempContext: any = null;

    try {
      if (!context.disposed && (context.sequencesLeft ?? 0) > 0) {
        seq = context.getSequence();
      } else {
        tempContext = await (context as any).model?.createContext?.({ contextSize: 2048 });
        if (tempContext) {
          seq = tempContext.getSequence();
        }
      }

      if (!seq) {
        return { fired: false, tokenMatched: false };
      }

      const session = new LlamaChatSession({
        contextSequence: seq,
        chatWrapper: wrapper,
        systemPrompt: 'You are an autonomous assistant with tool access. When requested to test tools, you MUST call the provided function.',
      });

      await session.prompt(
        'You are validating tool support. Use the provided model_forge_probe function once, then respond with "probe complete".',
        {
          functions: probeFunc,
          maxTokens: 128,
        }
      );
    } catch {
      // Prompt error or timeout
    } finally {
      try {
        if (seq && !seq.disposed) seq.dispose();
        if (tempContext && !tempContext.disposed) tempContext.dispose();
      } catch {
        // ignore disposal errors
      }
    }

    return { fired: handlerFired, tokenMatched: returnedToken === nonce };
  }

  public resetModel(modelId: string): void {
    this.cache.delete(modelId);
  }

  public resetAll(): void {
    this.cache.clear();
  }
}
