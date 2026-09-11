// The runs this process has in flight, by thread — so a person's message
// can go INTO the run that is already answering in that room instead of
// waiting behind it (PLAN-agent-rooms.md R3, Grok Bot: "a direct message
// from you takes priority over background work and can redirect the current
// turn").
//
// Mastra keeps its own register of active thread runs, but keyed per pubsub
// and reachable only through an Agent instance; the lanes hold that instance
// while they stream, so they lend it here for the duration. In-process by
// nature, like the room queue: a second apps/ai instance needs a shared
// Mastra pubsub before either holds across processes.

export interface ActiveThreadRun {
  /** The assembled Mastra agent driving the run — `sendMessage` lives on it. */
  agent: unknown;
  resourceId: string;
  runId: string;
}

const active = new Map<string, ActiveThreadRun>();

export function registerActiveThreadRun(
  threadId: string,
  run: ActiveThreadRun
): () => void {
  active.set(threadId, run);
  return () => {
    if (active.get(threadId)?.runId === run.runId) {
      active.delete(threadId);
    }
  };
}

export function getActiveThreadRun(threadId: string): ActiveThreadRun | null {
  return active.get(threadId) ?? null;
}

interface SendMessageResult {
  accepted?: Promise<{ action?: string }>;
}

interface SteerableAgent {
  sendMessage: (
    message: { attributes?: Record<string, string>; contents: string },
    target: {
      ifIdle?: { behavior: "discard" | "persist" | "wake" };
      resourceId: string;
      threadId: string;
    }
  ) => SendMessageResult;
}

/**
 * Put a person's words into the run answering on this thread right now.
 * `steered: false` when there is none, or when Mastra found the thread idle
 * after all (the run settled between the lookup and the send) — the caller
 * then starts a turn of its own, as it always did.
 */
export async function steerActiveThreadRun(input: {
  authorName?: string;
  text: string;
  threadId: string;
}): Promise<{ runId: string; steered: true } | { steered: false }> {
  const run = active.get(input.threadId);
  const agent = run?.agent as SteerableAgent | undefined;
  if (!(run && agent && typeof agent.sendMessage === "function")) {
    return { steered: false };
  }
  const result = agent.sendMessage(
    {
      contents: input.text,
      ...(input.authorName ? { attributes: { name: input.authorName } } : {}),
    },
    {
      ifIdle: { behavior: "discard" },
      resourceId: run.resourceId,
      threadId: input.threadId,
    }
  );
  const accepted = await result.accepted?.catch(() => ({ action: "error" }));
  return accepted?.action === "deliver"
    ? { runId: run.runId, steered: true }
    : { steered: false };
}

/** @internal test seam */
export function resetActiveThreadRunsForTests(): void {
  active.clear();
}
