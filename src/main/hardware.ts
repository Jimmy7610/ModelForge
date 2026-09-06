import os from 'node:os';
import { execFile } from 'node:child_process';
import { HardwareInfo } from '../shared/types';

let cachedGpuName: string | null = null;
let isDetectingGpu = false;

function detectGpuWindows(): Promise<string> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve('GPU detection pending');
    }

    // Lightweight PowerShell query to get primary GPU name
    const psCmd = 'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name';
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCmd],
      { timeout: 2000, windowsHide: true },
      (error, stdout) => {
        if (error || !stdout) {
          resolve('GPU detection pending');
          return;
        }

        const lines = stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        // Filter out basic display adapters if dedicated GPU is available
        const dedicated = lines.find((name) => /nvidia|geforce|radeon|arc/i.test(name));
        const picked = dedicated || lines[0] || 'GPU detection pending';
        resolve(picked);
      }
    );
  });
}

export async function getHardwareInfo(): Promise<HardwareInfo> {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU';
  const cpuCores = cpus.length;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const totalMemoryGB = Math.round((totalMem / (1024 * 1024 * 1024)) * 10) / 10;
  const freeMemoryGB = Math.round((freeMem / (1024 * 1024 * 1024)) * 10) / 10;
  const usedMemoryGB = Math.round((usedMem / (1024 * 1024 * 1024)) * 10) / 10;

  if (!cachedGpuName && !isDetectingGpu) {
    isDetectingGpu = true;
    detectGpuWindows()
      .then((name) => {
        cachedGpuName = name;
        isDetectingGpu = false;
      })
      .catch(() => {
        cachedGpuName = 'GPU detection pending';
        isDetectingGpu = false;
      });
  }

  const gpuName = cachedGpuName || 'GPU detection pending';
  const gpuStatus = gpuName === 'GPU detection pending' ? 'pending' : 'detected';

  return {
    os: `${os.type()} ${os.arch()}`,
    osRelease: os.release(),
    cpuModel,
    cpuCores,
    totalMemoryGB,
    freeMemoryGB,
    usedMemoryGB,
    gpuName,
    gpuStatus,
  };
}
