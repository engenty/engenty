// One live CDP session per user browser container, and the SEAT that decides
// who drives it (PLAN-user-browser.md §2.3, D10).
//
// Mastra's `AgentBrowser` connects over `cdpUrl`, owns the Playwright page,
// the ref-based tools and the screencast. What it has no opinion on is
// arbitration: a tool call and an injected mouse event hit the same page. The
// seat lives here and is enforced at the two doors we own — the tool wrapper
// (`user-browser-tools.ts`) and the stream handler (`browser-stream-ws.ts`).
//
// Rules: a human taking over fails the agent's in-flight step
// (`interrupted_by_user`); an agent call while a human holds the seat returns
// `held_by_user` at once, never queues; an agent takes the seat per tool call
// and drops it at run end or after SEAT_IDLE_MS without a call.

import { createLogger } from "@engenty/telemetry";
import { AgentBrowser, type BrowserToolName } from "@mastra/agent-browser";

import {
  buildUserBrowserSandboxId,
  resolveUserBrowserCdpEndpoint,
  setUserBrowserStopListener,
  type UserBrowserIdentity,
} from "../sandbox/space-browser.js";

const logger = createLogger({ name: "apps/ai/user-browser-registry" });

/** An agent that stops calling tools loses the seat after this long. */
const SEAT_IDLE_MS = 60_000;

/**
 * Mastra tools kept off the agent: none. `browser_evaluate` is ON (D13
 * reversed 2026-09-11: the agent needs it for hidden DOM); recording tools
 * are opt-in in Mastra and never enabled here. Every call, evaluate
 * included, still passes the wrapper — seat, unattended gate, audit event
 * with the redacted script.
 */
export const USER_BROWSER_EXCLUDED_TOOLS: readonly BrowserToolName[] = [];

export type SeatHolder = "user" | { runId: string } | null;

interface Seat {
  holder: SeatHolder;
  idleTimer: NodeJS.Timeout | null;
  /** Resolved when a human takes the seat — races the agent's in-flight step. */
  interrupt: { promise: Promise<void>; resolve: () => void } | null;
  sinceMs: number;
}

interface Entry {
  browser: AgentBrowser | null;
  identity: UserBrowserIdentity;
  sandboxId: string;
  seat: Seat;
}

const entries = new Map<string, Entry>();

function newSeat(): Seat {
  return { holder: null, idleTimer: null, interrupt: null, sinceMs: 0 };
}

function entryFor(identity: UserBrowserIdentity): Entry {
  const sandboxId = buildUserBrowserSandboxId(identity);
  let entry = entries.get(sandboxId);
  if (!entry) {
    entry = { browser: null, identity, sandboxId, seat: newSeat() };
    entries.set(sandboxId, entry);
  }
  return entry;
}

/**
 * The Mastra browser for this container, created on first use. `scope:
 * 'shared'` is what `cdpUrl` requires; there is one page context per
 * container and it is the user's. `headless` only labels the config — the
 * container decides how Chromium runs.
 */
/**
 * Make it impossible for Mastra to signal a host process on the browser's
 * behalf.
 *
 * `AgentBrowser` asks the connected Chromium for its process id over CDP
 * (`SystemInfo.getProcessInfo`) and, on disconnect or `close()`, runs
 * `process.kill(-pid, "SIGKILL")` to reap the process group it believes it
 * launched. Our Chromium is a CONTAINER's PID 1, so that call is
 * `kill(-1)` on the HOST — every process the apps/ai user owns. That took
 * a developer's whole desktop down twice (2026-09-10 23:03, 2026-09-11
 * 08:04). The PID fields are replaced by write-ignoring properties, so the
 * kill helper always sees `undefined` and returns without signalling.
 * Whatever reaps the container is `docker stop`, never a signal from here.
 */
export function disarmProcessKill<T extends object>(browser: T): T {
  Object.defineProperty(browser, "sharedBrowserPid", {
    configurable: true,
    enumerable: false,
    get: () => undefined,
    set: () => undefined,
  });
  const inert = new Map<string, number>();
  inert.set = () => inert;
  Object.defineProperty(browser, "threadBrowserPids", {
    configurable: true,
    enumerable: false,
    get: () => inert,
    set: () => undefined,
  });
  return browser;
}

export function getUserBrowser(identity: UserBrowserIdentity): AgentBrowser {
  const entry = entryFor(identity);
  if (!entry.browser) {
    entry.browser = disarmProcessKill(
      new AgentBrowser({
        // Resolved per launch: the address changes with every container
        // start on a dev host (ephemeral published port).
        cdpUrl: () => resolveUserBrowserCdpEndpoint(identity),
        excludeTools: [...USER_BROWSER_EXCLUDED_TOOLS],
        headless: true,
        scope: "shared",
        // Frames are sent at the page's own size up to this ceiling; the live
        // view asks for the page to match its box (`viewport` message), so
        // what the person sees is 1:1, not a 1280×720 thumbnail scaled up.
        screencast: { maxHeight: 1600, maxWidth: 2560, quality: 80 },
        viewport: { height: 900, width: 1440 },
      })
    );
    entry.browser.onBrowserClosed(() => {
      // The container went away underneath us (stop, idle, crash). Drop the
      // handle so the next use reconnects instead of reusing a dead socket.
      const current = entries.get(entry.sandboxId);
      if (current?.browser === entry.browser) {
        current.browser = null;
        releaseSeatEntirely(current);
      }
    });
  }
  return entry.browser;
}

/** The registry's browser for a container id, if one is connected. */
export function peekUserBrowser(sandboxId: string): AgentBrowser | null {
  return entries.get(sandboxId)?.browser ?? null;
}

export function getSeat(sandboxId: string): {
  holder: SeatHolder;
  sinceMs: number;
} {
  const seat = entries.get(sandboxId)?.seat;
  return seat
    ? { holder: seat.holder, sinceMs: seat.sinceMs }
    : { holder: null, sinceMs: 0 };
}

function clearIdleTimer(seat: Seat): void {
  if (seat.idleTimer) {
    clearTimeout(seat.idleTimer);
    seat.idleTimer = null;
  }
}

function releaseSeatEntirely(entry: Entry): void {
  clearIdleTimer(entry.seat);
  entry.seat.holder = null;
  entry.seat.sinceMs = 0;
  entry.seat.interrupt = null;
}

function armIdleRelease(entry: Entry, runId: string): void {
  clearIdleTimer(entry.seat);
  const timer = setTimeout(() => {
    const holder = entry.seat.holder;
    if (holder && holder !== "user" && holder.runId === runId) {
      releaseSeatEntirely(entry);
    }
  }, SEAT_IDLE_MS);
  timer.unref();
  entry.seat.idleTimer = timer;
}

/**
 * Take (or keep) the seat for an agent run. Refused while a human holds it —
 * immediately, never queued (D10). Two runs of the same user cannot share the
 * page either: the second waits its turn by getting `held_by_agent`.
 */
export function acquireAgentSeat(
  identity: UserBrowserIdentity,
  runId: string
):
  | { ok: true; interrupted: Promise<void> }
  | { ok: false; error: "held_by_user" | "held_by_agent" } {
  const entry = entryFor(identity);
  const seat = entry.seat;
  if (seat.holder === "user") {
    return { error: "held_by_user", ok: false };
  }
  if (seat.holder && seat.holder.runId !== runId) {
    return { error: "held_by_agent", ok: false };
  }
  if (!seat.holder) {
    seat.holder = { runId };
    seat.sinceMs = Date.now();
  }
  if (!seat.interrupt) {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    seat.interrupt = { promise, resolve };
  }
  armIdleRelease(entry, runId);
  return { interrupted: seat.interrupt.promise, ok: true };
}

/** A run is done with the browser (run end, or the tool wrapper on error). */
export function releaseAgentSeat(sandboxId: string, runId: string): void {
  const entry = entries.get(sandboxId);
  if (!entry) {
    return;
  }
  const holder = entry.seat.holder;
  if (holder && holder !== "user" && holder.runId === runId) {
    releaseSeatEntirely(entry);
  }
}

/**
 * The human takes over. Always wins: an agent holding the seat has its
 * in-flight step failed through the interrupt promise (D10).
 */
export function takeUserSeat(sandboxId: string): void {
  const entry = entries.get(sandboxId);
  if (!entry) {
    return;
  }
  const seat = entry.seat;
  if (seat.holder === "user") {
    return;
  }
  const interrupted = seat.holder !== null;
  seat.interrupt?.resolve();
  clearIdleTimer(seat);
  seat.holder = "user";
  seat.sinceMs = Date.now();
  seat.interrupt = null;
  if (interrupted) {
    logger.info("user browser seat taken from agent", {
      sandboxId,
    });
  }
}

/** The human hands the browser back; the next agent call takes the seat. */
export function releaseUserSeat(sandboxId: string): void {
  const entry = entries.get(sandboxId);
  if (entry?.seat.holder === "user") {
    releaseSeatEntirely(entry);
  }
}

/**
 * Close the CDP session for a container that is about to stop (or has). The
 * container's stop is not this module's job — `space-browser.ts` owns it and
 * calls here first through the stop listener below.
 */
export async function closeUserBrowserSession(
  sandboxId: string
): Promise<void> {
  const entry = entries.get(sandboxId);
  if (!entry) {
    return;
  }
  const browser = entry.browser;
  entry.browser = null;
  releaseSeatEntirely(entry);
  if (!browser) {
    return;
  }
  try {
    await browser.close();
  } catch (err) {
    logger.warn("user browser session close failed", {
      message: err instanceof Error ? err.message : String(err),
      sandboxId,
    });
  }
}

setUserBrowserStopListener(closeUserBrowserSession);

/** Tests only. */
export function resetUserBrowserRegistryForTests(): void {
  for (const entry of entries.values()) {
    clearIdleTimer(entry.seat);
  }
  entries.clear();
}
