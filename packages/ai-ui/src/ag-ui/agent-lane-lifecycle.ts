// Coarse EngentyAgent lane lifecycle for shell chrome (composer flap, cancel).
// AG-UI product paths derive from open interrupt + lane chat transport only.
// When `ai.agent_session_run` is wired on the lane, pass `runStatus` into
// `deriveAgentStatusTicker` — not a second lifecycle reducer here.

export type AgUiChatStatus = "ready" | "streaming" | "submitted" | "error";

export type AgentLaneLifecycle =
  | "idle"
  | "starting"
  | "running"
  | "needs_input"
  | "needs_approval"
  | "failed"
  | "completed_ready";

export interface DeriveAgentLaneLifecycleInput {
  awaitingInterrupt?: boolean;
  chatStatus: AgUiChatStatus;
  hasMessages: boolean;
}

export function deriveAgentLaneLifecycle(
  input: DeriveAgentLaneLifecycleInput
): AgentLaneLifecycle {
  if (input.awaitingInterrupt) {
    return "needs_approval";
  }
  if (input.chatStatus === "submitted") {
    return "starting";
  }
  if (input.chatStatus === "streaming") {
    return "running";
  }
  if (input.chatStatus === "error") {
    return "failed";
  }
  return input.hasMessages ? "completed_ready" : "idle";
}

export function isAgentLaneLifecycleActive(
  lifecycle: AgentLaneLifecycle
): boolean {
  return (
    lifecycle === "starting" ||
    lifecycle === "running" ||
    lifecycle === "needs_input" ||
    lifecycle === "needs_approval"
  );
}
