/** Minimal transcript row for copilot status + UI (AG-UI message compatible). */
export interface AgentTurnMessageLike {
  /**
   * A desk-room row that points at an agent pair's thread — the "Message
   * from …" line — names the colleague and the thread the exchange lives in.
   */
  agentMessage?: { agentId: string; threadId: string } | null;
  /**
   * A row saying a built App version is waiting for a person to activate it —
   * names the preview artifact the row renders, review banner and all.
   */
  appRelease?: { artifactId: string } | null;
  authorName?: string | null;
  parts?: readonly unknown[];
  role: string;
}
