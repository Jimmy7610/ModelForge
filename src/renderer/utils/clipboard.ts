/**
 * Central Clipboard Utility for Model Forge
 *
 * Robust clipboard integration:
 * 1. Invokes typed privileged Electron IPC via window.modelForge.copyText (uses clipboard.writeText)
 * 2. In Electron runtime: if bridge is missing or fails, log controlled error and fail closed (do NOT silently mask with browser clipboard)
 * 3. Gracefully falls back to browser navigator.clipboard ONLY in non-Electron preview/test environments
 */

export function isElectronRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const isRendererProcess = Boolean((window as unknown as { process?: { type?: string } }).process?.type === 'renderer');
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const hasElectronUserAgent = typeof userAgent === 'string' && userAgent.includes('Electron');
  return Boolean(isRendererProcess || hasElectronUserAgent);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof text !== 'string') {
    return false;
  }

  const inElectron = isElectronRuntime();

  if (inElectron) {
    if (!window.modelForge?.copyText) {
      console.error(
        '[ModelForge Clipboard] Controlled failure: running inside Electron runtime but window.modelForge.copyText is missing.'
      );
      return false;
    }

    try {
      const result = await window.modelForge.copyText(text);
      return result === true;
    } catch (err) {
      console.error('[ModelForge Clipboard] IPC copyText failed in Electron runtime:', err);
      return false;
    }
  }

  // Non-Electron browser/test fallback or test mocks
  if (typeof window !== 'undefined' && window.modelForge?.copyText) {
    try {
      const result = await window.modelForge.copyText(text);
      if (result === true) return true;
    } catch (err) {
      console.warn('[ModelForge Clipboard] IPC copyText threw in fallback environment:', err);
    }
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.error('[ModelForge Clipboard] navigator.clipboard.writeText failed in browser environment:', err);
  }

  return false;
}
