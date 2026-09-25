// Shared envelope handed to every outcome provider. Wire shape is snake_case
// so a plugin operation sees the same payload the rest of the backend uses.
import type { ResultCard } from "../../threads/artifact-teaser.js";
import type { RunOutcome } from "../../workflows/run-outcome.js";

export interface OutcomeArtifactRef {
  /** The chat card for the asset. */
  card?: ResultCard | null;
  id: string;
  title: string;
}

export interface OutcomeEnvelope {
  agent_id: string;
  artifact: OutcomeArtifactRef | null;
  awaiting_review: boolean;
  body: string | null;
  /** The graph run itself — `run_id` is the fire (the request) it belongs to. */
  graph_run_id: string | null;
  outcome: RunOutcome | null;
  reason: string | null;
  routine_id: string;
  routine_name: string;
  run_id: string;
  space_id: string | null;
  status: "completed" | "failed";
  summary: string | null;
  /** The routine's chat, where the run's transcript is. */
  thread_id: string;
}

export function outcomeEnvelopeToWire(
  envelope: OutcomeEnvelope
): Record<string, unknown> {
  return {
    agent_id: envelope.agent_id,
    artifact: envelope.artifact,
    awaiting_review: envelope.awaiting_review,
    body: envelope.body,
    graph_run_id: envelope.graph_run_id,
    outcome: envelope.outcome,
    reason: envelope.reason,
    routine_id: envelope.routine_id,
    routine_name: envelope.routine_name,
    run_id: envelope.run_id,
    space_id: envelope.space_id,
    status: envelope.status,
    summary: envelope.summary,
    thread_id: envelope.thread_id,
  };
}
