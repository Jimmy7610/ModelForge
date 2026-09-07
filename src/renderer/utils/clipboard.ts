/**
 * Central Clipboard Utility for Model Forge
 *
 * Robust clipboard integration:
 * 1. Invokes typed privileged Electron IPC via window.modelForge.copyText (uses clipboard.writeText)
 * 2. Gracefully falls back to browser navigator.clipboard if window.modelForge is unavailable (e.g. tests, preview)
 */

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof text !== 'string') {
    return false;
  }

  // 1. Primary privileged Electron IPC bridge
  try {
    if (typeof window !== 'undefined' && window.modelForge?.copyText) {
      const result = await window.modelForge.copyText(text);
      if (result === true) {
        return true;
      }
    }
  } catch (err) {
    console.warn('[ModelForge Clipboard] IPC copyText failed, falling back to navigator.clipboard:', err);
  }

  // 2. Secondary browser standard clipboard fallback
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.error('[ModelForge Clipboard] navigator.clipboard.writeText failed:', err);
  }

  return false;
}
