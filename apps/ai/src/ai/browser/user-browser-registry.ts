// One WINDOW per agent in a Space's browser, and the SEAT that decides who
// drives it (PLAN-user-browser.md §2.3, D10; PLAN-space-owned-connections.md).
//
// A Space has one Chromium (`space-browser.ts`); every agent working there gets
// its own window in it — its own Mastra `AgentBrowser` over CDP, which opens a
// tab of its own on first use — so agents never fight over one page, while
// logins and cookies are the Space's and shared. `AgentBrowser` owns the
// Playwright page, the ref-based tools and the screencast. What it has no
// opinion on is arbitration: a tool call and an injected mouse event hit the
// same page. The seat lives here, per window, and is enforced at the two doors
// we own — the tool wrapper (`user-browser-tools.ts`) and the stream handler
// (`browser-stream-ws.ts`).
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

/** One agent's window in one Space's browser. */
export interface BrowserWindowIdentity extends UserBrowserIdentity {
  /** The agent (registry key) the window belongs to. */
  agentId: string;
}

interface Entry {
  browser: AgentBrowser | null;
  identity: BrowserWindowIdentity;
  /** The agent's own tab has been opened on the current connection. */
  ownTab: boolean;
  sandboxId: string;
  seat: Seat;
  windowKey: string;
}

/** `<sandboxId>#<agentId>` — the address of one window. */
export function browserWindowKey(identity: BrowserWindowIdentity): string {
  return `${buildUserBrowserSandboxId(identity)}#${identity.agentId}`;
}

const entries = new Map<string, Entry>();
/** Live views of a window, told whenever its seat changes hands. */
const seatListeners = new Map<string, Set<() => void>>();

function notifySeat(windowKey: string): void {
  for (const listener of seatListeners.get(windowKey) ?? []) {
    listener();
  }
}

/**
 * Be told when this window's seat changes hands — an agent handing the page
 * to a person, a run releasing it — so a live view can redraw its take-over
 * control without polling. Returns the unsubscribe.
 */
export function subscribeSeat(
  windowKey: string,
  listener: () => void
): () => void {
  let set = seatListeners.get(windowKey);
  if (!set) {
    set = new Set();
    seatListeners.set(windowKey, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      seatListeners.delete(windowKey);
    }
  };
}

function newSeat(): Seat {
  return { holder: null, idleTimer: null, interrupt: null, sinceMs: 0 };
}

function entryFor(identity: BrowserWindowIdentity): Entry {
  const windowKey = browserWindowKey(identity);
  let entry = entries.get(windowKey);
  if (!entry) {
    entry = {
      browser: null,
      identity,
      ownTab: false,
      sandboxId: buildUserBrowserSandboxId(identity),
      seat: newSeat(),
      windowKey,
    };
    entries.set(windowKey, entry);
  }
  return entry;
}
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

/**
 * The Mastra browser for this agent's window, created on first use. `scope:
 * 'shared'` is what `cdpUrl` requires; every window shares the Space's one
 * browser context (its logins). `headless` only labels the config — the
 * container decides how Chromium runs.
 */
export function getUserBrowser(identity: BrowserWindowIdentity): AgentBrowser {
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
      const current = entries.get(entry.windowKey);
      if (current?.browser === entry.browser) {
        current.browser = null;
        current.ownTab = false;
        releaseSeatEntirely(current);
      }
    });
  }
  return entry.browser;
}

/**
 * Connect this window and make sure it has a tab of its own. A CDP connection
 * sees every page of the browser and starts on the first one — another
 * agent's — so the first use opens a fresh tab and keeps driving it.
 * `sharedManager` is not in the provider's public types; it is the
 * `agent-browser` manager Mastra's own tools drive, and `newTab()` is how
 * its `browser_tabs` tool opens one.
 */
export async function ensureBrowserWindow(
  identity: BrowserWindowIdentity
): Promise<AgentBrowser> {
  const entry = entryFor(identity);
  const browser = getUserBrowser(identity);
  await browser.ensureReady();
  if (!entry.ownTab) {
    const manager = (
      browser as unknown as { sharedManager?: { newTab(): Promise<unknown> } }
    ).sharedManager;
    if (!manager) {
      throw new Error("browser_window_unavailable: no browser manager");
    }
    await manager.newTab();
    entry.ownTab = true;
  }
  return browser;
}

/** The registry's browser for a window, if one is connected. */
export function peekUserBrowser(windowKey: string): AgentBrowser | null {
  return entries.get(windowKey)?.browser ?? null;
}

export function getSeat(windowKey: string): {
  holder: SeatHolder;
  sinceMs: number;
} {
  const seat = entries.get(windowKey)?.seat;
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
  const held = entry.seat.holder !== null;
  entry.seat.holder = null;
  entry.seat.sinceMs = 0;
  entry.seat.interrupt = null;
  if (held) {
    notifySeat(entry.windowKey);
  }
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
 * Take (or keep) the seat of the agent's window for a run. Refused while a
 * human holds it — immediately, never queued (D10). Two runs of the same
 * agent cannot share its window either: the second gets `held_by_agent`.
 */
export function acquireAgentSeat(
  identity: BrowserWindowIdentity,
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
    notifySeat(entry.windowKey);
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

/** A run is done with the window (run end, or the tool wrapper on error). */
export function releaseAgentSeat(windowKey: string, runId: string): void {
  const entry = entries.get(windowKey);
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
export function takeUserSeat(windowKey: string): void {
  const entry = entries.get(windowKey);
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
    logger.info("browser window seat taken from agent", { windowKey });
  }
  notifySeat(windowKey);
}

/** The human hands the browser back; the next agent call takes the seat. */
export function releaseUserSeat(windowKey: string): void {
  const entry = entries.get(windowKey);
  if (entry?.seat.holder === "user") {
    releaseSeatEntirely(entry);
  }
}

/**
 * Close every window's CDP session for a container that is about to stop (or
 * has). The container's stop is not this module's job — `space-browser.ts`
 * owns it and calls here first through the stop listener below.
 */
export async function closeUserBrowserSession(
  sandboxId: string
): Promise<void> {
  for (const entry of entries.values()) {
    if (entry.sandboxId !== sandboxId) {
      continue;
    }
    const browser = entry.browser;
    entry.browser = null;
    entry.ownTab = false;
    releaseSeatEntirely(entry);
    if (!browser) {
      continue;
    }
    try {
      await browser.close();
    } catch (err) {
      logger.warn("browser window session close failed", {
        message: err instanceof Error ? err.message : String(err),
        windowKey: entry.windowKey,
      });
    }
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
