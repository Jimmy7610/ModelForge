import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EditAgent } from '../src/main/agent/edit-agent';
import { InferenceService } from '../src/main/inference/service';
import { ModelRegistry } from '../src/main/models/registry';
import { CheckpointService } from '../src/main/edit/checkpoint-service';
import { Project, AgentActivityItem } from '../src/shared/types';

describe('Edit Tool Argument Validation & Recovery (v0.5.4 - Tests 21 to 25)', () => {
  let tempDir: string;
  let tempWorkspace: string;
  let tempStorageDir: string;
  let registry: ModelRegistry;
  let inferenceService: InferenceService;
  let checkpointService: CheckpointService;
  let editAgent: EditAgent;
  let project: Project;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-edit-test-'));
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-edit-ws-'));
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-edit-storage-'));

    fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'test.ts'),
      'export function hello(): string { return "hello"; }\n',
      'utf8'
    );

    project = {
      id: 'test-validation-proj',
      name: 'validation-test',
      rootPath: tempWorkspace,
      canonicalRootPath: tempWorkspace,
      path: tempWorkspace,
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      isGitRepository: false,
    };

    registry = new ModelRegistry(tempDir);
    inferenceService = new InferenceService(registry);
    checkpointService = new CheckpointService(tempStorageDir);
    editAgent = new EditAgent(inferenceService, checkpointService);

    vi.spyOn(inferenceService, 'getModelState').mockReturnValue('loaded');
    vi.spyOn(inferenceService, 'getToolCapability').mockResolvedValue({
      status: 'supported',
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // Test 21: replace_in_file schema enforces oldText: { type: 'string', minLength: 1 }
  it('21. replace_in_file schema enforces oldText minLength 1 and required properties', async () => {
    let capturedFunctions: Record<string, any> = {};

    vi.spyOn(inferenceService, 'executeAgentPrompt').mockImplementation(async (options) => {
      capturedFunctions = options.functions as Record<string, any>;
      return 'Summary of changes';
    });

    await editAgent.startEditing(project, 'Add test function');

    const replaceTool = capturedFunctions.replace_in_file;
    expect(replaceTool).toBeDefined();
    expect(replaceTool.params).toBeDefined();
    expect(replaceTool.params.type).toBe('object');
    expect(replaceTool.params.properties.oldText).toEqual({
      type: 'string',
      minLength: 1,
      description: 'Exact non-empty existing text block to replace',
    });
    expect(replaceTool.params.required).toContain('oldText');
    expect(replaceTool.params.required).toContain('path');
    expect(replaceTool.params.required).toContain('newText');
  });

  // Test 22: empty string oldText: "" is rejected immediately by the runtime handler before any filesystem access
  it('22. empty string oldText is rejected immediately by runtime handler without modifying filesystem', async () => {
    const filePath = path.join(tempWorkspace, 'src', 'test.ts');
    const initialContent = fs.readFileSync(filePath, 'utf8');

    let capturedFunctions: Record<string, any> = {};
    let handlerResult: any;

    vi.spyOn(inferenceService, 'executeAgentPrompt').mockImplementation(async (options) => {
      capturedFunctions = options.functions as Record<string, any>;
      const tool = capturedFunctions.replace_in_file;
      handlerResult = await tool.handler({
        path: 'src/test.ts',
        oldText: '',
        newText: 'tampered',
      });
      return 'Summary';
    });

    await editAgent.startEditing(project, 'Edit with empty oldText');

    const parsed = JSON.parse(handlerResult);
    expect(parsed.blocked).toBe(true);
    expect(parsed.error).toContain('oldText must be a non-empty string');

    // Filesystem unchanged
    expect(fs.readFileSync(filePath, 'utf8')).toBe(initialContent);
  });

  // Test 23: invalid oldText increments blockedToolCalls, leaves mutations unchanged, and records a neutral blocked tool call
  it('23. invalid oldText increments blockedToolCalls and leaves mutations unchanged', async () => {
    const activities: AgentActivityItem[] = [];

    vi.spyOn(inferenceService, 'executeAgentPrompt').mockImplementation(async (options) => {
      const funcs = options.functions as Record<string, any>;
      await funcs.replace_in_file.handler({
        path: 'src/test.ts',
        oldText: '',
        newText: 'tampered',
      });
      return 'Summary';
    });

    await editAgent.startEditing(project, 'Test blocked tool call', {
      onActivity: (act) => activities.push({ ...act }),
    });

    const state = editAgent.getState();
    expect(state.summary?.blockedToolCalls).toBe(1);
    expect(state.summary?.filesModified).toEqual([]);
    expect(state.summary?.filesCreated).toEqual([]);
    expect(state.summary?.filesDeleted).toEqual([]);

    const blockedItem = activities.find((a) => a.status === 'blocked');
    expect(blockedItem).toBeDefined();
    expect(blockedItem?.toolName).toBe('replace_in_file');
  });

  // Test 24: neutral blocked status displays "Invalid edit request — model corrected automatically" and never mentions scary failures
  it('24. neutral blocked status displays friendly label and never mentions scary failures', async () => {
    const activities: AgentActivityItem[] = [];

    vi.spyOn(inferenceService, 'executeAgentPrompt').mockImplementation(async (options) => {
      const funcs = options.functions as Record<string, any>;
      await funcs.replace_in_file.handler({
        path: 'src/test.ts',
        oldText: undefined,
        newText: 'some text',
      });
      return 'Done';
    });

    await editAgent.startEditing(project, 'Neutral blocked status', {
      onActivity: (act) => activities.push({ ...act }),
    });

    const blockedItem = activities.find((a) => a.status === 'blocked');
    expect(blockedItem).toBeDefined();
    expect(blockedItem?.label).toBe('Invalid edit request — model corrected automatically');
    expect(blockedItem?.label).not.toContain('fatal');
    expect(blockedItem?.label).not.toContain('exception');
    expect(blockedItem?.label).not.toContain('crash');
    expect(blockedItem?.detail).toContain('oldText must contain the exact non-empty existing text');
  });

  // Test 25: model can retry immediately with valid arguments in the same session without session abortion
  it('25. model can retry immediately with valid arguments in the same session without session abortion', async () => {
    const filePath = path.join(tempWorkspace, 'src', 'test.ts');
    let retryResult: any;

    vi.spyOn(inferenceService, 'executeAgentPrompt').mockImplementation(async (options) => {
      const funcs = options.functions as Record<string, any>;
      // Read file first (required by session contract)
      await funcs.read_file.handler({ path: 'src/test.ts' });

      // First attempt: invalid empty oldText
      const firstAttempt = await funcs.replace_in_file.handler({
        path: 'src/test.ts',
        oldText: '',
        newText: 'return "replacement";',
      });
      const firstParsed = JSON.parse(firstAttempt);
      expect(firstParsed.blocked).toBe(true);

      // Second attempt: model retries with valid arguments in same session
      retryResult = await funcs.replace_in_file.handler({
        path: 'src/test.ts',
        oldText: 'return "hello";',
        newText: 'return "world";',
      });

      return 'Completed editing successfully';
    });

    const result = await editAgent.startEditing(project, 'Retry edit session');

    expect(result).toContain('Completed editing successfully');
    const retryParsed = JSON.parse(retryResult);
    expect(retryParsed.success).toBe(true);

    const onDisk = fs.readFileSync(filePath, 'utf8');
    expect(onDisk).toContain('return "world";');

    const state = editAgent.getState();
    expect(state.summary?.blockedToolCalls).toBe(1);
    expect(state.summary?.successfulToolCalls).toBeGreaterThanOrEqual(2); // read_file + replace_in_file
    expect(state.summary?.filesModified).toContain('src/test.ts');
  });
});
