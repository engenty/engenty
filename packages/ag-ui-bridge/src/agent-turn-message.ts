/** Minimal transcript row for copilot status + UI (AG-UI message compatible). */
export interface AgentTurnMessageLike {
  /**
   * A desk-room row that points at an agent pair's thread — the "Message
   * from …" line — names the colleague and the thread the exchange lives in.
   */
  agentMessage?: {
    agentId: string;
    /** For a `reply`: artifacts the desk agent wrote or presented answering. */
    artifactIds?: string[];
    /**
     * `message` (default): a colleague's brief, drawn as "Message from …".
     * `reply`: the desk agent's own answer to it, cut to a preview and drawn
     * as a quote with a way into the pair thread.
     */
    kind?: "message" | "reply";
    threadId: string;
  } | null;
  /** Whose copilot wrote this, when the author is someone's alter ego. */
  alterEgoUserName?: string | null;
  /**
   * A row saying a built App version is waiting for a person to activate it —
   * names the preview artifact the row renders, review banner and all.
   */
  appRelease?: { artifactId: string } | null;
  /** The agent that wrote an assistant row (`metadata.author_agent_id`). */
  authorAgentId?: string | null;
  authorName?: string | null;
  /** When the row was written; absent for one this session just streamed. */
  createdAt?: string | null;
  parts?: readonly unknown[];
  role: string;
  /**
   * A line the platform posts about a routine (created, started). The chat
   * words it in the reader's language; the row's text is the fallback.
   */
  routineNotice?: RoutineNotice | null;
}

export type RoutineNotice =
  | {
      event: boolean;
      grants: number;
      kind: "created";
      name: string;
      schedule: { cron: string; timezone: string | null } | null;
      workflowName: string | null;
    }
  | { kind: "started"; name: string };
