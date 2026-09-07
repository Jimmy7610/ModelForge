export interface AgentBudgetLimits {
  /** Maximum number of tool calls permitted across a single plan run (default 25) */
  maxToolCalls: number;
  /** Maximum wall-clock execution time permitted in milliseconds (default 5 minutes = 300,000 ms) */
  maxRuntimeMs: number;
  /** Maximum matches returned per search_text call (default 50) */
  maxSearchResultsPerCall: number;
  /** Maximum directory entries returned per list_directory call (default 300) */
  maxDirectoryEntries: number;
  /** Maximum text characters returned per tool call (default 12,000 chars) */
  maxReturnedCharsPerToolCall: number;
  /** Maximum cumulative text characters returned across all tool calls in a run (default 60,000 chars) */
  maxCumulativeReturnedChars: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  code?: 'MAX_CALLS_EXCEEDED' | 'RUNTIME_EXCEEDED' | 'CUMULATIVE_TEXT_EXCEEDED';
  reason?: string;
}

export class AgentBudget {
  public readonly limits: AgentBudgetLimits;
  public toolCallCount = 0;
  public cumulativeChars = 0;
  public readonly startTime: number;

  constructor(limits?: Partial<AgentBudgetLimits>, startTime?: number) {
    this.limits = {
      maxToolCalls: limits?.maxToolCalls ?? 25,
      maxRuntimeMs: limits?.maxRuntimeMs ?? 300_000,
      maxSearchResultsPerCall: limits?.maxSearchResultsPerCall ?? 50,
      maxDirectoryEntries: limits?.maxDirectoryEntries ?? 300,
      maxReturnedCharsPerToolCall: limits?.maxReturnedCharsPerToolCall ?? 12_000,
      maxCumulativeReturnedChars: limits?.maxCumulativeReturnedChars ?? 60_000,
    };
    this.startTime = startTime ?? Date.now();
  }

  /**
   * Pre-execution budget validation.
   * Must be evaluated before any tool call commences.
   */
  public checkBudget(): BudgetCheckResult {
    const elapsed = Date.now() - this.startTime;
    if (elapsed > this.limits.maxRuntimeMs) {
      return {
        allowed: false,
        code: 'RUNTIME_EXCEEDED',
        reason: `Execution exceeded max wall-clock runtime of ${Math.round(this.limits.maxRuntimeMs / 1000)}s (${Math.round(elapsed / 1000)}s elapsed)`,
      };
    }

    if (this.toolCallCount >= this.limits.maxToolCalls) {
      return {
        allowed: false,
        code: 'MAX_CALLS_EXCEEDED',
        reason: `Tool call budget exceeded: reached maximum limit of ${this.limits.maxToolCalls} tool calls`,
      };
    }

    if (this.cumulativeChars >= this.limits.maxCumulativeReturnedChars) {
      return {
        allowed: false,
        code: 'CUMULATIVE_TEXT_EXCEEDED',
        reason: `Cumulative project text budget exceeded: reached maximum limit of ${this.limits.maxCumulativeReturnedChars} characters`,
      };
    }

    return { allowed: true };
  }

  /**
   * Post-execution recording of tool invocation and returned data volume.
   */
  public recordToolCall(returnedChars: number): void {
    this.toolCallCount++;
    this.cumulativeChars += Math.max(0, returnedChars);
  }

  /**
   * Bounds the tool output text to adhere to per-call and cumulative limits.
   */
  public boundToolOutput(rawContent: string): { content: string; truncated: boolean } {
    let truncated = false;
    let text = rawContent;

    // 1. Bound per tool call
    if (text.length > this.limits.maxReturnedCharsPerToolCall) {
      text = text.slice(0, this.limits.maxReturnedCharsPerToolCall) +
        `\n\n[Truncated: output exceeded per-call budget of ${this.limits.maxReturnedCharsPerToolCall} characters]`;
      truncated = true;
    }

    // 2. Bound against remaining cumulative budget
    const remainingCumulative = this.limits.maxCumulativeReturnedChars - this.cumulativeChars;
    if (remainingCumulative <= 0) {
      text = '[Output suppressed: cumulative text budget reached]';
      truncated = true;
    } else if (text.length > remainingCumulative) {
      text = text.slice(0, remainingCumulative) +
        `\n\n[Truncated: output reached cumulative budget limit of ${this.limits.maxCumulativeReturnedChars} characters]`;
      truncated = true;
    }

    return { content: text, truncated };
  }

  public getSummary(): {
    toolCalls: number;
    maxToolCalls: number;
    cumulativeChars: number;
    maxCumulativeChars: number;
    elapsedMs: number;
    maxRuntimeMs: number;
  } {
    return {
      toolCalls: this.toolCallCount,
      maxToolCalls: this.limits.maxToolCalls,
      cumulativeChars: this.cumulativeChars,
      maxCumulativeChars: this.limits.maxCumulativeReturnedChars,
      elapsedMs: Date.now() - this.startTime,
      maxRuntimeMs: this.limits.maxRuntimeMs,
    };
  }
}
