import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PlanAgent } from '../src/main/agent/plan-agent';
import { InferenceService } from '../src/main/inference/service';
import { ModelRegistry } from '../src/main/models/registry';
import { AgentActivityItem, Project } from '../src/shared/types';

describe('PlanAgent (Read-Only Autonomous Project Intelligence)', () => {
  let tempDir: string;
  let tempWorkspace: string;
  let registry: ModelRegistry;
  let inferenceService: InferenceService;
  let planAgent: PlanAgent;
  let project: Project;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-agent-test-'));
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-agent-workspace-'));

    // Populate realistic project files
    fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkspace, '.git'), { recursive: true });

    fs.writeFileSync(
      path.join(tempWorkspace, 'package.json'),
      JSON.stringify(
        {
          name: 'super-game',
          version: '1.0.0',
          dependencies: { react: '^18.2.0' },
        },
        null,
        2
      ),
      'utf8'
    );

    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'App.tsx'),
      `import React from 'react';\nexport const App = () => <h1>Game Dashboard</h1>;\n`,
      'utf8'
    );

    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'game.ts'),
      `export class GameEngine {\n  private score = 0;\n  public awardAchievement(id: string) {\n    console.log("Unlocked achievement:", id);\n  }\n}\n`,
      'utf8'
    );

    project = {
      id: 'proj-123',
      name: 'super-game',
      rootPath: tempWorkspace,
      canonicalRootPath: tempWorkspace,
      path: tempWorkspace,
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      isGitRepository: true,
      frameworkHints: ['React'],
      languages: ['TypeScript'],
      packageManager: 'npm',
    };

    registry = new ModelRegistry(tempDir);
    inferenceService = new InferenceService(registry);
    planAgent = new PlanAgent(inferenceService);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('rejects planning if no local model is loaded', async () => {
    vi.spyOn(inferenceService, 'getModelState').mockReturnValue('unloaded');

    await expect(
      planAgent.startPlanning(project, 'Analyze this project')
    ).rejects.toThrow('No model loaded');
  });

  it('autonomously executes model-driven tool calls, emits real activities, and streams plan', async () => {
    vi.spyOn(inferenceService, 'getModelState').mockReturnValue('loaded');

    const expectedPlanText = `# Implementation Plan for Achievements\n\n## 1. Architecture Overview\nThe project is a React/TypeScript application.\n\n## 2. Key Files\n- src/game.ts\n- src/App.tsx`;

    // Mock executeAgentPrompt to simulate dynamic model function calling
    vi.spyOn(inferenceService, 'executeAgentPrompt').mockImplementation(async (options) => {
      const funcs = options.functions as Record<string, any>;
      expect(funcs).toBeDefined();
      expect(funcs.get_project_overview).toBeDefined();
      expect(funcs.list_directory).toBeDefined();
      expect(funcs.read_file).toBeDefined();
      expect(funcs.search_text).toBeDefined();

      // Simulate model inspecting overview
      const overviewRes = await funcs.get_project_overview.handler({});
      expect(overviewRes).toContain('super-game');

      // Simulate model deciding to inspect src directory
      const listRes = await funcs.list_directory.handler({ path: 'src' });
      expect(listRes).toContain('App.tsx');
      expect(listRes).toContain('game.ts');

      // Simulate model reading package.json and App.tsx
      const pkgRes = await funcs.read_file.handler({ path: 'package.json' });
      expect(pkgRes).toContain('super-game');

      const appRes = await funcs.read_file.handler({ path: 'src/App.tsx' });
      expect(appRes).toContain('Game Dashboard');

      // Simulate model searching for achievements
      const searchRes = await funcs.search_text.handler({ query: 'achievement' });
      expect(searchRes).toContain('awardAchievement');

      // Simulate model reading game engine
      const gameRes = await funcs.read_file.handler({ path: 'src/game.ts' });
      expect(gameRes).toContain('awardAchievement');

      // Simulate streaming chunks
      const chunks = ['# Implementation Plan', ' for Achievements\n\n', '## 1. Architecture Overview\n'];
      for (const chunk of chunks) {
        options.onChunk?.(chunk);
      }
      return expectedPlanText;
    });

    const receivedActivities: AgentActivityItem[] = [];
    const receivedChunks: string[] = [];

    const plan = await planAgent.startPlanning(
      project,
      'Analyze this project. Explain its architecture, identify the important files, and propose how to add an achievements system.',
      {
        onActivity: (activity) => {
          receivedActivities.push(activity);
        },
        onChunk: (chunk) => {
          if (chunk.text) {
            receivedChunks.push(chunk.text);
          }
        },
      }
    );

    expect(plan).toBe(expectedPlanText);
    expect(receivedChunks.length).toBeGreaterThan(0);

    // Verify Real Actions were recorded
    const labels = receivedActivities.map((a) => a.label);

    expect(labels).toContain('Inspected project overview');
    expect(labels).toContain('Listed src');
    expect(labels).toContain('Read package.json');
    expect(labels).toContain('Read src/App.tsx');
    expect(labels).toContain('Searched "achievement"');
    expect(labels).toContain('Read src/game.ts');
    expect(labels).toContain('Created architecture plan');

    // Verify final state is completed without warning
    const state = planAgent.getState();
    expect(state.status).toBe('completed');
    expect(state.planContent).toBe(expectedPlanText);
  });

  it('appends warning if model generates a plan without calling any tools', async () => {
    vi.spyOn(inferenceService, 'getModelState').mockReturnValue('loaded');

    const rawPlanText = 'I did not inspect any files, but here is a generic plan.';
    vi.spyOn(inferenceService, 'executeAgentPrompt').mockImplementation(async () => {
      // Model produces output without calling any functions
      return rawPlanText;
    });

    const receivedActivities: AgentActivityItem[] = [];
    const plan = await planAgent.startPlanning(project, 'Analyze this project', {
      onActivity: (act) => receivedActivities.push(act),
    });

    expect(plan).toContain(rawPlanText);
    expect(plan).toContain('⚠️ This model did not successfully inspect the project with tools');

    // Only created plan activity should exist
    const labels = receivedActivities.map((a) => a.label);
    expect(labels).toContain('Created architecture plan');
    expect(labels).not.toContain('Read package.json');
  });

  it('blocks tool calls that attempt jail escape and returns structured error without crashing', async () => {
    vi.spyOn(inferenceService, 'getModelState').mockReturnValue('loaded');

    vi.spyOn(inferenceService, 'executeAgentPrompt').mockImplementation(async (options) => {
      const funcs = options.functions as Record<string, any>;
      // Attempt directory traversal out of jail
      const escapeResult = await funcs.read_file.handler({ path: '../../etc/passwd' });
      const parsed = JSON.parse(escapeResult);
      expect(parsed.blocked).toBe(true);
      expect(parsed.error).toContain('escapes workspace jail root');
      return '# Safe Plan Generated';
    });

    const receivedActivities: AgentActivityItem[] = [];
    await planAgent.startPlanning(project, 'Check system files', {
      onActivity: (act) => receivedActivities.push(act),
    });

    // Check that blocked activity was recorded
    const blockedActivity = receivedActivities.find((a) => a.status === 'blocked');
    expect(blockedActivity).toBeDefined();
    expect(blockedActivity?.label).toContain('Read ../../etc/passwd');
  });

  it('enforces maximum tool call budget and blocks excessive calls', async () => {
    vi.spyOn(inferenceService, 'getModelState').mockReturnValue('loaded');

    vi.spyOn(inferenceService, 'executeAgentPrompt').mockImplementation(async (options) => {
      const funcs = options.functions as Record<string, any>;
      // Call tools 25 times
      for (let i = 0; i < 25; i++) {
        await funcs.list_directory.handler({ path: 'src' });
      }
      // 26th call must be blocked by budget
      const overflowResult = await funcs.list_directory.handler({ path: 'src' });
      const parsed = JSON.parse(overflowResult);
      expect(parsed.blocked).toBe(true);
      expect(parsed.error).toContain('Tool call budget exceeded');
      return '# Plan with budget enforcement';
    });

    const receivedActivities: AgentActivityItem[] = [];
    await planAgent.startPlanning(project, 'Exhaustive exploration', {
      onActivity: (act) => receivedActivities.push(act),
    });

    const blocked = receivedActivities.find((a) => a.status === 'blocked');
    expect(blocked).toBeDefined();
    expect(blocked?.detail).toContain('Tool call budget exceeded');
  });

  it('supports stopping/cancelling active planning', async () => {
    vi.spyOn(inferenceService, 'getModelState').mockReturnValue('loaded');

    vi.spyOn(inferenceService, 'executeAgentPrompt').mockImplementation(async (options) => {
      // Simulate delay waiting on abort signal
      return new Promise((_, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new Error('Planning cancelled'));
        });
      });
    });

    const planPromise = planAgent.startPlanning(project, 'Analyze this project');

    // Wait a brief tick then stop
    await new Promise((resolve) => setTimeout(resolve, 50));
    const stopped = await planAgent.stopPlanning();
    expect(stopped).toBe(true);

    await expect(planPromise).rejects.toThrow('cancelled');

    const state = planAgent.getState();
    expect(state.status).toBe('idle');
  });

  it('guarantees the AI is technically incapable of file mutations', () => {
    const agentAny = planAgent as any;
    expect(agentAny.writeFile).toBeUndefined();
    expect(agentAny.editFile).toBeUndefined();
    expect(agentAny.deleteFile).toBeUndefined();
    expect(agentAny.renameFile).toBeUndefined();
    expect(agentAny.runTerminal).toBeUndefined();
    expect(agentAny.runGit).toBeUndefined();
    expect(agentAny.executeCommand).toBeUndefined();
  });
});
