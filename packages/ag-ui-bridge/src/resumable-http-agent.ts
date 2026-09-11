import type { BaseEvent, RunAgentInput } from "@ag-ui/client";
import { HttpAgent, type HttpAgentConfig } from "@ag-ui/client";
import type { AgentCapabilities } from "@ag-ui/core";
import { Observable } from "rxjs";
import { createAgUiSseParser } from "./ag-ui-sse.js";

/**
 * An `HttpAgent` that can reattach to a run it was disconnected from.
 *
 * WHY: AG-UI declares the capability — `TransportCapabilities.resumable`, "the agent
 * supports resuming interrupted streams via sequence numbers" — and gives clients the
 * verb for it, `AbstractAgent.connect()` / `connectAgent()`. But `AbstractAgent`'s
 * `connect()` throws `AGUIConnectNotImplementedError` and stock `HttpAgent` never
 * overrides it, so out of the box a dropped connection loses the run: one POST, one
 * SSE, one shot. A run that keeps executing server-side becomes unreachable.
 *
 * This fills in the missing implementation against the declared surface. It needs
 * exactly one thing from the server that `@ag-ui/encoder` does not currently emit:
 * an `id:` on each SSE frame carrying the sequence number. See `encodeAgUiSseEvent`.
 *
 * `run()` is deliberately NOT overridden — the initial POST is stock behaviour and
 * has no reason to differ. Only the reattach is new.
 */
export interface ResumableHttpAgentConfig extends HttpAgentConfig {
  /**
   * URL that replays a run from `lastEventId` (exclusive) and then continues live.
   * Null means "from the beginning" — the first attach, or a cursor that was lost.
   */
  streamUrl: (runId: string, lastEventId: string | null) => string;
}

export class ResumableHttpAgent extends HttpAgent {
  readonly #streamUrl: ResumableHttpAgentConfig["streamUrl"];
  /** Cursor of the last frame this agent actually saw, across reconnects. */
  #lastEventId: string | null = null;
  /** The run to reattach to. Set by the caller; `connect()` has no other source. */
  runId: string | null = null;

  constructor(config: ResumableHttpAgentConfig) {
    super(config);
    this.#streamUrl = config.streamUrl;
  }

  /** Cursor a caller can persist and hand back via `resumeFrom`. */
  get lastEventId(): string | null {
    return this.#lastEventId;
  }

  resumeFrom(lastEventId: string | null): void {
    this.#lastEventId = lastEventId;
  }

  /**
   * Reattach to `runId` and stream the rest of it.
   *
   * Called by `AbstractAgent.connectAgent()`, which applies the events to agent
   * state exactly as a live run would — so a reattached run and a fresh one are
   * indistinguishable to whatever is rendering.
   */
  protected connect(_input: RunAgentInput): Observable<BaseEvent> {
    const runId = this.runId;
    if (!runId) {
      // Not AGUIConnectNotImplementedError: the capability IS implemented, the
      // caller just has not said which run. connectAgent() swallows that error as
      // "no connect support", which would hide a caller bug as a missing feature.
      throw new Error(
        "ResumableHttpAgent.connect() requires `runId` — set it before connecting."
      );
    }
    const url = this.#streamUrl(runId, this.#lastEventId);
    const headers = { ...this.headers };

    return new Observable<BaseEvent>((subscriber) => {
      const abort = new AbortController();
      void (async () => {
        try {
          const res = await this.fetch(url, {
            headers: {
              ...headers,
              Accept: "text/event-stream",
              // The standard resume header, so a server implementing the SSE
              // contract needs no query-param convention from us.
              ...(this.#lastEventId
                ? { "Last-Event-ID": this.#lastEventId }
                : {}),
            },
            signal: abort.signal,
          });
          if (!(res.ok && res.body)) {
            throw new Error(`connect ${res.status}: ${await res.text()}`);
          }
          const parser = createAgUiSseParser();
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            for (const event of parser.push(
              decoder.decode(value, { stream: true })
            )) {
              subscriber.next(event as BaseEvent);
            }
            // Advance only after the frames are delivered: a cursor moved ahead of
            // what the subscriber has seen would skip those events on the next
            // reconnect.
            this.#lastEventId = parser.lastEventId() ?? this.#lastEventId;
          }
          for (const event of parser.flush()) {
            subscriber.next(event as BaseEvent);
          }
          subscriber.complete();
        } catch (error) {
          if (!abort.signal.aborted) {
            subscriber.error(error);
          }
        }
      })();
      return () => abort.abort();
    });
  }

  getCapabilities(): Promise<AgentCapabilities> {
    return Promise.resolve({
      transport: { resumable: true, streaming: true },
    });
  }
}
