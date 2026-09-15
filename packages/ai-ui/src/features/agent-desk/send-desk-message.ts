// Send a message into a desk, DM or room from OUTSIDE its chat pane — the
// Space home card. The card used to park the text and follow it to the desk,
// which then had to mount, hydrate and get its transport ready before it could
// send; the words showed up seconds after Enter. Here the message is on the
// server before the page moves: the thread is created when the desk has none,
// the run is started, and this returns the moment the server accepts it. The
// run keeps going detached (thread-run-routes D1 — a dropped client never
// aborts a run), and the desk attaches to it on arrival through active-run
// recovery, with the person's turn already in the transcript it hydrates.
import { createAgUiSseParser, EventType } from "@engenty/ag-ui-bridge";
import {
  appsAiRequestHeaders,
  appsAiThreadRunsPath,
} from "../../ag-ui/apps-ai/apps-ai-api.js";
import { createAppsAiThread } from "../../ag-ui/apps-ai/apps-ai-transport.js";
import { buildAppsAiRunInput } from "../../ag-ui/apps-ai/build-apps-ai-run-input.js";
import type { EngentyAgUiRouteContext } from "../../ag-ui/engenty-ag-ui-route-context.js";

/** How long to wait for the server's RUN_STARTED before trusting the 200. */
const RUN_STARTED_WAIT_MS = 2500;

export interface SendDeskMessageInput {
  /** The desk's agent — needed only when the thread has to be created. */
  agentId?: string | null;
  hostKey: string;
  routeContext: EngentyAgUiRouteContext;
  serviceBaseUrl: string;
  text: string;
  /** The conversation to write into; null opens the desk's first one. */
  threadId: string | null;
  title?: string | null;
}

export interface SendDeskMessageResult {
  runId: string;
  threadId: string;
}

/**
 * Read the run stream only until the server says the run started, then let
 * the connection go. Everything after that is the desk's to show.
 */
async function awaitRunStarted(
  body: ReadableStream<Uint8Array>
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createAgUiSseParser();
  const deadline = Date.now() + RUN_STARTED_WAIT_MS;
  try {
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      for (const event of parser.push(
        decoder.decode(value, { stream: true })
      )) {
        if (event.type === EventType.RUN_STARTED) {
          return;
        }
        if (event.type === EventType.RUN_ERROR) {
          throw new Error(
            (event as { message?: string }).message ?? "run failed to start"
          );
        }
      }
    }
  } finally {
    void reader.cancel().catch(() => {
      // The server keeps the run; only this reader is done with it.
    });
  }
}

export async function sendDeskMessageInPlace(
  input: SendDeskMessageInput
): Promise<SendDeskMessageResult> {
  const text = input.text.trim();
  if (!text) {
    throw new Error("empty message");
  }
  let threadId = input.threadId;
  if (!threadId) {
    if (!input.agentId) {
      throw new Error("a desk without a conversation needs its agent");
    }
    const created = await createAppsAiThread({
      agentId: input.agentId,
      hostKey: input.hostKey,
      routeContext: input.routeContext,
      serviceBaseUrl: input.serviceBaseUrl,
      title: input.title ?? null,
    });
    threadId = created.id;
  }
  const runInput = buildAppsAiRunInput({
    frontendTools: [],
    message: {
      content: text,
      id: globalThis.crypto?.randomUUID?.() ?? `user-${Date.now()}`,
      role: "user",
    },
    pathname: input.routeContext.pathname ?? "",
    routeContext: input.routeContext,
    state: undefined,
    threadId,
  });
  const response = await fetch(
    appsAiThreadRunsPath(input.serviceBaseUrl, threadId),
    {
      body: JSON.stringify(runInput),
      headers: await appsAiRequestHeaders(),
      method: "POST",
    }
  );
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw Object.assign(
      new Error(`ai session run HTTP ${response.status}: ${raw.slice(0, 500)}`),
      { status: response.status }
    );
  }
  if (response.body) {
    await awaitRunStarted(response.body);
  }
  return { runId: runInput.runId, threadId };
}
