import crypto from 'node:crypto';
import {
  AgentActivityItem,
  EditAgentState,
  EditExecutionSummary,
  Project,
} from '../../shared/types';
import { WorkspaceGuard } from '../workspace/guard';
import { InferenceService } from '../inference/service';
import { EditAgentCallbacks } from './types';
import { CheckpointService } from '../edit/checkpoint-service';
import { EditSession } from '../edit/edit-session';
import { DEFAULT_MUTATION_LIMITS } from '../edit/types';

export class EditAgent {
  private inferenceService: InferenceService;
  private checkpointService: CheckpointService;
  private status: EditAgentState['status'] = 'idle';
  private activeProjectId: string | null = null;
  private activeRunId: string | null = null;
  private activeCheckpointId: string | null = null;
  private activities: AgentActivityItem[] = [];
  private currentActivity?: string;
  private resultMessage = '';
  private error?: string;
  private summary?: EditExecutionSummary;
  private abortController: AbortController | null = null;

  public static readonly MAX_TOOL_CALLS = 40;
  public static readonly MAX_FILE_WRITES = 20;
  public static readonly MAX_TIMEOUT_MS = 10 * 60 * 1000;

  public readonly MAX_TOOL_CALLS = EditAgent.MAX_TOOL_CALLS;
  public readonly MAX_FILE_WRITES = EditAgent.MAX_FILE_WRITES;
  public readonly MAX_TIMEOUT_MS = EditAgent.MAX_TIMEOUT_MS;

  constructor(inferenceService: InferenceService, checkpointService?: CheckpointService) {
    this.inferenceService = inferenceService;
    this.checkpointService = checkpointService || new CheckpointService();
  }

  public getCheckpointService(): CheckpointService {
    return this.checkpointService;
  }

  public getState(): EditAgentState {
    return {
      runId: this.activeRunId,
      status: this.status,
      activeProjectId: this.activeProjectId,
      checkpointId: this.activeCheckpointId,
      activities: [...this.activities],
      currentActivity: this.currentActivity,
      resultMessage: this.resultMessage,
      error: this.error,
      summary: this.summary ? { ...this.summary } : undefined,
    };
  }

  public async stopEditing(): Promise<boolean> {
    if (this.status !== 'running' || !this.abortController) {
      return false;
    }

    try {
      this.abortController.abort();
      await this.inferenceService.stopGeneration();
      this.status = 'stopped';
      this.currentActivity = 'Edit session stopped by user. Partial changes preserved for Diff review.';
      return true;
    } catch {
      return false;
    }
  }

  public clearActivities(): void {
    this.activities = [];
    this.resultMessage = '';
    this.error = undefined;
    this.currentActivity = undefined;
    this.summary = undefined;
    this.activeRunId = null;
    this.activeCheckpointId = null;
  }

  public async startEditing(
    project: Project,
    prompt: string,
    callbacks?: EditAgentCallbacks,
    runId?: string
  ): Promise<string> {
    const projectPath = project.rootPath || project.path;
    if (!project || !projectPath) {
      throw new Error('Active project must be specified');
    }

    if (!prompt || !prompt.trim()) {
      throw new Error('Prompt cannot be empty');
    }

    if (this.status === 'running') {
      throw new Error('Edit Agent is already running a task.');
    }

    if (this.inferenceService.getModelState() !== 'loaded') {
      throw new Error('No model loaded. Please load a local GGUF model in the Models library first.');
    }

    // Gating: check model capability before editing
    const capability = await this.inferenceService.getToolCapability();
    if (capability.status === 'unsupported') {
      throw new Error(
        `This model could not use Model Forge project tools reliably (${capability.reason || 'unsupported'}). Please select a tool-compatible model.`
      );
    }

    const currentRunId = runId || crypto.randomUUID();
    this.activeRunId = currentRunId;
    this.status = 'running';
    this.activeProjectId = project.id;
    this.activities = [];
    this.resultMessage = '';
    this.error = undefined;
    this.abortController = new AbortController();

    const startTime = Date.now();
    let totalToolCalls = 0;
    let successfulToolCalls = 0;
    let failedToolCalls = 0;
    let blockedToolCalls = 0;
    const distinctToolNames = new Set<string>();
    const filesModified = new Set<string>();
    const filesCreated = new Set<string>();
    const filesDeleted = new Set<string>();

    const notifyState = () => {
      if (callbacks?.onStateChange) {
        callbacks.onStateChange(this.getState());
      }
    };

    notifyState();

    const recordActivity = (
      label: string,
      toolName?: string,
      toolArgs?: Record<string, unknown>
    ): {
      id: string;
      done: (detail?: string, finalLabel?: string) => void;
      blocked: (err: string, finalLabel?: string) => void;
      fail: (err: string, finalLabel?: string) => void;
    } => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const item: AgentActivityItem = {
        id: crypto.randomUUID(),
        runId: currentRunId,
        label,
        time: timeStr,
        status: 'running',
        toolName,
        toolArgs,
      };

      this.activities.push(item);
      this.currentActivity = label;
      notifyState();
      callbacks?.onActivity?.(item);

      return {
        id: item.id,
        done: (detail?: string, finalLabel?: string) => {
          item.status = 'done';
          if (finalLabel) item.label = finalLabel;
          if (detail) item.detail = detail;
          notifyState();
          callbacks?.onActivity?.(item);
        },
        blocked: (err: string, finalLabel?: string) => {
          item.status = 'blocked';
          if (finalLabel) item.label = finalLabel;
          item.detail = err;
          notifyState();
          callbacks?.onActivity?.(item);
        },
        fail: (err: string, finalLabel?: string) => {
          item.status = 'error';
          if (finalLabel) item.label = finalLabel;
          item.detail = err;
          notifyState();
          callbacks?.onActivity?.(item);
        },
      };
    };

    try {
      // 1. Arm automatic checkpoint
      const manifest = this.checkpointService.armAutomaticCheckpoint(project.id, projectPath);
      this.activeCheckpointId = manifest.id;

      // 2. Initialize Workspace Guard & Edit Session
      const guard = new WorkspaceGuard(projectPath);
      const session = new EditSession({
        guard,
        checkpointService: this.checkpointService,
        manifest,
        limits: DEFAULT_MUTATION_LIMITS,
      });

      // 3. Define Tools (Inspection + 4 Safe Edit Tools, ZERO shell tools)
      let dynamicFunctions: Record<string, unknown> | undefined;
      try {
        const nlc = await import('node-llama-cpp');
        const defineFn = nlc.defineChatSessionFunction || (nlc as any).default?.defineChatSessionFunction;

        const buildFunctions = (fnWrapper: Function) => ({
          // --- READ TOOLS ---
          get_project_overview: fnWrapper({
            description: 'Inspect project overview, package manager, and top-level directory names.',
            params: { type: 'object', properties: {} },
            handler: async () => {
              totalToolCalls++;
              distinctToolNames.add('get_project_overview');
              const act = recordActivity('Inspecting project overview...', 'get_project_overview');
              try {
                if (this.abortController?.signal.aborted) throw new Error('Edit cancelled');
                const overview = await session.tools.getProjectOverview();
                successfulToolCalls++;
                act.done('Overview inspected', 'Inspected project overview');
                return JSON.stringify(overview);
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                failedToolCalls++;
                act.fail(msg, 'Failed to inspect overview');
                return JSON.stringify({ error: msg });
              }
            },
          }),

          list_directory: fnWrapper({
            description: 'List contents of a directory inside the active workspace.',
            params: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Relative directory path (e.g. "src" or ".")' },
                recursive: { type: 'boolean', description: 'Whether to list recursively' },
                maxDepth: { type: 'number', description: 'Maximum depth (default 2)' },
              },
            },
            handler: async (args: { path?: string; recursive?: boolean; maxDepth?: number }) => {
              totalToolCalls++;
              distinctToolNames.add('list_directory');
              const target = args?.path || '.';
              const displayLabel = `Listed ${target}`;
              const act = recordActivity(`Listing directory "${target}"...`, 'list_directory', args);
              try {
                if (this.abortController?.signal.aborted) throw new Error('Edit cancelled');
                const res = await session.tools.listDirectory({
                  path: target,
                  recursive: Boolean(args?.recursive),
                  maxDepth: args?.maxDepth ?? 2,
                });
                successfulToolCalls++;
                act.done(`${res.totalCount} entries`, displayLabel);
                return JSON.stringify({
                  totalCount: res.totalCount,
                  entries: res.entries.slice(0, 30).map((e) => ({
                    name: e.name,
                    relativePath: e.relativePath,
                    type: e.type,
                    sizeBytes: e.sizeBytes,
                  })),
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isBlocked = msg.includes('jail') || msg.includes('denied');
                if (isBlocked) {
                  blockedToolCalls++;
                  act.blocked(msg, displayLabel);
                } else {
                  failedToolCalls++;
                  act.fail(msg, displayLabel);
                }
                return JSON.stringify({ error: msg, blocked: isBlocked });
              }
            },
          }),

          read_file: fnWrapper({
            description: 'Read the contents of a text file inside the workspace. REQUIRED before modifying or deleting an existing file.',
            params: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Relative file path inside the project' },
                startLine: { type: 'number', description: 'Line number to start reading from' },
                endLine: { type: 'number', description: 'Line number to end reading at' },
              },
              required: ['path'],
            },
            handler: async (args: { path: string; startLine?: number; endLine?: number }) => {
              totalToolCalls++;
              distinctToolNames.add('read_file');
              const displayLabel = `Read ${args?.path}`;
              const act = recordActivity(`Reading "${args?.path}"...`, 'read_file', args);
              try {
                if (this.abortController?.signal.aborted) throw new Error('Edit cancelled');
                const res = await session.readFile(args);
                if (res.isBinary) {
                  blockedToolCalls++;
                  act.blocked('Binary file cannot be inspected', displayLabel);
                  return JSON.stringify({ error: 'Binary file cannot be modified', isBinary: true });
                }
                successfulToolCalls++;
                act.done(`${res.totalLines} lines`, displayLabel);
                return res.rawContent || res.content;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isBlocked = msg.includes('jail') || msg.includes('denied') || msg.includes('sensitive');
                if (isBlocked) {
                  blockedToolCalls++;
                  act.blocked(msg, displayLabel);
                } else {
                  failedToolCalls++;
                  act.fail(msg, displayLabel);
                }
                return JSON.stringify({ error: msg, blocked: isBlocked });
              }
            },
          }),

          search_text: fnWrapper({
            description: 'Search for text or symbol occurrences in workspace source files.',
            params: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search term or symbol' },
                path: { type: 'string', description: 'Subdirectory path to restrict search' },
              },
              required: ['query'],
            },
            handler: async (args: { query: string; path?: string }) => {
              totalToolCalls++;
              distinctToolNames.add('search_text');
              const displayLabel = `Searched "${args?.query}"`;
              const act = recordActivity(`Searching "${args?.query}"...`, 'search_text', args);
              try {
                if (this.abortController?.signal.aborted) throw new Error('Edit cancelled');
                const res = await session.tools.searchText({
                  query: args.query,
                  path: args?.path,
                  maxMatches: 20,
                });
                successfulToolCalls++;
                act.done(`${res.totalMatches} matches`, displayLabel);
                return JSON.stringify({
                  totalMatches: res.totalMatches,
                  matches: res.matches.slice(0, 15),
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isBlocked = msg.includes('jail') || msg.includes('denied');
                if (isBlocked) {
                  blockedToolCalls++;
                  act.blocked(msg, displayLabel);
                } else {
                  failedToolCalls++;
                  act.fail(msg, displayLabel);
                }
                return JSON.stringify({ error: msg, blocked: isBlocked });
              }
            },
          }),

          // --- EDIT TOOLS ---
          create_file: fnWrapper({
            description: 'Create a brand-new text file in the workspace. Will NOT overwrite existing files.',
            params: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Relative path for the new file' },
                content: { type: 'string', description: 'Full text content for the new file' },
              },
              required: ['path', 'content'],
            },
            handler: async (args: { path: string; content: string }) => {
              totalToolCalls++;
              distinctToolNames.add('create_file');
              const displayLabel = `Created ${args?.path}`;
              const act = recordActivity(`Creating file "${args?.path}"...`, 'create_file', { path: args?.path });
              try {
                if (this.abortController?.signal.aborted) throw new Error('Edit cancelled');
                const res = await session.createFile(args);
                successfulToolCalls++;
                filesCreated.add(res.relativePath);
                act.done(`Created (${res.bytesWritten} bytes)`, displayLabel);
                return JSON.stringify({
                  success: true,
                  message: `${res.message} File created successfully. If all requested changes and file creations are complete, summarize your changes and state that tests were not executed. Otherwise continue with your remaining edits or file creations.`,
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isBlocked =
                  msg.includes('jail') ||
                  msg.includes('forbidden') ||
                  msg.includes('exists') ||
                  msg.includes('denied') ||
                  msg.includes('sensitive');
                if (isBlocked) {
                  blockedToolCalls++;
                  act.blocked(msg, `Blocked creation of ${args?.path}`);
                } else {
                  failedToolCalls++;
                  act.fail(msg, `Failed to create ${args?.path}`);
                }
                return JSON.stringify({ error: msg, blocked: isBlocked });
              }
            },
          }),

          replace_in_file: fnWrapper({
            description: 'Surgically replace text in an existing file. The file MUST have been inspected with read_file first.',
            params: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Relative path of the existing file' },
                oldText: { type: 'string', description: 'Exact existing text block to replace' },
                newText: { type: 'string', description: 'Replacement text' },
                replaceAll: { type: 'boolean', description: 'Whether to replace all occurrences' },
              },
              required: ['path', 'oldText', 'newText'],
            },
            handler: async (args: { path: string; oldText: string; newText: string; replaceAll?: boolean }) => {
              totalToolCalls++;
              distinctToolNames.add('replace_in_file');
              const displayLabel = `Modified ${args?.path}`;
              const act = recordActivity(`Modifying "${args?.path}"...`, 'replace_in_file', { path: args?.path });

              if (totalToolCalls > 25) {
                act.fail('Tool budget reached', 'Tool budget reached');
                return JSON.stringify({ error: 'Tool budget reached. Stop calling tools now and output your final summary.' });
              }

              try {
                if (this.abortController?.signal.aborted) throw new Error('Edit cancelled');
                const res = await session.replaceInFile(args);
                successfulToolCalls++;
                filesModified.add(res.relativePath);
                act.done('Modified', displayLabel);
                return JSON.stringify({
                  success: true,
                  message: `${res.message} File edit successfully applied. If all requested changes and file creations are complete, summarize your changes and state that tests were not executed. Otherwise continue with your remaining edits or file creations.`,
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isBlocked =
                  msg.includes('Read the file before') ||
                  msg.includes('File changed after') ||
                  msg.includes('jail') ||
                  msg.includes('forbidden') ||
                  msg.includes('sensitive');
                if (isBlocked) {
                  blockedToolCalls++;
                  act.blocked(msg, `Blocked edit on ${args?.path}`);
                } else {
                  failedToolCalls++;
                  act.fail(msg, `Failed edit on ${args?.path}`);
                }
                return JSON.stringify({ error: msg, blocked: isBlocked });
              }
            },
          }),

          write_file: fnWrapper({
            description: 'Write complete text file content. If existing, the file MUST have been read with read_file first.',
            params: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Relative file path' },
                content: { type: 'string', description: 'Complete file text content' },
              },
              required: ['path', 'content'],
            },
            handler: async (args: { path: string; content: string }) => {
              totalToolCalls++;
              distinctToolNames.add('write_file');
              const displayLabel = `Wrote ${args?.path}`;
              const act = recordActivity(`Writing file "${args?.path}"...`, 'write_file', { path: args?.path });

              if (totalToolCalls > 25) {
                act.fail('Tool budget reached', 'Tool budget reached');
                return JSON.stringify({ error: 'Tool budget reached. Stop calling tools now and output your final summary.' });
              }

              try {
                if (this.abortController?.signal.aborted) throw new Error('Edit cancelled');
                const res = await session.writeFile(args);
                successfulToolCalls++;
                if (res.operation === 'create') {
                  filesCreated.add(res.relativePath);
                } else {
                  filesModified.add(res.relativePath);
                }
                act.done(`Written (${res.bytesWritten} bytes)`, displayLabel);
                return JSON.stringify({
                  success: true,
                  message: `${res.message} File successfully written. Your task is complete. Summarize your changes and explicitly state that tests were not executed.`,
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isBlocked =
                  msg.includes('Read the file before') ||
                  msg.includes('File changed after') ||
                  msg.includes('jail') ||
                  msg.includes('forbidden') ||
                  msg.includes('sensitive');
                if (isBlocked) {
                  blockedToolCalls++;
                  act.blocked(msg, `Blocked write to ${args?.path}`);
                } else {
                  failedToolCalls++;
                  act.fail(msg, `Failed write to ${args?.path}`);
                }
                return JSON.stringify({ error: msg, blocked: isBlocked });
              }
            },
          }),

          delete_file: fnWrapper({
            description: 'Delete a single text file in the workspace. The file MUST have been read with read_file first. Directory deletion is prohibited.',
            params: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Relative file path to delete' },
              },
              required: ['path'],
            },
            handler: async (args: { path: string }) => {
              totalToolCalls++;
              distinctToolNames.add('delete_file');
              const displayLabel = `Deleted ${args?.path}`;
              const act = recordActivity(`Deleting file "${args?.path}"...`, 'delete_file', args);
              try {
                if (this.abortController?.signal.aborted) throw new Error('Edit cancelled');
                const res = await session.deleteFile(args);
                successfulToolCalls++;
                filesDeleted.add(res.relativePath);
                act.done('Deleted', displayLabel);
                return JSON.stringify({ success: true, message: res.message });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isBlocked =
                  msg.includes('Read the file before') ||
                  msg.includes('directory') ||
                  msg.includes('jail') ||
                  msg.includes('forbidden');
                if (isBlocked) {
                  blockedToolCalls++;
                  act.blocked(msg, `Blocked deletion of ${args?.path}`);
                } else {
                  failedToolCalls++;
                  act.fail(msg, `Failed to delete ${args?.path}`);
                }
                return JSON.stringify({ error: msg, blocked: isBlocked });
              }
            },
          }),
        });

        if (typeof defineFn === 'function') {
          dynamicFunctions = buildFunctions(defineFn);
        }
      } catch (err) {
        console.warn('[EditAgent] node-llama-cpp function calling setup error:', err);
      }

      // 4. System Instruction for Edit Agent
      const systemInstruction = `You are Model Forge's Edit Agent.
You have read and edit tools strictly jailed to the active project workspace.
Workspace containment is strictly enforced: external paths, symlink escapes, parent traversals, sensitive credentials (.env, keys), and binary files are rejected.

WORKFLOW:
1. INSPECT BEFORE EDITING: Use list_directory, search_text, and read_file to inspect relevant files before modifying them.
2. READ BEFORE WRITE: You MUST call read_file on any existing file before calling replace_in_file, write_file, or delete_file.
3. PREFER SURGICAL CHANGES: Use replace_in_file with exact matching text to modify existing files. Use write_file only for complete rewrites. Use create_file for new files.
4. HONESTY: Terminal execution and test runners are completely disabled in Edit mode. When your implementation is complete, summarize modified files and explicitly state that tests were NOT executed. Do not claim tests were run.`;

      const userPromptWithInstruction = `${prompt}

INSTRUCTION:
First inspect the necessary files with read_file or list_directory.
Then apply all requested code changes using replace_in_file, create_file, write_file, or delete_file.
Be sure to perform every requested modification and file creation.
Finally summarize the files modified and confirm completion.`;

      this.currentActivity = 'Model executing edits...';
      notifyState();

      let followUpCount = 0;
      const maxFollowUps = 2;
      let summaryDone = false;

      const followUpPrompt = async (): Promise<string | null> => {
        if (this.abortController?.signal.aborted) return null;
        if (followUpCount >= maxFollowUps) return null;
        followUpCount++;

        const totalMutations = filesModified.size + filesCreated.size + filesDeleted.size;
        if (totalMutations === 0) {
          return 'Now proceed to make the requested file changes using replace_in_file, create_file, or write_file.';
        }
        if (!summaryDone && this.resultMessage.trim().length < 100) {
          summaryDone = true;
          return 'Please provide a clear final summary of the files you modified, created, or deleted, and state that tests were not executed.';
        }
        return null;
      };

      const generatedSummary = await this.inferenceService.executeAgentPrompt({
        prompt: userPromptWithInstruction,
        systemPrompt: systemInstruction,
        functions: dynamicFunctions,
        signal: this.abortController.signal,
        followUpPrompt,
        onChunk: (chunkText) => {
          if (this.activeRunId === currentRunId) {
            this.resultMessage += chunkText;
            callbacks?.onChunk?.({
              requestId: currentRunId,
              runId: currentRunId,
              text: chunkText,
              isDone: false,
            });
          }
        },
      });

      this.resultMessage = generatedSummary || this.resultMessage;

      const durationMs = Date.now() - startTime;
      const modifiedList = Array.from(filesModified);
      const createdList = Array.from(filesCreated);
      const deletedList = Array.from(filesDeleted);
      const totalTouched = modifiedList.length + createdList.length + deletedList.length;

      this.summary = {
        totalToolCalls,
        successfulToolCalls,
        failedToolCalls,
        blockedToolCalls,
        filesModified: modifiedList,
        filesCreated: createdList,
        filesDeleted: deletedList,
        distinctToolNames: Array.from(distinctToolNames),
        durationMs,
      };

      // Construct honest standardized result header if files were modified
      let finalChatOutput = '';
      if (totalTouched > 0) {
        finalChatOutput = `### EDIT COMPLETE\n\n**${totalTouched} file(s) changed:**\n`;
        for (const f of createdList) finalChatOutput += `- Created \`${f}\`\n`;
        for (const f of modifiedList) finalChatOutput += `- Modified \`${f}\`\n`;
        for (const f of deletedList) finalChatOutput += `- Deleted \`${f}\`\n`;
        finalChatOutput += `\n**Tests**: Not run — terminal access is disabled in Edit mode.\n\n`;
      }

      finalChatOutput += this.resultMessage.trim();
      this.resultMessage = finalChatOutput;

      this.status = 'completed';
      this.currentActivity = `Edit completed: ${totalTouched} file(s) changed (${successfulToolCalls} tool calls).`;

      const actSummary = recordActivity('Edit session completed');
      actSummary.done(
        `${totalTouched} file(s) changed, ${successfulToolCalls} tool call(s)`,
        'Edit session completed'
      );

      notifyState();

      callbacks?.onChunk?.({
        requestId: currentRunId,
        runId: currentRunId,
        text: '',
        isDone: true,
      });

      return this.resultMessage;
    } catch (err) {
      const isAbort = this.abortController?.signal.aborted;
      const msg = err instanceof Error ? err.message : String(err);
      this.status = isAbort ? 'stopped' : 'error';
      this.error = isAbort ? undefined : msg;
      this.currentActivity = isAbort ? 'Edit session stopped by user.' : `Edit failed: ${msg}`;
      notifyState();
      throw err;
    }
  }
}
