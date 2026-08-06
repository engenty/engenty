/**
 * CUSTOM AG-UI event: Auto effort finished sizing this turn.
 * The composer still shows "Auto"; the client uses this to toast and briefly
 * flash the resolved tier on the effort control.
 */
export const ENGENTY_EFFORT_RESOLVED_EVENT = "engenty.effort.resolved";

export type EngentyResolvedEffort = "low" | "medium" | "high";

export interface EngentyEffortResolvedPayload {
  effort: EngentyResolvedEffort;
  /** Graded model id actually bound for this turn, when known. */
  model_id?: string | null;
  reason?: string;
  /** How Auto decided — heuristic | router | fallback | ceiling. */
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
  if (effort !== "low" && effort !== "medium" && effort !== "high") {
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
