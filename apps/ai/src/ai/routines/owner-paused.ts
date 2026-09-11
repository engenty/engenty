// The owner sweep's pause marker.
//
// The heartbeat pauses a routine whose owner the registry cannot find and
// stamps `last_result` with this marker; the same sweep lifts the pause the
// moment the owner resolves again. A person's own pause carries no marker, so
// the sweep never overrides one — and a person's toggle clears the marker so
// their decision, not the sweep's, is what stands afterwards.

const PREFIX = "paused — owner '";

export function ownerMissingResult(agentId: string): string {
  return `${PREFIX}${agentId}' does not resolve in the registry`;
}

export function ownerResolvedResult(agentId: string): string {
  return `resumed — owner '${agentId}' resolves again`;
}

export function isOwnerMissingResult(lastResult: string | null): boolean {
  return typeof lastResult === "string" && lastResult.startsWith(PREFIX);
}
