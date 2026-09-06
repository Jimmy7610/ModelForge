import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AgentActivityItem, AgentPlanState, Project } from '../../shared/types';
import { WorkspaceGuard } from '../workspace/guard';
import { WorkspaceTools } from '../workspace/tools';
import { InferenceService } from '../inference/service';
import { PlanAgentCallbacks } from './types';

export class PlanAgent {
  private inferenceService: InferenceService;
  private status: AgentPlanState['status'] = 'idle';
  private activeProjectId: string | null = null;
  private activities: AgentActivityItem[] = [];
  private currentActivity?: string;
  private planContent = '';
  private error?: string;
  private abortController: AbortController | null = null;
  private activeSessionId: string | null = null;

  constructor(inferenceService: InferenceService) {
    this.inferenceService = inferenceService;
  }

  public getState(): AgentPlanState {
    return {
      status: this.status,
      activeProjectId: this.activeProjectId,
      activities: [...this.activities],
      currentActivity: this.currentActivity,
      planContent: this.planContent,
      error: this.error,
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
  }

  public async startPlanning(
    project: Project,
    prompt: string,
    callbacks?: PlanAgentCallbacks
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

    const sessionId = crypto.randomUUID();
    this.activeSessionId = sessionId;
    this.status = 'running';
    this.activeProjectId = project.id;
    this.activities = [];
    this.planContent = '';
    this.error = undefined;
    this.abortController = new AbortController();

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
    ): { id: string; done: (detail?: string) => void; fail: (err: string) => void } => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
      const item: AgentActivityItem = {
        id: crypto.randomUUID(),
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
        done: (detail?: string) => {
          item.status = 'done';
          if (detail) item.detail = detail;
          notifyState();
          callbacks?.onActivity?.(item);
        },
        fail: (err: string) => {
          item.status = 'error';
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


      // 2. Autonomous Project Reconnaissance
      // Action A: get_project_overview
      const actOverview = recordActivity('Inspected project overview', 'get_project_overview');
      const overview = await tools.getProjectOverview();
      actOverview.done(`${overview.name} (${overview.languages.join(', ')})`);

      if (this.abortController.signal.aborted) throw new Error('Planning cancelled');

      // Action B: list_directory (check src or root)
      const hasSrc = overview.topLevelDirectories.includes('src');
      const listTarget = hasSrc ? 'src' : '';
      const actList = recordActivity(hasSrc ? 'Listed src' : 'Listed project root', 'list_directory', { path: listTarget });
      const dirList = await tools.listDirectory({ path: listTarget, recursive: true, maxDepth: 2 });
      actList.done(`${dirList.entries.length} items`);

      if (this.abortController.signal.aborted) throw new Error('Planning cancelled');

      // Action C: read package.json if present
      let pkgSummary = '';
      if (overview.keyFiles.includes('package.json')) {
        const actPkg = recordActivity('Read package.json', 'read_file', { path: 'package.json' });
        const pkgRead = await tools.readFile({ path: 'package.json', endLine: 60 });
        pkgSummary = pkgRead.content;
        actPkg.done();
      }

      if (this.abortController.signal.aborted) throw new Error('Planning cancelled');

      // Action D: Read key source files (e.g. src/App.tsx, src/index.ts, src/game.ts)
      const candidates = ['src/App.tsx', 'src/App.jsx', 'src/game.ts', 'src/index.ts', 'src/main.ts'];
      let primarySourceSnippet = '';

      for (const targetName of candidates) {
        const fileExists = dirList.entries.some(e => e.relativePath === targetName) ||
          fs.existsSync(path.join(guard.canonicalRootPath, targetName));

        if (fileExists) {
          const actRead = recordActivity(`Read ${targetName}`, 'read_file', { path: targetName });
          const fileRes = await tools.readFile({ path: targetName, startLine: 1, endLine: 80 });
          primarySourceSnippet = `\n--- ${targetName} ---\n` + fileRes.content;
          actRead.done();
          break;
        }
      }

      if (this.abortController.signal.aborted) throw new Error('Planning cancelled');

      // Action E: Search for domain concepts in the user prompt
      const stopWords = new Set([
        'this', 'that', 'with', 'from', 'project', 'explain', 'architecture',
        'identify', 'important', 'files', 'propose', 'system', 'analyze',
        'about', 'what', 'where', 'when', 'will', 'have', 'need', 'want', 'code'
      ]);
      const promptWords = prompt.toLowerCase().match(/[a-z]{4,}/g) || [];
      const domainWords = promptWords.filter(w => !stopWords.has(w));

      let searchSummary = '';
      if (domainWords.length > 0) {
        let searchTerm = domainWords[0];
        if (searchTerm.endsWith('ies') && searchTerm.length > 5) {
          searchTerm = searchTerm.slice(0, -3) + 'y';
        } else if (searchTerm.endsWith('s') && !searchTerm.endsWith('ss') && searchTerm.length > 4) {
          searchTerm = searchTerm.slice(0, -1);
        }
        const actSearch = recordActivity(`Searched "${searchTerm}"`, 'search_text', { query: searchTerm });
        const searchRes = await tools.searchText({ query: searchTerm, maxMatches: 10 });
        actSearch.done(`${searchRes.totalMatches} matches`);

        if (searchRes.matches.length > 0) {
          searchSummary = `\nMatches for "${searchTerm}":\n` +
            searchRes.matches.slice(0, 5).map(m => `  ${m.file}:${m.line} -> ${m.content}`).join('\n');

          // Read the matching file if not read yet
          const topMatchFile = searchRes.matches[0].file;
          if (!this.activities.some(a => a.label === `Read ${topMatchFile}`)) {
            const actReadMatch = recordActivity(`Read ${topMatchFile}`, 'read_file', { path: topMatchFile });
            await tools.readFile({ path: topMatchFile, endLine: 80 });
            actReadMatch.done();
          }
        }
      }

      if (this.abortController.signal.aborted) throw new Error('Planning cancelled');

      // 3. Dynamic Tools for the local model
      let dynamicFunctions: Record<string, unknown> | undefined;
      try {
        const nlc = await import('node-llama-cpp');
        if (typeof nlc.defineChatSessionFunction === 'function') {
          dynamicFunctions = {
            get_project_overview: nlc.defineChatSessionFunction({
              description: 'Get project overview, architecture hints, languages, and dependencies',
              params: { type: 'object', properties: {} },
              handler: async () => {
                const act = recordActivity('Inspected project overview', 'get_project_overview');
                const res = await tools.getProjectOverview();
                act.done();
                return JSON.stringify(res);
              },
            }),
            list_directory: nlc.defineChatSessionFunction({
              description: 'List files and directories inside the active workspace',
              params: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: 'Directory path relative to project root' },
                },
              },
              handler: async (args: { path?: string }) => {
                const label = `Listed ${args.path || 'root'}`;
                const act = recordActivity(label, 'list_directory', args);
                const res = await tools.listDirectory({ path: args.path });
                act.done();
                return JSON.stringify(res);
              },
            }),
            read_file: nlc.defineChatSessionFunction({
              description: 'Read the contents of a text file within the workspace',
              params: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: 'File path relative to project root' },
                  startLine: { type: 'number' },
                  endLine: { type: 'number' },
                },
                required: ['path'],
              },
              handler: async (args: { path: string; startLine?: number; endLine?: number }) => {
                const label = `Read ${args.path}`;
                const act = recordActivity(label, 'read_file', args);
                const res = await tools.readFile(args);
                act.done();
                return res.content;
              },
            }),
            search_text: nlc.defineChatSessionFunction({
              description: 'Search for text in project source files',
              params: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search term or symbol' },
                },
                required: ['query'],
              },
              handler: async (args: { query: string }) => {
                const label = `Searched "${args.query}"`;
                const act = recordActivity(label, 'search_text', args);
                const res = await tools.searchText(args);
                act.done();
                return JSON.stringify(res);
              },
            }),
          };
        }
      } catch {
        // Fallback for mocked test runners
      }

      // 4. Model Planning Synthesis
      const systemInstruction = `You are Model Forge's Plan Agent, a project intelligence system running strictly locally on the user's workstation.
You have inspected the active workspace. Model Forge is operating in Safe Read-Only Mode.
Your task is to analyze the project, explain its architecture, identify the important files, and propose a concrete step-by-step implementation plan for the user's goal.

PROJECT CONTEXT:
- Project Name: ${overview.name}
- Root Path: ${overview.canonicalRootPath}
- Git Repository: ${overview.isGitRepository ? 'Yes' : 'No'}
- Package Manager: ${overview.packageManager || 'None'}
- Languages: ${overview.languages.join(', ') || 'None detected'}
- Frameworks & Libraries: ${overview.frameworkHints.join(', ') || 'Standard'}
- Top Directories: ${overview.topLevelDirectories.join(', ')}
${pkgSummary ? `\nPACKAGE MANIFEST:\n${pkgSummary}\n` : ''}
${primarySourceSnippet ? `\nPRIMARY SOURCE ENTRY:\n${primarySourceSnippet}\n` : ''}
${searchSummary ? `\nSEARCH RESULTS:\n${searchSummary}\n` : ''}

INSTRUCTIONS:
Produce a well-structured architectural and implementation plan with the following sections:
1. Executive Summary & Architecture Overview
2. Key Files & Components Identified
3. Step-by-Step Implementation Strategy
4. Verification & Testing Approach`;

      const synthesisPrompt = `${systemInstruction}\n\nUSER REQUEST:\n${prompt}\n\nPlease generate the comprehensive implementation plan now:`;

      this.currentActivity = 'Synthesizing architectural plan...';
      notifyState();

      const actPlan = recordActivity('Created architecture plan');

      const generatedPlan = await this.inferenceService.executeAgentPrompt({
        prompt: synthesisPrompt,
        functions: dynamicFunctions,
        signal: this.abortController.signal,
        onChunk: (chunkText) => {
          if (this.activeSessionId === sessionId) {
            this.planContent += chunkText;
            callbacks?.onChunk?.({
              requestId: sessionId,
              text: chunkText,
              isDone: false,
            });
          }
        },
      });

      this.planContent = generatedPlan || this.planContent;
      actPlan.done();

      // Final completion
      this.status = 'completed';
      this.currentActivity = 'Plan generated successfully.';
      notifyState();

      callbacks?.onChunk?.({
        requestId: sessionId,
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
          requestId: sessionId,
          text: `\n\n[Planning Error: ${msg}]`,
          isDone: true,
          error: msg,
        });
      }

      throw err;
    } finally {
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
        this.abortController = null;
      }
    }
  }
}
