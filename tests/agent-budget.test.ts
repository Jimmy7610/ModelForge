import { describe, it, expect } from 'vitest';
import { AgentBudget } from '../src/main/agent/budget';

describe('AgentBudget', () => {
  it('initializes with production default limits', () => {
    const budget = new AgentBudget();
    expect(budget.limits.maxToolCalls).toBe(25);
    expect(budget.limits.maxRuntimeMs).toBe(300_000);
    expect(budget.limits.maxSearchResultsPerCall).toBe(50);
    expect(budget.limits.maxDirectoryEntries).toBe(300);
    expect(budget.limits.maxReturnedCharsPerToolCall).toBe(12_000);
    expect(budget.limits.maxCumulativeReturnedChars).toBe(60_000);
    expect(budget.toolCallCount).toBe(0);
    expect(budget.cumulativeChars).toBe(0);
  });

  it('allows tool calls within limits', () => {
    const budget = new AgentBudget();
    const check = budget.checkBudget();
    expect(check.allowed).toBe(true);
    expect(check.code).toBeUndefined();
  });

  it('blocks tool calls when max tool calls (25) is reached', () => {
    const budget = new AgentBudget({ maxToolCalls: 3 });
    budget.recordToolCall(100);
    budget.recordToolCall(100);
    expect(budget.checkBudget().allowed).toBe(true);

    budget.recordToolCall(100);
    // Now count is 3, which equals limit
    const check = budget.checkBudget();
    expect(check.allowed).toBe(false);
    expect(check.code).toBe('MAX_CALLS_EXCEEDED');
    expect(check.reason).toContain('maximum limit of 3');
  });

  it('blocks tool calls when execution runtime exceeds limit', () => {
    const startTime = Date.now() - 305_000; // 305 seconds ago
    const budget = new AgentBudget({ maxRuntimeMs: 300_000 }, startTime);

    const check = budget.checkBudget();
    expect(check.allowed).toBe(false);
    expect(check.code).toBe('RUNTIME_EXCEEDED');
    expect(check.reason).toContain('exceeded max wall-clock runtime');
  });

  it('blocks tool calls when cumulative characters exceed limit', () => {
    const budget = new AgentBudget({ maxCumulativeReturnedChars: 1000 });
    budget.recordToolCall(600);
    expect(budget.checkBudget().allowed).toBe(true);

    budget.recordToolCall(450); // Total: 1050 chars
    const check = budget.checkBudget();
    expect(check.allowed).toBe(false);
    expect(check.code).toBe('CUMULATIVE_TEXT_EXCEEDED');
    expect(check.reason).toContain('Cumulative project text budget exceeded');
  });

  it('truncates tool output exceeding per-call character limit', () => {
    const budget = new AgentBudget({ maxReturnedCharsPerToolCall: 50 });
    const raw = 'A'.repeat(100);
    const bounded = budget.boundToolOutput(raw);

    expect(bounded.truncated).toBe(true);
    expect(bounded.content.startsWith('A'.repeat(50))).toBe(true);
    expect(bounded.content).toContain('[Truncated: output exceeded per-call budget');
  });

  it('truncates tool output exceeding cumulative character limit', () => {
    const budget = new AgentBudget({
      maxReturnedCharsPerToolCall: 100,
      maxCumulativeReturnedChars: 150,
    });

    budget.recordToolCall(120); // 30 remaining
    const raw = 'B'.repeat(50);
    const bounded = budget.boundToolOutput(raw);

    expect(bounded.truncated).toBe(true);
    expect(bounded.content.startsWith('B'.repeat(30))).toBe(true);
    expect(bounded.content).toContain('[Truncated: output reached cumulative budget limit');
  });

  it('suppresses tool output completely when cumulative budget is depleted', () => {
    const budget = new AgentBudget({
      maxCumulativeReturnedChars: 100,
    });

    budget.recordToolCall(100);
    const bounded = budget.boundToolOutput('Some data');
    expect(bounded.truncated).toBe(true);
    expect(bounded.content).toContain('[Output suppressed: cumulative text budget reached]');
  });

  it('provides a detailed budget summary', () => {
    const budget = new AgentBudget({ maxToolCalls: 10, maxCumulativeReturnedChars: 5000 });
    budget.recordToolCall(250);
    const summary = budget.getSummary();

    expect(summary.toolCalls).toBe(1);
    expect(summary.maxToolCalls).toBe(10);
    expect(summary.cumulativeChars).toBe(250);
    expect(summary.maxCumulativeChars).toBe(5000);
    expect(summary.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
