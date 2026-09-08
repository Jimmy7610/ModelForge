import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { InferenceService } from '../src/main/inference/service';
import { ModelRegistry, createStableModelId } from '../src/main/models/registry';
import { parseGgufHeaderSync } from '../src/main/gguf/parser';
import { CheckpointService } from '../src/main/edit/checkpoint-service';
import { EditAgent } from '../src/main/agent/edit-agent';
import { DiffService } from '../src/main/edit/diff-service';
import { WorkspaceGuard } from '../src/main/workspace/guard';
import { Project, ModelRecord } from '../src/shared/types';

function computeSha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function runQa() {
  const modelPath = process.env.MODEL_FORGE_TEST_GGUF;
  const testDir = 'C:\\Temp\\ModelForge-Rollback-QA';
  const storageDir = 'C:\\Temp\\ModelForge-Rollback-QA-Storage';
  const testFile = path.join(testDir, 'src', 'test.ts');
  const initialContent = 'export function hello(): string { return "hello"; }\n';
  const EXPECTED_BASELINE_SHA = '15452289690ad399b26821b8336798fd9658c85c67c1ffed54fbec207457982f';

  if (!modelPath) {
    console.log('[INFO] MODEL_FORGE_TEST_GGUF environment variable is required to run real hardware QA.');
    process.exit(0);
  }

  console.log('=== REAL HARDWARE & FILESYSTEM QA: MODEL FORGE v0.5.4 ===');
  console.log('Target Project Directory:', testDir);
  console.log('Model Path:', modelPath);

  // 1. Clean storage and reset target file
  if (fs.existsSync(storageDir)) {
    fs.rmSync(storageDir, { recursive: true, force: true });
  }
  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
  fs.writeFileSync(testFile, initialContent, 'utf8');

  const baselineBytes = fs.readFileSync(testFile);
  const initialSha = computeSha256(baselineBytes);
  console.log('\n[1. Baseline Setup]');
  console.log('File:', testFile);
  console.log('Size (bytes):', baselineBytes.length);
  console.log('Initial SHA-256:', initialSha);
  if (initialSha !== EXPECTED_BASELINE_SHA) {
    throw new Error(`Baseline SHA mismatch! Expected ${EXPECTED_BASELINE_SHA}, got ${initialSha}`);
  }
  console.log('Baseline SHA matches expected 15452289690ad399b26821b8336798fd9658c85c67c1ffed54fbec207457982f EXACTLY.');

  // 2. Setup registry & load model on CUDA
  const registryDir = path.join(os.tmpdir(), 'ModelForge-Rollback-Registry');
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
  console.log('\n[2. Loading Model on CUDA]');
  await inference.loadModel(modelId, 4096);
  console.log('Model loaded successfully on GPU');

  const checkpointService = new CheckpointService(storageDir);
  const editAgent = new EditAgent(inference, checkpointService);

  const project: Project = {
    id: 'proj-rollback-qa',
    name: 'ModelForge-Rollback-QA',
    path: testDir,
    rootPath: testDir,
    canonicalRootPath: testDir,
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
  };

  // 3. Run Edit Agent to add recoveryTest()
  console.log('\n[3. Running Edit Agent]');
  const prompt = 'Open src/test.ts and add a new exported function called recoveryTest that returns true.\nKeep the existing hello function unchanged.\nDo not run tests.';

  await editAgent.startEditing(project, prompt, {
    onActivity: (act) => {
      console.log(`  [Activity] [${act.status.toUpperCase()}] ${act.toolName || 'agent'}: ${act.label}`);
    },
  });

  const state = editAgent.getState();
  const checkpointId = state.checkpointId!;
  console.log('\n[4. Edit Agent Completed]');
  console.log('Status:', state.status);
  console.log('Checkpoint ID:', checkpointId);

  // 4. Verify disk after mutation
  const mutatedBytes = fs.readFileSync(testFile);
  const mutatedSha = computeSha256(mutatedBytes);
  const mutatedContent = mutatedBytes.toString('utf8');
  console.log('\n[5. Post-Mutation Verification]');
  console.log('Mutated Size (bytes):', mutatedBytes.length);
  console.log('Mutated SHA-256:', mutatedSha);
  console.log('Has hello():', mutatedContent.includes('function hello'));
  console.log('Has recoveryTest():', mutatedContent.includes('function recoveryTest'));
  if (!mutatedContent.includes('function recoveryTest')) {
    throw new Error('Mutation failed: recoveryTest was not added to disk!');
  }
  if (mutatedSha === EXPECTED_BASELINE_SHA) {
    throw new Error('Mutation failed: SHA is identical to baseline!');
  }

  // 5. Inspect Checkpoint Manifest & Backup on disk
  const manifest = checkpointService.loadManifest(project.id, checkpointId);
  if (!manifest) throw new Error('Manifest not found on disk!');

  const fileEntry = manifest.files['src/test.ts'];
  console.log('\n[6. Checkpoint Manifest on Disk]');
  console.log('Manifest Status:', manifest.status);
  console.log('Manifest originalSha256:', fileEntry.originalSha256);
  console.log('Manifest lastAgentSha256:', fileEntry.lastAgentSha256);
  console.log('Backup file name:', fileEntry.backupFileName);

  if (fileEntry.originalSha256 !== EXPECTED_BASELINE_SHA) {
    throw new Error(`Manifest originalSha256 mismatch! Expected ${EXPECTED_BASELINE_SHA}, got ${fileEntry.originalSha256}`);
  }

  const cpDir = checkpointService.getCheckpointDir(project.id, checkpointId);
  const backupFilePath = path.join(cpDir, 'files', fileEntry.backupFileName!);
  const backupBytes = fs.readFileSync(backupFilePath);
  const backupSha = computeSha256(backupBytes);
  console.log('Backup file exists on disk:', fs.existsSync(backupFilePath));
  console.log('Backup file SHA-256:', backupSha);
  if (backupSha !== EXPECTED_BASELINE_SHA) {
    throw new Error(`Backup SHA-256 mismatch! Expected ${EXPECTED_BASELINE_SHA}, got ${backupSha}`);
  }

  // 6. Inspect Diff
  const guard = new WorkspaceGuard(testDir);
  const diff = DiffService.computeCheckpointDiff(manifest, cpDir, guard);
  console.log('\n[7. Diff Service Output]');
  console.log('Diff Checkpoint ID:', manifest.id);
  console.log('Total files changed:', diff.totalFilesChanged);
  console.log('Files in diff:', diff.files.map((f) => f.relativePath));

  // 7. Perform Rollback with Postcondition Verification
  console.log('\n[8. Executing Rollback with Postcondition Verification]');
  const rollbackResult = checkpointService.rollback(checkpointId, project.id, guard);
  console.log('Rollback success:', rollbackResult.success);
  console.log('Rollback verified:', rollbackResult.verified);
  console.log('Rollback verifiedFiles:', rollbackResult.verifiedFiles);
  console.log('Rollback verificationFailures:', rollbackResult.verificationFailures);

  if (!rollbackResult.success || !rollbackResult.verified) {
    throw new Error(`Rollback failed or unverified: ${JSON.stringify(rollbackResult)}`);
  }

  // 8. Disk verification after rollback
  const restoredBytes = fs.readFileSync(testFile);
  const restoredSha = computeSha256(restoredBytes);
  const restoredContent = restoredBytes.toString('utf8');

  console.log('\n[9. Disk Verification After Rollback]');
  console.log('Restored Size (bytes):', restoredBytes.length);
  console.log('Restored SHA-256:', restoredSha);
  console.log('Has hello():', restoredContent.includes('function hello'));
  console.log('Has recoveryTest():', restoredContent.includes('function recoveryTest'));

  if (restoredSha !== EXPECTED_BASELINE_SHA) {
    throw new Error(`Restored SHA mismatch! Expected ${EXPECTED_BASELINE_SHA}, got ${restoredSha}`);
  }
  if (restoredContent.includes('function recoveryTest')) {
    throw new Error('Restored file still contains recoveryTest()!');
  }
  if (!restoredContent.includes('function hello')) {
    throw new Error('Restored file missing hello()!');
  }

  // 9. Check manifest status on disk after rollback
  const reloadedManifest = checkpointService.loadManifest(project.id, checkpointId);
  console.log('Manifest status after rollback:', reloadedManifest?.status);
  if (reloadedManifest?.status !== 'rolled_back') {
    throw new Error(`Expected status rolled_back, got ${reloadedManifest?.status}`);
  }

  // 10. Check getPendingCheckpoint returns null now
  const pendingAfterRollback = checkpointService.getPendingCheckpoint(project.id);
  console.log('Pending checkpoint after rollback:', pendingAfterRollback);
  if (pendingAfterRollback !== null) {
    throw new Error('getPendingCheckpoint should return null after rollback!');
  }

  await inference.unloadModel();
  console.log('\n=== REAL HARDWARE & FILESYSTEM QA PASSED 100% BIT-FOR-BIT ===\n');
}

runQa().catch((err) => {
  console.error('Fatal QA error:', err);
  process.exit(1);
});
