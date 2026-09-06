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

  it('autonomously inspects project, emits real activities, and streams plan', async () => {
    // Fake model loaded state
    vi.spyOn(inferenceService, 'getModelState').mockReturnValue('loaded');

    const expectedPlanText = `# Implementation Plan for Achievements\n\n## 1. Architecture Overview\nThe project is a React/TypeScript application.\n\n## 2. Key Files\n- src/game.ts\n- src/App.tsx`;

    // Mock executeAgentPrompt to simulate token streaming
    vi.spyOn(inferenceService, 'executeAgentPrompt').mockImplementation(async (options) => {
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
    expect(labels).toContain('Created architecture plan');

    // Verify final state is completed
    const state = planAgent.getState();
    expect(state.status).toBe('completed');
    expect(state.planContent).toBe(expectedPlanText);
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
