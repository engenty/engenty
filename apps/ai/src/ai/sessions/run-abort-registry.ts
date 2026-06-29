const activeRunAbortControllers = new Map<string, AbortController>();

export function registerActiveRunAbortController(runId: string): {
  abortSignal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  activeRunAbortControllers.set(runId, controller);
  return {
    abortSignal: controller.signal,
    cleanup: () => {
      activeRunAbortControllers.delete(runId);
    },
  };
}

export function linkClientAbortSignal(
  runId: string,
  clientSignal: AbortSignal
): () => void {
  if (clientSignal.aborted) {
    abortActiveRun(runId);
    return () => undefined;
  }
  const onAbort = () => {
    abortActiveRun(runId);
  };
  clientSignal.addEventListener("abort", onAbort);
  return () => {
    clientSignal.removeEventListener("abort", onAbort);
  };
}

export function abortActiveRun(runId: string): boolean {
  const controller = activeRunAbortControllers.get(runId);
  if (!controller || controller.signal.aborted) {
    return false;
  }
  controller.abort();
  return true;
}

export function isActiveRunAbortRequested(runId: string): boolean {
  return activeRunAbortControllers.get(runId)?.signal.aborted ?? false;
}
