import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentActivity } from '../src/renderer/pages/builder/AgentActivity';
import { AgentActivityItem } from '../src/shared/types';

// Mock useAppStore
const mockUseAppStore = vi.fn();

vi.mock('@/store/AppStoreContext', () => ({
  useAppStore: () => mockUseAppStore(),
}));

// Mock CopyButton to keep rendered markup simple
vi.mock('@/components/CopyButton', () => ({
  CopyButton: () => React.createElement('button', { 'data-testid': 'copy-btn' }, 'Copy Log'),
}));

describe('Activity Status Card Truthfulness (v0.5.4 - Tests 26 to 32)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseStoreState = {
    agentActivities: [] as AgentActivityItem[],
    clearAgentActivities: vi.fn(),
    isPlanning: false,
    isEditing: false,
    editAgentState: undefined,
    addToast: vi.fn(),
  };

  // Test 26: Plan Agent session shows READ-ONLY SAFE JAIL with shield icon and 0 mutations allowed
  it('26. Plan Agent session shows READ-ONLY SAFE JAIL with shield icon and 0 mutations allowed', () => {
    mockUseAppStore.mockReturnValue({
      ...baseStoreState,
      isPlanning: true,
      agentActivities: [
        {
          id: '1',
          runId: 'plan-1',
          runKind: 'plan',
          label: 'Inspecting overview',
          time: '12:00:00',
          status: 'done',
          toolName: 'get_project_overview',
        },
      ],
    });

    const html = renderToStaticMarkup(React.createElement(AgentActivity));

    expect(html).toContain('READ-ONLY SAFE JAIL');
    expect(html).toContain('0 mutations allowed');
    expect(html).toContain('Plan / Read');
    expect(html).not.toContain('EDIT SAFE JAIL');
  });

  // Test 27: Edit Agent session shows EDIT SAFE JAIL with shield icon and mutation count
  it('27. Edit Agent session shows EDIT SAFE JAIL with shield icon and mutation count', () => {
    mockUseAppStore.mockReturnValue({
      ...baseStoreState,
      isEditing: true,
      agentActivities: [
        {
          id: '1',
          runId: 'edit-1',
          runKind: 'edit',
          label: 'Modifying src/test.ts',
          time: '12:00:01',
          status: 'done',
          toolName: 'replace_in_file',
        },
      ],
      editAgentState: {
        status: 'running',
        summary: {
          totalToolCalls: 2,
          successfulToolCalls: 2,
          failedToolCalls: 0,
          blockedToolCalls: 0,
          filesModified: ['src/test.ts'],
          filesCreated: [],
          filesDeleted: [],
          distinctToolNames: ['read_file', 'replace_in_file'],
          durationMs: 120,
        },
      },
    });

    const html = renderToStaticMarkup(React.createElement(AgentActivity));

    expect(html).toContain('EDIT SAFE JAIL');
    expect(html).toContain('Edit</span>');
    expect(html).not.toContain('READ-ONLY SAFE JAIL');
    expect(html).not.toContain('0 mutations allowed');
  });

  // Test 28: Edit Agent session with 1 mutation shows 1 mutation applied
  it('28. Edit Agent session with 1 mutation shows 1 mutation applied', () => {
    mockUseAppStore.mockReturnValue({
      ...baseStoreState,
      isEditing: false,
      agentActivities: [
        {
          id: '1',
          runId: 'edit-1',
          runKind: 'edit',
          label: 'Modifying src/test.ts',
          time: '12:00:01',
          status: 'done',
          toolName: 'replace_in_file',
        },
      ],
      editAgentState: {
        status: 'completed',
        summary: {
          totalToolCalls: 2,
          successfulToolCalls: 2,
          failedToolCalls: 0,
          blockedToolCalls: 0,
          filesModified: ['src/test.ts'],
          filesCreated: [],
          filesDeleted: [],
          distinctToolNames: ['read_file', 'replace_in_file'],
          durationMs: 150,
        },
      },
    });

    const html = renderToStaticMarkup(React.createElement(AgentActivity));

    expect(html).toContain('EDIT SAFE JAIL');
    expect(html).toContain('1 mutation applied');
    expect(html).toContain('1 applied');
    expect(html).not.toContain('0 mutations allowed');
  });

  // Test 29: Edit Agent session with 0 mutations shows 0 applied (never 0 mutations allowed)
  it('29. Edit Agent session with 0 mutations shows 0 applied and never 0 mutations allowed', () => {
    mockUseAppStore.mockReturnValue({
      ...baseStoreState,
      isEditing: false,
      agentActivities: [
        {
          id: '1',
          runId: 'edit-1',
          runKind: 'edit',
          label: 'Inspected src/test.ts',
          time: '12:00:01',
          status: 'done',
          toolName: 'read_file',
        },
      ],
      editAgentState: {
        status: 'completed',
        summary: {
          totalToolCalls: 1,
          successfulToolCalls: 1,
          failedToolCalls: 0,
          blockedToolCalls: 0,
          filesModified: [],
          filesCreated: [],
          filesDeleted: [],
          distinctToolNames: ['read_file'],
          durationMs: 90,
        },
      },
    });

    const html = renderToStaticMarkup(React.createElement(AgentActivity));

    expect(html).toContain('EDIT SAFE JAIL');
    expect(html).toContain('0 mutations applied');
    expect(html).toContain('0 applied');
    expect(html).not.toContain('0 mutations allowed');
  });

  // Test 30: completed Edit Agent session remains EDIT SAFE JAIL (does not revert to READ-ONLY SAFE JAIL when idle)
  it('30. completed Edit Agent session remains EDIT SAFE JAIL when idle', () => {
    mockUseAppStore.mockReturnValue({
      ...baseStoreState,
      isEditing: false,
      isPlanning: false,
      agentActivities: [
        {
          id: '1',
          runId: 'edit-completed-run',
          runKind: 'edit',
          label: 'Edit session completed',
          time: '12:00:05',
          status: 'done',
        },
      ],
      editAgentState: {
        status: 'completed',
      },
    });

    const html = renderToStaticMarkup(React.createElement(AgentActivity));

    expect(html).toContain('EDIT SAFE JAIL');
    expect(html).toContain('Edit Run');
    expect(html).not.toContain('READ-ONLY SAFE JAIL');
  });

  // Test 31: switching to a Plan session returns card to READ-ONLY SAFE JAIL
  it('31. switching to a Plan session returns card to READ-ONLY SAFE JAIL', () => {
    mockUseAppStore.mockReturnValue({
      ...baseStoreState,
      isPlanning: true,
      isEditing: false,
      agentActivities: [
        {
          id: '1',
          runId: 'plan-new-run',
          runKind: 'plan',
          label: 'Inspecting project overview...',
          time: '12:05:00',
          status: 'running',
          toolName: 'get_project_overview',
        },
      ],
    });

    const html = renderToStaticMarkup(React.createElement(AgentActivity));

    expect(html).toContain('READ-ONLY SAFE JAIL');
    expect(html).toContain('Plan Running');
    expect(html).toContain('0 mutations allowed');
    expect(html).not.toContain('EDIT SAFE JAIL');
  });

  // Test 32: switching projects returns card to project active session state or default READ-ONLY SAFE JAIL
  it('32. switching projects with empty activity returns default empty state ready for plan or edit', () => {
    mockUseAppStore.mockReturnValue({
      ...baseStoreState,
      isPlanning: false,
      isEditing: false,
      agentActivities: [],
      editAgentState: undefined,
    });

    const html = renderToStaticMarkup(React.createElement(AgentActivity));

    expect(html).toContain('Agent ready');
    expect(html).toContain('Activity will appear here when a plan or task runs.');
    expect(html).not.toContain('EDIT SAFE JAIL');
    expect(html).not.toContain('READ-ONLY SAFE JAIL');
  });
});
