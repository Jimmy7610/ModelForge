import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { InferenceService } from '../src/main/inference/service';
import { ModelRegistry, createStableModelId } from '../src/main/models/registry';
import { parseGgufHeaderSync } from '../src/main/gguf/parser';
import { CheckpointService } from '../src/main/edit/checkpoint-service';
import { EditAgent } from '../src/main/agent/edit-agent';
import { DiffService } from '../src/main/edit/diff-service';
import { WorkspaceGuard } from '../src/main/workspace/guard';
import { Project, ModelRecord } from '../src/shared/types';

async function main() {
  const modelPath = process.env.MODEL_FORGE_TEST_GGUF || 'S:\\AI\\Models\\GGUF\\qwen2.5-coder-7b-instruct-q4_k_m.gguf';
  const testDir = 'C:\\Temp\\ModelForge-Recovery-Test';
  const storageDir = 'C:\\Temp\\ModelForge-Recovery-Storage';

  console.log('=== REAL REGRESSION TEST: C:\\Temp\\ModelForge-Recovery-Test ===');

  if (!fs.existsSync(modelPath)) {
    console.error(`Model file not found at: ${modelPath}`);
    process.exit(1);
  }

  // Ensure directories exist
  fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
  fs.mkdirSync(storageDir, { recursive: true });

  const testFile = path.join(testDir, 'src', 'test.ts');
  const initialContent = 'export function hello(): string { return "hello"; }\n';
  fs.writeFileSync(testFile, initialContent, 'utf8');
  console.log('[Setup] Reset src/test.ts to initial content');

  const registryDir = path.join(os.tmpdir(), 'ModelForge-Recovery-Registry');
  const registry = new ModelRegistry(registryDir);

  const header = parseGgufHeaderSync(modelPath);
  const stat = fs.statSync(modelPath);
  const modelId = createStableModelId(modelPath);

  const modelRecord: ModelRecord = {
    id: modelId,
    path: modelPath,
    fileName: path.basename(modelPath),
    displayName: header.data?.name || path.basename(modelPath),
    rootDirectory: path.dirname(modelPath),
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    mtimeMs: stat.mtimeMs,
    ggufVersion: header.data?.ggufVersion ?? null,
    architecture: header.data?.architecture ?? null,
    quantization: header.data?.quantization ?? null,
    quantizationSource: header.data?.quantizationSource ?? null,
    contextLength: header.data?.contextLength ?? null,
    metadataStatus: 'available',
    discoveredAt: new Date().toISOString(),
  };

  (registry as any).records.set(modelId, modelRecord);

  const inference = new InferenceService(registry);
  console.log('[Inference] Loading Qwen2.5-Coder model on CUDA...');
  await inference.loadModel(modelId, 4096);
  console.log('[Inference] Model loaded successfully');

  const checkpointService = new CheckpointService(storageDir);
  const editAgent = new EditAgent(inference, checkpointService);

  const project: Project = {
    id: 'proj-recovery-qa',
    name: 'ModelForge-Recovery-Test',
    path: testDir,
    rootPath: testDir,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  };

  const activitiesLogged: { type: string; status: string; title: string; message?: string }[] = [];

  const prompt = 'Open src/test.ts and add a new exported function called recoveryTest that returns true.\nKeep the existing hello function unchanged.\nDo not run tests.';

  console.log('\n[Prompting Edit Agent]:', prompt.replace(/\n/g, ' '));

  await editAgent.startEditing(project, prompt, {
    onActivity: (act) => {
      activitiesLogged.push({
        type: act.type,
        status: act.status,
        title: act.title,
        message: act.message,
      });
      console.log(`  [Activity] [${act.status.toUpperCase()}] ${act.type}: ${act.title}`);
    },
  });

  const state = editAgent.getState();
  console.log(`\n[EditAgent Finished] status=${state.status}`);

  const resultContent = fs.readFileSync(testFile, 'utf8');
  console.log('\n[Disk Content after Edit]:\n' + resultContent);

  // Verifications
  const helloMatches = (resultContent.match(/function hello/g) || []).length;
  const recoveryMatches = (resultContent.match(/function recoveryTest/g) || []).length;

  console.log(`hello function count: ${helloMatches} (expected: 1)`);
  console.log(`recoveryTest function count: ${recoveryMatches} (expected: 1)`);

  if (helloMatches !== 1 || recoveryMatches !== 1) {
    throw new Error(`Function counts invalid! hello=${helloMatches}, recoveryTest=${recoveryMatches}`);
  }

  // Check for repeated red failures
  const failedEdits = activitiesLogged.filter(
    (a) => a.status === 'failed' && a.type === 'replace_in_file'
  );
  console.log(`Failed replace_in_file count: ${failedEdits.length} (expected: 0 or handled cleanly)`);

  // Check Diff
  const guard = new WorkspaceGuard(testDir);
  const cpId = state.checkpointId!;
  const manifest = checkpointService.loadManifest(project.id, cpId)!;
  const cpDir = checkpointService.getCheckpointDir(project.id, cpId);
  const diff = DiffService.computeCheckpointDiff(manifest, cpDir, guard);
  console.log(`\n[Diff Result]: totalFilesChanged=${diff.totalFilesChanged}, files=${diff.files.map(f => f.relativePath).join(', ')}`);

  // Rollback Test
  console.log('\n[Testing Rollback]...');
  const rollbackResult = checkpointService.rollback(cpId, project.id, guard);
  console.log(`Rollback success=${rollbackResult.success}`);
  const restoredContent = fs.readFileSync(testFile, 'utf8');
  const rollbackMatchesInitial = (restoredContent === initialContent);
  console.log(`Restored content matches initial bit-for-bit: ${rollbackMatchesInitial}`);

  if (!rollbackMatchesInitial) {
    throw new Error('Rollback failed to restore bit-for-bit initial state!');
  }

  // Reset to initial
  fs.writeFileSync(testFile, initialContent, 'utf8');
  await inference.unloadModel();
  console.log('\n=== REAL REGRESSION TEST PASSED PERFECTLY ===\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
