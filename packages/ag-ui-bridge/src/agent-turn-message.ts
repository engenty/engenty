/** Minimal transcript row for copilot status + UI (AG-UI message compatible). */
export interface AgentTurnMessageLike {
  parts?: readonly unknown[];
  role: string;
}
