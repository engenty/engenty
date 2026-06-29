/** Stable lane key for transcript scroll + tool-call decision UI reset on thread change. */
export function resolveCopilotThreadScopeKey(
  activeThreadId: string | null | undefined,
  threadResetKey?: string | number | null
): string {
  const id = activeThreadId?.trim();
  if (id) {
    return id;
  }
  return `new-${threadResetKey ?? 0}`;
}
