/**
 * CUSTOM AG-UI event: the tier this turn runs at. A thread that went to high
 * stays there until its next chapter, so a Normal pick can come back as
 * `high` (source `sticky`); the composer shows the thread's tier from this.
 */
export const ENGENTY_EFFORT_RESOLVED_EVENT = "engenty.effort.resolved";

export type EngentyResolvedEffort = "normal" | "high";

export interface EngentyEffortResolvedPayload {
  effort: EngentyResolvedEffort;
  /** Graded model id actually bound for this turn, when known. */
  model_id?: string | null;
  reason?: string;
  /** Why this tier — picked | sticky | agent | ceiling | heuristic. */
  source?: string;
}

export function readEngentyEffortResolvedEventValue(
  value: unknown
): EngentyEffortResolvedPayload | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const effort = record.effort;
  if (effort !== "normal" && effort !== "high") {
    return null;
  }
  const modelId = record.model_id;
  return {
    effort,
    ...(typeof modelId === "string" && modelId.trim()
      ? { model_id: modelId.trim() }
      : modelId === null
        ? { model_id: null }
        : {}),
    ...(typeof record.source === "string" && record.source.trim()
      ? { source: record.source.trim() }
      : {}),
    ...(typeof record.reason === "string" && record.reason.trim()
      ? { reason: record.reason.trim() }
      : {}),
  };
}
