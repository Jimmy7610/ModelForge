import os from 'node:os';
import { getLlama, Llama, LlamaLogLevel } from 'node-llama-cpp';
import { InferenceRuntimeInfo, InferenceBackendType } from '../../shared/types';

let cachedLlama: Llama | null = null;

/**
 * Normalizes backend string from llama.gpu
 */
function resolveBackendType(gpu: string | boolean | undefined): InferenceBackendType {
  if (gpu === 'cuda') return 'cuda';
  if (gpu === 'vulkan') return 'vulkan';
  if (gpu === 'metal') return 'metal';
  if (gpu === false) return 'cpu';
  return 'unknown';
}

/**
 * Initializes or retrieves the local Llama native runtime.
 * Fallback chain: auto (CUDA) -> Vulkan -> CPU (gpu: false).
 * Enforces zero downloads and zero runtime compilation:
 * build: 'never', skipDownload: true.
 */
export async function getOrCreateLlamaInstance(): Promise<Llama> {
  if (cachedLlama && !cachedLlama.disposed) {
    return cachedLlama;
  }

  // 1. Try 'auto' (preferred accelerator)
  try {
    const llama = await getLlama({
      gpu: 'auto',
      build: 'never',
      skipDownload: true,
      logLevel: LlamaLogLevel.warn,
    });
    cachedLlama = llama;
    return llama;
  } catch (errAuto) {
    console.warn('[ModelForge Inference] Auto GPU initialization failed, attempting Vulkan fallback...', errAuto);
  }

  // 2. Fallback to Vulkan
  try {
    const llama = await getLlama({
      gpu: 'vulkan',
      build: 'never',
      skipDownload: true,
      logLevel: LlamaLogLevel.warn,
    });
    cachedLlama = llama;
    return llama;
  } catch (errVulkan) {
    console.warn('[ModelForge Inference] Vulkan initialization failed, falling back to CPU...', errVulkan);
  }

  // 3. Fallback to CPU only
  try {
    const llama = await getLlama({
      gpu: false,
      build: 'never',
      skipDownload: true,
      logLevel: LlamaLogLevel.warn,
    });
    cachedLlama = llama;
    return llama;
  } catch (errCpu) {
    const msg = errCpu instanceof Error ? errCpu.message : String(errCpu);
    console.error('[ModelForge Inference] Failed to initialize native llama runtime on any backend:', msg);
    throw new Error(`Inference runtime initialization failed: ${msg}`);
  }
}

/**
 * Queries current hardware and VRAM/RAM metrics from the native engine.
 */
export async function getInferenceRuntimeInfo(): Promise<InferenceRuntimeInfo> {
  const totalRam = os.totalmem();
  const freeRam = os.freemem();

  try {
    const llama = await getOrCreateLlamaInstance();
    const backend = resolveBackendType(llama.gpu);

    let gpuName: string | null = null;
    try {
      const deviceNames = await llama.getGpuDeviceNames();
      if (Array.isArray(deviceNames) && deviceNames.length > 0) {
        gpuName = deviceNames[0];
      }
    } catch {
      // Non-critical, fallback to null
    }

    let vramTotal = 0;
    let vramFree = 0;
    let vramUsed = 0;

    try {
      const vramState = await llama.getVramState();
      if (vramState) {
        vramTotal = vramState.total || 0;
        vramFree = vramState.free || 0;
        vramUsed = vramState.used || 0;
      }
    } catch {
      // CPU backend might not provide VRAM
    }

    return {
      status: 'ready',
      backend,
      gpuName,
      vramTotalBytes: vramTotal,
      vramFreeBytes: vramFree,
      vramUsedBytes: vramUsed,
      ramTotalBytes: totalRam,
      ramFreeBytes: freeRam,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      backend: 'unknown',
      gpuName: null,
      vramTotalBytes: 0,
      vramFreeBytes: 0,
      vramUsedBytes: 0,
      ramTotalBytes: totalRam,
      ramFreeBytes: freeRam,
      errorMessage: msg,
    };
  }
}

/**
 * Disposes the active runtime instance.
 */
export async function disposeLlamaInstance(): Promise<void> {
  if (cachedLlama && !cachedLlama.disposed) {
    try {
      await cachedLlama.dispose();
    } catch (err) {
      console.error('[ModelForge Inference] Error disposing llama instance:', err);
    }
  }
  cachedLlama = null;
}
