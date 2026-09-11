// Metadata contract between Engenty and the Mastra schedules that back it.
// Every schedule the scheduler owns carries this under `metadata.engenty`;
// schedules without it are not ours and are left alone.
//
// Orphan cleanup matches on this marker — not on id prefixes — so both legacy
// `hb_*` rows and Mastra 1.50+ `agent_*`-prefixed rows are covered.

export type EngentyScheduleMetadata =
  // `triggerId` names the schedule trigger row this schedule is derived from.
  // Optional on read: rows stamped before routine_triggers existed carry only
  // the routine id, and the fire path resolves the trigger from the row.
  | { kind: "routine"; routineId: string; tenantId: string; triggerId?: string }
  | { kind: "system-job"; jobId: string; tenantId: string };

export function buildHeartbeatMetadata(
  meta: EngentyScheduleMetadata
): Record<string, unknown> {
  return { engenty: meta };
}

export function readHeartbeatMetadata(
  metadata: Record<string, unknown> | undefined
): EngentyScheduleMetadata | null {
  const engenty = metadata?.engenty as
    | Partial<EngentyScheduleMetadata>
    | undefined;
  if (!engenty || typeof engenty !== "object") {
    return null;
  }
  if (
    engenty.kind === "routine" &&
    typeof (engenty as { routineId?: unknown }).routineId === "string" &&
    typeof engenty.tenantId === "string"
  ) {
    return engenty as Extract<EngentyScheduleMetadata, { kind: "routine" }>;
  }
  if (
    engenty.kind === "system-job" &&
    typeof (engenty as { jobId?: unknown }).jobId === "string" &&
    typeof engenty.tenantId === "string"
  ) {
    return engenty as Extract<EngentyScheduleMetadata, { kind: "system-job" }>;
  }
  return null;
}
