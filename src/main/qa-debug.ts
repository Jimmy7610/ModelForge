/**
 * Configures QA remote debugging strictly for development/testing.
 * Guarantees that packaged production builds can never enable remote debugging,
 * generic REMOTE_DEBUGGING_PORT is ignored, and listening address is bound strictly to loopback (127.0.0.1).
 */
export function configureQaDebugging(
  appInstance?: {
    isPackaged?: boolean;
    commandLine?: { appendSwitch: (key: string, val: string) => void };
  },
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!appInstance || appInstance.isPackaged) {
    return false;
  }
  const qaPort = env.MODELFORGE_QA_REMOTE_DEBUGGING_PORT;
  if (!qaPort) {
    return false;
  }
  appInstance.commandLine?.appendSwitch('remote-debugging-port', qaPort);
  appInstance.commandLine?.appendSwitch('remote-debugging-address', '127.0.0.1');
  return true;
}
