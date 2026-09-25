// Shared envelope handed to every outcome provider. Wire shape is snake_case
// so a plugin operation sees the same payload the rest of the backend uses.
import type { RunOutcome } from "../../workflows/run-outcome.js";

export interface OutcomeArtifactRef {
  id: string;
  title: string;
}

export interface OutcomeEnvelope {
  agent_id: string;
  artifact: OutcomeArtifactRef | null;
  awaiting_review: boolean;
  body: string | null;
  outcome: RunOutcome | null;
  reason: string | null;
  routine_id: string;
  routine_name: string;
  run_id: string;
  space_id: string | null;
  status: "completed" | "failed";
  summary: string | null;
}

export function outcomeEnvelopeToWire(
  envelope: OutcomeEnvelope
): Record<string, unknown> {
  return {
    agent_id: envelope.agent_id,
    artifact: envelope.artifact,
    awaiting_review: envelope.awaiting_review,
    body: envelope.body,
    outcome: envelope.outcome,
    reason: envelope.reason,
    routine_id: envelope.routine_id,
    routine_name: envelope.routine_name,
    run_id: envelope.run_id,
    space_id: envelope.space_id,
    status: envelope.status,
    summary: envelope.summary,
  };
}
