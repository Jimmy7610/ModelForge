import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { InferenceService } from '../src/main/inference/service';
import { ModelRegistry, createStableModelId } from '../src/main/models/registry';
import { parseGgufHeaderSync } from '../src/main/gguf/parser';
import { CheckpointService } from '../src/main/edit/checkpoint-service';
import { DiffService } from '../src/main/edit/diff-service';
import { EditAgent } from '../src/main/agent/edit-agent';
import { PlanAgent } from '../src/main/agent/plan-agent';
import { WorkspaceGuard } from '../src/main/workspace/guard';
import { Project, ModelRecord } from '../src/shared/types';

async function main() {
  const modelPath = 'S:\\AI\\Models\\GGUF\\qwen2.5-coder-7b-instruct-q4_k_m.gguf';

  console.log('====================================================');
  console.log('MODEL FORGE v0.5.0 — REAL HARDWARE QA EXECUTION');
  console.log('====================================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Target Model: ${modelPath}`);

  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model file not found at: ${modelPath}`);
  }

  // Define isolated throwaway project in OS Temp
  const qaDir = path.join(os.tmpdir(), 'ModelForge-Edit-QA');
  const checkpointsDir = path.join(os.tmpdir(), 'ModelForge-Edit-QA-Checkpoints');

  console.log(`Throwaway Project Path: ${qaDir}`);
  console.log(`Checkpoint Storage:     ${checkpointsDir}`);

  // Clean and initialize throwaway project directory
  if (fs.existsSync(qaDir)) {
    fs.rmSync(qaDir, { recursive: true, force: true });
  }
  if (fs.existsSync(checkpointsDir)) {
    fs.rmSync(checkpointsDir, { recursive: true, force: true });
  }

  fs.mkdirSync(path.join(qaDir, 'src'), { recursive: true });
  fs.mkdirSync(checkpointsDir, { recursive: true });

  const initialMathContent = `export function add(a: number, b: number): number {\n  return a + b;\n}\n`;
  const initialPackageJson = JSON.stringify({ name: 'throwaway-qa', version: '1.0.0' }, null, 2) + '\n';

  fs.writeFileSync(path.join(qaDir, 'package.json'), initialPackageJson, 'utf8');
  fs.writeFileSync(path.join(qaDir, 'src', 'math.ts'), initialMathContent, 'utf8');

  console.log('[Setup] Initialized throwaway project with package.json and src/math.ts');

  // Initialize Services
  const registryDir = path.join(os.tmpdir(), 'ModelForge-QA-Registry');
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

  const inferenceService = new InferenceService(registry);
  const checkpointService = new CheckpointService(checkpointsDir);

  console.log('[Inference] Loading model on local GPU runtime...');
  const loadStart = Date.now();
  const loaded = await inferenceService.loadModel(modelId, 4096);
  console.log(`[Inference] Model loaded in ${((Date.now() - loadStart) / 1000).toFixed(2)}s: ${loaded.name}`);

  const infState = await inferenceService.getState();
  console.log(`[Hardware] Backend: ${infState.runtime.backend.toUpperCase()} | GPU: ${infState.runtime.gpuName}`);
  console.log(`[Hardware] VRAM: ${Math.round(infState.runtime.vramUsedBytes / (1024 * 1024))} MB used / ${Math.round(infState.runtime.vramTotalBytes / (1024 * 1024))} MB total`);

  const qaProject: Project = {
    id: 'throwaway-qa-project',
    name: 'throwaway-qa',
    rootPath: qaDir,
    canonicalRootPath: qaDir,
    path: qaDir,
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
  };

  const editAgent = new EditAgent(inferenceService, checkpointService);

  // ----------------------------------------------------
  // QA Scenario 1: Model Modifies math.ts + Rollback Verification
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log('QA SCENARIO 1: Model File Modification + Rollback');
  console.log('====================================================');

  const s1Prompt = `Inspect src/math.ts using read_file. Then use replace_in_file to add a multiply function:
export function multiply(a: number, b: number): number {
  return a * b;
}`;

  console.log(`[S1] Prompting Edit Agent: "${s1Prompt.slice(0, 70)}..."`);
  const s1Start = Date.now();
  const s1Result = await editAgent.startEditing(qaProject, s1Prompt, {
    onActivity: (act) => {
      console.log(`  [Agent Activity] [${act.status.toUpperCase()}] ${act.toolName ? `${act.toolName}: ` : ''}${act.label}`);
    },
    onChunk: (chunk) => {
      process.stdout.write(chunk.text);
    },
  });
  console.log(`\n[S1] Edit Agent finished in ${((Date.now() - s1Start) / 1000).toFixed(2)}s`);

  const s1State = editAgent.getState();
  console.log(`[S1] Summary: Total Tool Calls=${s1State.summary?.totalToolCalls}, Successful=${s1State.summary?.successfulToolCalls}`);
  console.log(`[S1] Distinct Tools: ${s1State.summary?.distinctToolNames.join(', ')}`);
  console.log(`[S1] Files Modified: ${s1State.summary?.filesModified.join(', ')}`);
  console.log(`[S1] Files Created:  ${s1State.summary?.filesCreated.join(', ')}`);

  const s1CheckpointId = s1State.checkpointId;
  if (!s1CheckpointId) throw new Error('Scenario 1 failed: No checkpointId generated!');
  console.log(`[S1] Checkpoint ID: ${s1CheckpointId}`);

  // Verify file was modified on disk
  const s1DiskContent = fs.readFileSync(path.join(qaDir, 'src', 'math.ts'), 'utf8');
  console.log('[S1] Current Disk Content:\n' + s1DiskContent);
  if (!s1DiskContent.includes('multiply')) {
    throw new Error('Scenario 1 failed: math.ts does not contain multiply function!');
  }

  // Verify Checkpoint Diff
  const s1Manifest = await checkpointService.getManifest(s1CheckpointId, qaProject.id);
  if (!s1Manifest) throw new Error('Scenario 1 failed: Manifest not found!');
  const s1Diff = DiffService.computeCheckpointDiff(
    s1Manifest,
    checkpointService.getCheckpointDir(qaProject.id, s1CheckpointId),
    qaDir
  );
  console.log(`[S1] Checkpoint Diff: ${s1Diff.totalFilesChanged} file(s) changed, +${s1Diff.totalInsertions}/-${s1Diff.totalDeletions}`);
  console.log('[S1] Unified Patch:\n' + s1Diff.files[0]?.unifiedDiff);

  // Execute Rollback
  console.log('[S1] Executing Rollback...');
  const s1Rollback = await checkpointService.rollbackCheckpoint(s1CheckpointId, qaProject.id, new WorkspaceGuard(qaDir));
  console.log(`[S1] Rollback result: success=${s1Rollback.success}, restored=${s1Rollback.restoredFiles.join(', ')}`);
  if (!s1Rollback.success) throw new Error('Scenario 1 failed: Rollback returned false!');

  // Verify bit-for-bit restoration
  const s1RestoredContent = fs.readFileSync(path.join(qaDir, 'src', 'math.ts'), 'utf8');
  if (s1RestoredContent !== initialMathContent) {
    throw new Error(`Scenario 1 failed: math.ts content mismatch after rollback!\nExpected:\n${initialMathContent}\nActual:\n${s1RestoredContent}`);
  }
  console.log('[S1 PASS] math.ts was restored bit-for-bit to initial state.');

  editAgent.clearActivities();

  // ----------------------------------------------------
  // QA Scenario 2: Model Modifies math.ts + Accept Verification
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log('QA SCENARIO 2: Model File Modification + Accept');
  console.log('====================================================');

  const s2Prompt = `Inspect src/math.ts with read_file. Then use replace_in_file to add a subtract function:
export function subtract(a: number, b: number): number {
  return a - b;
}`;

  console.log(`[S2] Prompting Edit Agent: "${s2Prompt.slice(0, 70)}..."`);
  const s2Start = Date.now();
  await editAgent.startEditing(qaProject, s2Prompt, {
    onActivity: (act) => {
      console.log(`  [Agent Activity] [${act.status.toUpperCase()}] ${act.toolName ? `${act.toolName}: ` : ''}${act.label}`);
    },
  });
  console.log(`[S2] Edit Agent finished in ${((Date.now() - s2Start) / 1000).toFixed(2)}s`);

  const s2State = editAgent.getState();
  const s2CheckpointId = s2State.checkpointId;
  if (!s2CheckpointId) throw new Error('Scenario 2 failed: No checkpointId generated!');

  const s2DiskContent = fs.readFileSync(path.join(qaDir, 'src', 'math.ts'), 'utf8');
  if (!s2DiskContent.includes('subtract')) {
    throw new Error('Scenario 2 failed: math.ts does not contain subtract function!');
  }

  // Accept Checkpoint
  console.log('[S2] Accepting Checkpoint...');
  await checkpointService.acceptCheckpoint(s2CheckpointId, qaProject.id);
  const s2ManifestAfter = await checkpointService.getManifest(s2CheckpointId, qaProject.id);
  if (s2ManifestAfter?.status !== 'accepted') {
    throw new Error(`Scenario 2 failed: Checkpoint status is ${s2ManifestAfter?.status}, expected accepted!`);
  }
  console.log('[S2 PASS] Checkpoint successfully accepted. Disk modifications retained.');

  editAgent.clearActivities();

  // ----------------------------------------------------
  // QA Scenario 3: Interrupted Session / Crash Recovery Scan
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log('QA SCENARIO 3: Interrupted Session Crash Recovery');
  console.log('====================================================');

  // Create an artificial pending checkpoint
  const s3Cp = await checkpointService.createPendingCheckpoint(qaProject.id, 'Simulated crash session', qaDir);
  console.log(`[S3] Created uncommitted pending checkpoint: ${s3Cp.id}`);

  const freshCheckpointService = new CheckpointService(checkpointsDir);
  const pendingList = await freshCheckpointService.scanForInterruptedCheckpoints(qaProject.id);
  console.log(`[S3] Scan detected ${pendingList.length} interrupted checkpoint(s).`);
  const foundPending = pendingList.find((c) => c.id === s3Cp.id);
  if (!foundPending) {
    throw new Error('Scenario 3 failed: Interrupted checkpoint was not detected by scan!');
  }
  console.log('[S3 PASS] Crash recovery scanner successfully detected pending checkpoint.');

  // Rollback simulated crash checkpoint to clean up
  await freshCheckpointService.rollbackCheckpoint(s3Cp.id, qaProject.id, new WorkspaceGuard(qaDir));

  // ----------------------------------------------------
  // QA Scenario 4: External Edit Conflict Protection
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log('QA SCENARIO 4: External Edit Conflict Protection');
  console.log('====================================================');

  const s4Cp = await checkpointService.createPendingCheckpoint(qaProject.id, 'Conflict test', qaDir);
  const mathPath = path.join(qaDir, 'src', 'math.ts');
  await checkpointService.capturePreMutationSnapshot(s4Cp.id, qaProject.id, 'src/math.ts', mathPath);

  // Agent mutates math.ts
  fs.writeFileSync(mathPath, '// Agent mutated this\nexport const x = 1;\n', 'utf8');
  await checkpointService.recordFileMutation(s4Cp.id, qaProject.id, 'src/math.ts', 'modify', mathPath);

  // Now user/external process edits math.ts outside Model Forge
  const userCustomCode = '// USER CUSTOM CONFLICT CODE\nexport const user = true;\n';
  fs.writeFileSync(mathPath, userCustomCode, 'utf8');
  console.log('[S4] User modified math.ts externally after agent edit.');

  // Attempt rollback - must detect conflict!
  const s4Rollback = await checkpointService.rollbackCheckpoint(s4Cp.id, qaProject.id, new WorkspaceGuard(qaDir));
  console.log(`[S4] Rollback success=${s4Rollback.success}, conflict count=${s4Rollback.conflicts?.length}`);
  if (s4Rollback.success) {
    throw new Error('Scenario 4 failed: Rollback should have failed due to external conflict!');
  }
  if (!s4Rollback.conflicts || s4Rollback.conflicts.length === 0) {
    throw new Error('Scenario 4 failed: No conflicts reported in RollbackResult!');
  }

  // Verify user's code was NOT overwritten
  const s4Preserved = fs.readFileSync(mathPath, 'utf8');
  if (s4Preserved !== userCustomCode) {
    throw new Error('Scenario 4 failed: User modifications were overwritten during conflicted rollback!');
  }
  console.log('[S4 PASS] Rollback conflict prevented data loss. User edits preserved.');

  // ----------------------------------------------------
  // QA Scenario 5: Security Escapes Blocked
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log('QA SCENARIO 5: Security Escapes Blocked');
  console.log('====================================================');

  const guard = new WorkspaceGuard(qaDir);
  const escape1 = guard.resolveWritePath('../../outside.txt');
  const escape2 = guard.resolveWritePath('.env');
  const escape3 = guard.resolveWritePath('.git/config');
  const escape4 = guard.resolveWritePath('src/nested/../../../../etc/passwd');

  console.log(`  ../../outside.txt: allowed=${escape1.allowed}`);
  console.log(`  .env:              allowed=${escape2.allowed}`);
  console.log(`  .git/config:       allowed=${escape3.allowed}`);
  console.log(`  ../../etc/passwd:  allowed=${escape4.allowed}`);

  if (escape1.allowed || escape2.allowed || escape3.allowed || escape4.allowed) {
    throw new Error('Scenario 5 failed: One or more security escapes were allowed!');
  }
  console.log('[S5 PASS] WorkspaceGuard strictly blocked all security escapes.');

  // ----------------------------------------------------
  // QA Scenario 6: Plan Agent Regression Check (0 Mutations)
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log('QA SCENARIO 6: Plan Agent Regression Check (0 Mutations)');
  console.log('====================================================');

  const planAgent = new PlanAgent(inferenceService);
  const filesBeforePlan = fs.readdirSync(path.join(qaDir, 'src'));
  const mtimeBefore = fs.statSync(mathPath).mtimeMs;

  const planResult = await planAgent.startPlanning(
    qaProject,
    'Analyze src/math.ts and explain what functions it exports.',
    {
      onActivity: (act) => {
        console.log(`  [Plan Activity] [${act.status.toUpperCase()}] ${act.toolName ? `${act.toolName}: ` : ''}${act.label}`);
      },
    }
  );
  console.log(`[S6] Plan generated (${planResult.length} chars).`);

  const filesAfterPlan = fs.readdirSync(path.join(qaDir, 'src'));
  const mtimeAfter = fs.statSync(mathPath).mtimeMs;

  if (filesBeforePlan.length !== filesAfterPlan.length || mtimeBefore !== mtimeAfter) {
    throw new Error('Scenario 6 failed: Plan Agent mutated project files on disk!');
  }
  console.log('[S6 PASS] Plan Agent executed read-only inspection with 0 file mutations.');

  // Clean up inference
  console.log('\n====================================================');
  console.log('UNLOADING MODEL AND TEARDOWN');
  console.log('====================================================');
  await inferenceService.unloadModel();
  console.log('[Inference] Model unloaded cleanly.');

  // Cleanup temp dirs
  try {
    fs.rmSync(qaDir, { recursive: true, force: true });
    fs.rmSync(checkpointsDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  console.log('\n====================================================');
  console.log('ALL 6 REAL HARDWARE QA SCENARIOS PASSED WITH EXCELLENCE!');
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('\n*** HARDWARE QA FAILED ***\n', err);
  process.exit(1);
});
