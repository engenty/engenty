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

// Turns the run route has decided to start whose loop is not lent yet —
// workspace, model and agent assembly take a few seconds, and a correction
// typed right after sending lands in exactly that gap.
interface StartingThreadRun {
  expiresAt: number;
  registered: Promise<void>;
  resolve: () => void;
}
const starting = new Map<string, StartingThreadRun>();

/** How long a steer waits for a starting turn to lend its loop. */
const STARTING_WAIT_MS = 15_000;
/** How long a steer keeps offering itself to a loop that is not live yet. */
const LOOP_WAIT_MS = 5000;
const LOOP_RETRY_MS = 250;

/**
 * The run route is starting a turn on this thread: a steer arriving before
 * the loop is lent waits for it instead of falling back to the queue. The
 * returned release ends the wait when the turn never got that far.
 */
export function noteThreadRunStarting(threadId: string): () => void {
  let resolve: () => void = () => undefined;
  const registered = new Promise<void>((done) => {
    resolve = done;
  });
  const entry: StartingThreadRun = {
    expiresAt: Date.now() + STARTING_WAIT_MS,
    registered,
    resolve,
  };
  starting.set(threadId, entry);
  return () => {
    if (starting.get(threadId) === entry) {
      starting.delete(threadId);
    }
    entry.resolve();
  };
}

export function registerActiveThreadRun(
  threadId: string,
  run: ActiveThreadRun
): () => void {
  active.set(threadId, run);
  const pending = starting.get(threadId);
  starting.delete(threadId);
  pending?.resolve();
  return () => {
    if (active.get(threadId)?.runId === run.runId) {
      active.delete(threadId);
    }
  };
}

export function getActiveThreadRun(threadId: string): ActiveThreadRun | null {
  return active.get(threadId) ?? null;
}

/** A run holds this thread, or is about to — a steer would reach it. */
export function hasActiveOrStartingThreadRun(threadId: string): boolean {
  const pending = starting.get(threadId);
  return (
    active.has(threadId) || Boolean(pending && pending.expiresAt >= Date.now())
  );
}

interface SendMessageResult {
  accepted?: Promise<{ action?: string }>;
}

/** One part of a steered message — Mastra's signal `contents` shape. */
export type SteerContentPart =
  | { text: string; type: "text" }
  | { data: string; filename?: string; mediaType: string; type: "file" };

/**
 * What a steered message's durable row needs, riding on the signal Mastra
 * persists (`content.metadata.signal.metadata[STEERED_MESSAGE_KEY]`). The
 * memory storage writes the row from it when the turn flushes — in order,
 * after what the agent said before it — under the client's id, as the person
 * who sent it: their words and storage-key attachment parts, not the inline
 * bytes and extracted document text the model got.
 */
export const STEERED_MESSAGE_KEY = "engenty_steered";

export interface SteeredMessageMetadata {
  attachment_parts?: readonly unknown[];
  author_user_id?: string | null;
  message_id: string;
  /** The person's own words — the signal also carries model-only text. */
  text: string;
}

interface SteerableAgent {
  sendMessage: (
    message: {
      attributes?: Record<string, string>;
      contents: string | SteerContentPart[];
      metadata?: Record<string, unknown>;
    },
    target: {
      ifIdle?: { behavior: "discard" | "persist" | "wake" };
      resourceId: string;
      threadId: string;
    }
  ) => SendMessageResult;
}

/**
 * Put a person's message into the run answering on this thread right now.
 * `parts` carries what the words alone cannot: image files for the model and
 * the extracted text of documents.
 * `steered: false` when there is none, or when Mastra found the thread idle
 * after all (the run settled between the lookup and the send) — the caller
 * then starts a turn of its own, as it always did.
 */
export async function steerActiveThreadRun(input: {
  authorName?: string;
  /** The durable row's identity; without it the message is not persisted. */
  durable?: SteeredMessageMetadata | null;
  parts?: readonly SteerContentPart[];
  text: string;
  threadId: string;
}): Promise<{ runId: string; steered: true } | { steered: false }> {
  const run = await activeOrStartingRun(input.threadId);
  const agent = run?.agent as SteerableAgent | undefined;
  if (!(run && agent && typeof agent.sendMessage === "function")) {
    return { steered: false };
  }
  // Lent a moment before Mastra's loop goes live, a run answers "idle" —
  // which here means "not yet" for as long as it still holds the thread.
  const deadline = Date.now() + LOOP_WAIT_MS;
  for (;;) {
    const action = await offerToLoop(agent, run, input);
    if (action === "deliver") {
      return { runId: run.runId, steered: true };
    }
    if (
      action !== "discard" ||
      Date.now() > deadline ||
      active.get(input.threadId) !== run
    ) {
      return { steered: false };
    }
    await delay(LOOP_RETRY_MS);
  }
}

async function activeOrStartingRun(
  threadId: string
): Promise<ActiveThreadRun | undefined> {
  const run = active.get(threadId);
  const pending = starting.get(threadId);
  if (run || !pending || pending.expiresAt < Date.now()) {
    return run;
  }
  await Promise.race([
    pending.registered,
    delay(pending.expiresAt - Date.now()),
  ]);
  return active.get(threadId);
}

async function offerToLoop(
  agent: SteerableAgent,
  run: ActiveThreadRun,
  input: Parameters<typeof steerActiveThreadRun>[0]
): Promise<string | undefined> {
  const result = agent.sendMessage(
    {
      contents:
        input.parts && input.parts.length > 0
          ? [
              ...(input.text
                ? [{ text: input.text, type: "text" as const }]
                : []),
              ...input.parts,
            ]
          : input.text,
      ...(input.authorName ? { attributes: { name: input.authorName } } : {}),
      ...(input.durable
        ? { metadata: { [STEERED_MESSAGE_KEY]: input.durable } }
        : {}),
    },
    {
      ifIdle: { behavior: "discard" },
      resourceId: run.resourceId,
      threadId: input.threadId,
    }
  );
  const accepted = await result.accepted?.catch(() => ({ action: "error" }));
  return accepted?.action;
}

function delay(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, Math.max(0, ms)));
}

/** @internal test seam */
export function resetActiveThreadRunsForTests(): void {
  active.clear();
  starting.clear();
}
