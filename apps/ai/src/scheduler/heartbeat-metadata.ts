// Metadata contract between Engenty and the Mastra heartbeats that back it.
// Every heartbeat the scheduler owns carries this under `metadata.engenty`;
// heartbeats without it are not ours and are left alone.

export type EngentyHeartbeatMetadata =
  | { kind: "trigger"; tenantId: string; triggerId: string }
  | { kind: "system-job"; jobId: string; tenantId: string };

export function buildHeartbeatMetadata(
  meta: EngentyHeartbeatMetadata
): Record<string, unknown> {
  return { engenty: meta };
}

export function readHeartbeatMetadata(
  metadata: Record<string, unknown> | undefined
): EngentyHeartbeatMetadata | null {
  const engenty = metadata?.engenty as
    | Partial<EngentyHeartbeatMetadata>
    | undefined;
  if (!engenty || typeof engenty !== "object") {
    return null;
  }
  if (
    engenty.kind === "trigger" &&
    typeof (engenty as { triggerId?: unknown }).triggerId === "string" &&
    typeof engenty.tenantId === "string"
  ) {
    return engenty as Extract<EngentyHeartbeatMetadata, { kind: "trigger" }>;
  }
  if (
    engenty.kind === "system-job" &&
    typeof (engenty as { jobId?: unknown }).jobId === "string" &&
    typeof engenty.tenantId === "string"
  ) {
    return engenty as Extract<EngentyHeartbeatMetadata, { kind: "system-job" }>;
  }
  return null;
}
