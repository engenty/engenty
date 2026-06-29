/**
 * Neutral lifecycle events emitted during copilot orchestration.
 *
 * Use for: logging, analytics, UI progress. Emitted when LOG_LEVEL=debug for
 * tool.started, tool.finished, coordinator.decision.
 */
export type RuntimeProgressEvent =
  | { type: "run.started"; run_id: string }
  | {
      type: "context.loaded";
      module_id: string;
      route_key: string;
      scope_summary?: string;
    }
  | {
      type: "coordinator.decision";
      agent_id: string;
      reason: "intent" | "context" | "sticky" | "fallback" | "requested";
      confidence: number;
      switch_candidate_agent_id?: string;
    }
  | {
      type: "tool.started";
      tool_name: string;
      input?: Record<string, unknown>;
    }
  | {
      type: "tool.finished";
      tool_name: string;
      latency_ms?: number;
      output?: unknown;
    }
  | { type: "run.completed"; run_id: string }
  | { type: "run.failed"; run_id?: string; error: string };
