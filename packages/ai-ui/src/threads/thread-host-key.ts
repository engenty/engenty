/** `route_context` field persisted on `ai.agent_session` for list filtering by UI host. */
export const ENGENTY_THREAD_HOST_KEY_FIELD = "host_key" as const;

export function readThreadHostKeyFromRouteContext(
  routeContext: Record<string, unknown> | null | undefined
): string | null {
  const value = routeContext?.[ENGENTY_THREAD_HOST_KEY_FIELD];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function mergeRouteContextWithHostKey(
  routeContext: Record<string, unknown> | undefined,
  hostKey: string
): Record<string, unknown> {
  return {
    ...(routeContext ?? {}),
    [ENGENTY_THREAD_HOST_KEY_FIELD]: hostKey.trim(),
  };
}

export function sessionMatchesHostKey(params: {
  agentId: string;
  hostKey: string;
  routeContext: Record<string, unknown>;
}): boolean {
  const stored = readThreadHostKeyFromRouteContext(params.routeContext);
  return stored === params.hostKey;
}
