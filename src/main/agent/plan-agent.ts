import crypto from 'node:crypto';
import { AgentActivityItem, AgentPlanState, Project } from '../../shared/types';
import { WorkspaceGuard } from '../workspace/guard';
import { WorkspaceTools } from '../workspace/tools';
import { InferenceService } from '../inference/service';
import { PlanAgentCallbacks } from './types';
import { AgentBudget } from './budget';

export class PlanAgent {
  private inferenceService: InferenceService;
  private status: AgentPlanState['status'] = 'idle';
  private activeProjectId: string | null = null;
  private activeRunId: string | null = null;
  private activities: AgentActivityItem[] = [];
  private currentActivity?: string;
  private planContent = '';
  private error?: string;
  private successfulToolCallsCount = 0;
  private abortController: AbortController | null = null;

  constructor(inferenceService: InferenceService) {
    this.inferenceService = inferenceService;
  }

  public getState(): AgentPlanState {
    return {
      runId: this.activeRunId,
      status: this.status,
      activeProjectId: this.activeProjectId,
      activities: [...this.activities],
      currentActivity: this.currentActivity,
      planContent: this.planContent,
      error: this.error,
      successfulToolCallsCount: this.successfulToolCallsCount,
    };
  }

  public async stopPlanning(): Promise<boolean> {
    if (this.status !== 'running' || !this.abortController) {
      return false;
    }

    try {
      this.abortController.abort();
      await this.inferenceService.stopGeneration();
      this.status = 'idle';
      this.currentActivity = 'Planning stopped by user.';
      return true;
    } catch {
      return false;
    }
  }

  public clearActivities(): void {
    this.activities = [];
    this.planContent = '';
    this.error = undefined;
    this.currentActivity = undefined;
    this.successfulToolCallsCount = 0;
    this.activeRunId = null;
  }

  public async startPlanning(
    project: Project,
    prompt: string,
    callbacks?: PlanAgentCallbacks,
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
      throw new Error('Plan Agent is already running a task.');
    }

    if (this.inferenceService.getModelState() !== 'loaded') {
      throw new Error('No model loaded. Please load a local GGUF model in the Models library first.');
    }

    const currentRunId = runId || crypto.randomUUID();
    this.activeRunId = currentRunId;
    this.status = 'running';
    this.activeProjectId = project.id;
    this.activities = [];
    this.planContent = '';
    this.error = undefined;
    this.successfulToolCallsCount = 0;
    this.abortController = new AbortController();

    const budget = new AgentBudget();

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
      const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
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
      // 1. Initialize Workspace Guard & Tools (Hard Workspace Jail)
      const guard = new WorkspaceGuard(projectPath);
      const tools = new WorkspaceTools(guard);

      // 2. Allowed lightweight deterministic startup context (Metadata only, NO pre-scripted reads)
      const overview = await tools.getProjectOverview();

      if (this.abortController.signal.aborted) {
        throw new Error('Planning cancelled');
      }

      // 3. Define Model-Driven Chat Session Functions
      let dynamicFunctions: Record<string, unknown> | undefined;
      try {
        const nlc = await import('node-llama-cpp');
        const defineFn = nlc.defineChatSessionFunction || (nlc as any).default?.defineChatSessionFunction;

        const buildFunctions = (fnWrapper: Function) => ({
          get_project_overview: fnWrapper({
            description: 'Inspect project high-level overview, languages, package manager, and top-level directory names.',
            params: {
              type: 'object',
              properties: {},
            },
            handler: async () => {
              const budgetCheck = budget.checkBudget();
              if (!budgetCheck.allowed) {
                const act = recordActivity('Inspected project overview', 'get_project_overview');
                act.blocked(budgetCheck.reason || 'Budget exceeded');
                return JSON.stringify({ error: budgetCheck.reason, blocked: true, budgetExceeded: true });
              }

              const act = recordActivity('Inspected project overview', 'get_project_overview');
              try {
                if (this.abortController?.signal.aborted) throw new Error('Planning cancelled');
                const res = await tools.getProjectOverview();
                const bounded = budget.boundToolOutput(JSON.stringify(res, null, 2));
                budget.recordToolCall(bounded.content.length);
                this.successfulToolCallsCount++;
                act.done(`${res.name} (${res.languages.join(', ') || 'General'})`, 'Inspected project overview');
                return bounded.content;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                act.fail(msg, 'Inspected project overview');
                return JSON.stringify({ error: msg });
              }
            },
          }),

          list_directory: fnWrapper({
            description: 'List entries (files and directories) within a workspace directory relative to the project root. For root, pass "" or ".".',
            params: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Folder path relative to project root' },
                recursive: { type: 'boolean', description: 'Whether to list subdirectories (max depth 2)' },
              },
            },
            handler: async (args: { path?: string; recursive?: boolean }) => {
              const targetPath = args?.path || '';
              const displayTarget = targetPath.trim() === '' || targetPath === '.' ? 'project root' : targetPath;
              const displayLabel = `Listed ${displayTarget}`;

              const budgetCheck = budget.checkBudget();
              if (!budgetCheck.allowed) {
                const act = recordActivity(displayLabel, 'list_directory', args);
                act.blocked(budgetCheck.reason || 'Budget exceeded');
                return JSON.stringify({ error: budgetCheck.reason, blocked: true, budgetExceeded: true });
              }

              const act = recordActivity(displayLabel, 'list_directory', args);
              try {
                if (this.abortController?.signal.aborted) throw new Error('Planning cancelled');
                const res = await tools.listDirectory({
                  path: targetPath,
                  recursive: args?.recursive ?? false,
                  maxDepth: 2,
                });
                const summary = `${res.entries.length} items`;
                const bounded = budget.boundToolOutput(JSON.stringify(res.entries.map(e => ({
                  name: e.name,
                  path: e.relativePath,
                  type: e.type === 'directory' ? 'dir' : 'file',
                  size: e.sizeBytes,
                  ignored: e.isIgnored,
                })), null, 2));
                budget.recordToolCall(bounded.content.length);
                this.successfulToolCallsCount++;
                act.done(summary, displayLabel);
                return bounded.content;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isBlocked = msg.includes('jail') || msg.includes('denied') || msg.includes('sensitive');
                if (isBlocked) {
                  act.blocked(msg, displayLabel);
                } else {
                  act.fail(msg, displayLabel);
                }
                return JSON.stringify({ error: msg, blocked: isBlocked });
              }
            },
          }),

          read_file: fnWrapper({
            description: 'Read line-numbered text content of a file within the active workspace. Cannot read binary or sensitive files.',
            params: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'File path relative to the project root' },
                startLine: { type: 'number', description: '1-indexed start line' },
                endLine: { type: 'number', description: '1-indexed end line' },
              },
              required: ['path'],
            },
            handler: async (args: { path: string; startLine?: number; endLine?: number }) => {
              const displayLabel = `Read ${args.path}`;

              const budgetCheck = budget.checkBudget();
              if (!budgetCheck.allowed) {
                const act = recordActivity(displayLabel, 'read_file', args);
                act.blocked(budgetCheck.reason || 'Budget exceeded');
                return JSON.stringify({ error: budgetCheck.reason, blocked: true, budgetExceeded: true });
              }

              const act = recordActivity(displayLabel, 'read_file', args);
              try {
                if (this.abortController?.signal.aborted) throw new Error('Planning cancelled');
                const res = await tools.readFile(args);
                if (res.isBinary) {
                  act.blocked('Binary file cannot be displayed', displayLabel);
                  return JSON.stringify({ error: 'Binary file cannot be displayed in text viewer', isBinary: true });
                }

                const bounded = budget.boundToolOutput(res.content);
                budget.recordToolCall(bounded.content.length);
                this.successfulToolCallsCount++;
                act.done(`${res.totalLines} lines`, displayLabel);
                return bounded.content;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isBlocked = msg.includes('jail') || msg.includes('denied') || msg.includes('sensitive');
                if (isBlocked) {
                  act.blocked(msg, displayLabel);
                } else {
                  act.fail(msg, displayLabel);
                }
                return JSON.stringify({ error: msg, blocked: isBlocked });
              }
            },
          }),

          search_text: fnWrapper({
            description: 'Search for text or symbol occurrences across project text files. Returns matching files, line numbers, and snippets.',
            params: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search term or symbol' },
                path: { type: 'string', description: 'Subdirectory path to restrict search, or empty for all' },
              },
              required: ['query'],
            },
            handler: async (args: { query: string; path?: string }) => {
              let searchTerm = args.query;
              if (searchTerm.endsWith('ies') && searchTerm.length > 5) {
                searchTerm = searchTerm.slice(0, -3) + 'y';
              } else if (searchTerm.endsWith('s') && !searchTerm.endsWith('ss') && searchTerm.length > 4) {
                searchTerm = searchTerm.slice(0, -1);
              }
              const displayLabel = `Searched "${searchTerm}"`;

              const budgetCheck = budget.checkBudget();
              if (!budgetCheck.allowed) {
                const act = recordActivity(displayLabel, 'search_text', args);
                act.blocked(budgetCheck.reason || 'Budget exceeded');
                return JSON.stringify({ error: budgetCheck.reason, blocked: true, budgetExceeded: true });
              }

              const act = recordActivity(displayLabel, 'search_text', args);
              try {
                if (this.abortController?.signal.aborted) throw new Error('Planning cancelled');
                const res = await tools.searchText({
                  query: searchTerm,
                  path: args.path,
                  maxMatches: budget.limits.maxSearchResultsPerCall,
                });
                const bounded = budget.boundToolOutput(JSON.stringify({
                  totalMatches: res.totalMatches,
                  matches: res.matches,
                }, null, 2));
                budget.recordToolCall(bounded.content.length);
                this.successfulToolCallsCount++;
                act.done(`${res.totalMatches} matches`, displayLabel);
                return bounded.content;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const isBlocked = msg.includes('jail') || msg.includes('denied') || msg.includes('sensitive');
                if (isBlocked) {
                  act.blocked(msg, displayLabel);
                } else {
                  act.fail(msg, displayLabel);
                }
                return JSON.stringify({ error: msg, blocked: isBlocked });
              }
            },
          }),
        });

        if (typeof defineFn === 'function') {
          dynamicFunctions = buildFunctions(defineFn);
        } else {
          dynamicFunctions = buildFunctions((def: unknown) => def);
        }
      } catch {
        // Fallback for mocked/isolated test environments
      }

      // 4. Honest Model Prompting (Explicitly instructing tool usage before claims)
      const systemInstruction = `You are Model Forge's Plan Agent, a project intelligence system running strictly locally on the user's workstation.
You are operating in Safe Read-Only Mode.

You have read-only tools available:
- list_directory: explore directory trees in the workspace
- read_file: inspect source code and manifests
- search_text: search for symbols, keywords, or method names
- get_project_overview: review project architecture and tech stack

INSTRUCTIONS:
You have read-only tools available. Inspect relevant files before making project-specific claims.
Do not assume file contents or structure without inspecting them.
After inspecting the project with your tools, synthesize a comprehensive architectural and step-by-step implementation plan.

PROJECT CONTEXT:
- Project Name: ${overview.name}
- Root Path: ${overview.canonicalRootPath}
- Git Repository: ${overview.isGitRepository ? 'Yes' : 'No'}
- Package Manager: ${overview.packageManager || 'None detected'}
- Languages: ${overview.languages.join(', ') || 'None detected'}
- Frameworks & Libraries: ${overview.frameworkHints.join(', ') || 'Standard'}
- Top Directories: ${overview.topLevelDirectories.join(', ')}
- Key Manifest Files: ${overview.keyFiles.join(', ')}`;

      const synthesisPrompt = `${systemInstruction}\n\nUSER REQUEST:\n${prompt}\n\nPlease inspect the workspace using your tools, and then provide the implementation plan:`;

      this.currentActivity = 'Model analyzing project...';
      notifyState();

      const actPlan = recordActivity('Created architecture plan');

      const generatedPlan = await this.inferenceService.executeAgentPrompt({
        prompt: synthesisPrompt,
        systemPrompt: systemInstruction,
        functions: dynamicFunctions,
        signal: this.abortController.signal,
        onChunk: (chunkText) => {
          if (this.activeRunId === currentRunId) {
            this.planContent += chunkText;
            callbacks?.onChunk?.({
              requestId: currentRunId,
              runId: currentRunId,
              text: chunkText,
              isDone: false,
            });
          }
        },
      });

      this.planContent = generatedPlan || this.planContent;

      // Tool use verification: warn user if model failed/refused to call tools
      if (this.successfulToolCallsCount === 0) {
        const warningNotice = '\n\n> ⚠️ This model did not successfully inspect the project with tools. Try another instruction-tuned or coding model.';
        this.planContent += warningNotice;
        this.currentActivity = 'This model did not successfully inspect the project with tools.';
      } else {
        this.currentActivity = `Plan completed successfully (${this.successfulToolCallsCount} tool calls executed).`;
      }

      actPlan.done();

      this.status = 'completed';
      notifyState();

      callbacks?.onChunk?.({
        requestId: currentRunId,
        runId: currentRunId,
        text: '',
        isDone: true,
      });

      return this.planContent;
    } catch (err) {
      const isAbort = this.abortController?.signal.aborted;
      const msg = err instanceof Error ? err.message : String(err);
      this.status = isAbort ? 'idle' : 'error';
      this.error = isAbort ? undefined : msg;
      this.currentActivity = isAbort ? 'Planning cancelled.' : `Error: ${msg}`;
      notifyState();

      if (!isAbort) {
        callbacks?.onChunk?.({
          requestId: currentRunId,
          runId: currentRunId,
          text: `\n\n[Planning Error: ${msg}]`,
          isDone: true,
          error: msg,
        });
      }

      throw err;
    } finally {
      if (this.activeRunId === currentRunId) {
        this.abortController = null;
      }
    }
  }
}
