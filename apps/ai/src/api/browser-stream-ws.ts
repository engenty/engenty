// The live view of a user's browser, with takeover (PLAN-user-browser.md
// §2.5, P3). One WS per open view, authorized by a 60 s ticket the owner
// minted. Frames and the viewer protocol are Mastra's (`ViewerRegistry`,
// `handleInputMessage`); what is ours is the door: the seat check before any
// input reaches the page, the extra messages (`seat`, `navigate`, `tabs`),
// the tab list pushed to the viewer, and the rule that typed input is never
// logged — nothing in this file writes a message body anywhere.

import { createLogger } from "@engenty/telemetry";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import {
  handleInputMessage,
  ViewerRegistry,
} from "@mastra/server/browser-stream";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";

import {
  getSeat,
  getUserBrowser,
  releaseUserSeat,
  subscribeSeat,
  takeUserSeat,
} from "../ai/browser/user-browser-registry.js";
import {
  markUserBrowserUsed,
  startUserBrowser,
} from "../ai/sandbox/space-browser.js";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  type BrowserTicketPayload,
  verifyBrowserTicket,
} from "./browser/browser-tickets.js";

export const BROWSER_STREAM_WS_PATH = `${AI_BASE_PATH}/v1/browser/stream`;

const logger = createLogger({ name: "apps/ai/browser-stream-ws" });

interface SeatMessage {
  action: "release" | "take";
  type: "seat";
}
interface NavigateMessage {
  type: "navigate";
  url: string;
}
interface TabsMessage {
  action: "close" | "list" | "new" | "switch";
  index?: number;
  type: "tabs";
  url?: string;
}
interface NavMessage {
  action: "back" | "reload";
  type: "nav";
}
/** The view's box in CSS pixels: the page is sized to it, so frames are 1:1. */
interface ViewportMessage {
  height: number;
  type: "viewport";
  width: number;
}
type OwnMessage =
  | NavigateMessage
  | NavMessage
  | SeatMessage
  | TabsMessage
  | ViewportMessage;

const VIEWPORT_MIN = { height: 240, width: 320 };
const VIEWPORT_MAX = { height: 1600, width: 2560 };

function clampViewport(width: number, height: number) {
  return {
    height: Math.min(
      VIEWPORT_MAX.height,
      Math.max(VIEWPORT_MIN.height, Math.round(height))
    ),
    width: Math.min(
      VIEWPORT_MAX.width,
      Math.max(VIEWPORT_MIN.width, Math.round(width))
    ),
  };
}

/** One open tab as the viewer draws it (agent-browser's `listTabs` shape). */
interface TabInfo {
  active: boolean;
  index: number;
  title: string;
  url: string;
}

/** How often the viewer's tab strip is refreshed while a view is open. */
const TABS_POLL_MS = 2000;

function parseOwnMessage(raw: string): OwnMessage | null {
  try {
    const parsed = JSON.parse(raw) as {
      action?: unknown;
      index?: unknown;
      type?: unknown;
      url?: unknown;
    };
    if (
      parsed.type === "seat" &&
      (parsed.action === "take" || parsed.action === "release")
    ) {
      return { action: parsed.action, type: "seat" };
    }
    if (parsed.type === "navigate" && typeof parsed.url === "string") {
      return { type: "navigate", url: parsed.url };
    }
    if (
      parsed.type === "nav" &&
      (parsed.action === "back" || parsed.action === "reload")
    ) {
      return { action: parsed.action, type: "nav" };
    }
    if (
      parsed.type === "viewport" &&
      typeof (parsed as { width?: unknown }).width === "number" &&
      typeof (parsed as { height?: unknown }).height === "number"
    ) {
      const { height, width } = parsed as { height: number; width: number };
      if (Number.isFinite(width) && Number.isFinite(height)) {
        return { type: "viewport", ...clampViewport(width, height) };
      }
    }
    if (
      parsed.type === "tabs" &&
      (parsed.action === "list" ||
        parsed.action === "new" ||
        parsed.action === "switch" ||
        parsed.action === "close")
    ) {
      return {
        action: parsed.action,
        type: "tabs",
        ...(typeof parsed.index === "number" && Number.isInteger(parsed.index)
          ? { index: parsed.index }
          : {}),
        ...(typeof parsed.url === "string" ? { url: parsed.url } : {}),
      };
    }
  } catch {
    // Not JSON, or not ours: Mastra decides.
  }
  return null;
}

/**
 * Run Mastra's `browser_tabs` for the view. Returns the tab list after the
 * action (a list, or the state a switch/new/close left behind); null when
 * the browser is not up. Never throws: the strip just keeps what it has.
 */
async function runTabs(
  identity: { spaceId: string; tenantId: string; userId: string },
  input: { action: TabsMessage["action"]; index?: number; url?: string }
): Promise<TabInfo[] | null> {
  try {
    const tool = getUserBrowser(identity).getTools().browser_tabs;
    if (!tool?.execute) {
      return null;
    }
    if (input.action !== "list") {
      await tool.execute(input as never, {} as never);
    }
    const listed = (await tool.execute(
      { action: "list" } as never,
      {} as never
    )) as { success?: boolean; tabs?: TabInfo[] } | undefined;
    return Array.isArray(listed?.tabs) ? listed.tabs : null;
  } catch {
    return null;
  }
}

function seatStatus(sandboxId: string): string {
  const seat = getSeat(sandboxId);
  return JSON.stringify({
    seat:
      seat.holder === null ? "free" : seat.holder === "user" ? "user" : "agent",
    type: "seat",
  });
}

export function registerBrowserStreamWs(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: { ticketSecret: string; upgradeWebSocket: UpgradeWebSocket }
): void {
  const registry = new ViewerRegistry();
  app.get(
    BROWSER_STREAM_WS_PATH,
    opts.upgradeWebSocket((c) => {
      const ticket: BrowserTicketPayload | null = verifyBrowserTicket(
        c.req.query("ticket") ?? "",
        opts.ticketSecret
      );
      const identity = ticket
        ? {
            spaceId: ticket.space_id,
            tenantId: ticket.tenant_id,
            userId: ticket.user_id,
          }
        : null;
      const getToolset = () =>
        identity ? getUserBrowser(identity) : undefined;
      // Mastra's registry sends through this object. Wrapping `send` is how a
      // frame stamps last-use: a person watching keeps the browser awake.
      let viewer: { send(data: string): void } | null = null;
      // The tab strip: pushed after every tab action and on a slow poll, but
      // only when it changed — the poll is what keeps the address bar honest
      // when the page navigates itself or the agent switches tabs.
      let lastTabs = "";
      let tabsTimer: ReturnType<typeof setInterval> | null = null;
      // The seat can change hands without this socket asking (the agent
      // hands the page over, a run ends): the view is told at once.
      let unsubscribeSeat: (() => void) | null = null;
      const pushTabs = async (
        ws: { send(data: string): void },
        tabs: TabInfo[] | null
      ) => {
        if (!tabs) {
          return;
        }
        const json = JSON.stringify({ tabs, type: "tabs" });
        if (json === lastTabs) {
          return;
        }
        lastTabs = json;
        ws.send(json);
      };
      return {
        async onOpen(_event, ws) {
          if (!(ticket && identity)) {
            ws.send(
              JSON.stringify({
                error: "auth_failed",
                message: "browser.ticketInvalid",
              })
            );
            ws.close();
            return;
          }
          const sandboxId = ticket.sandbox_id;
          viewer = {
            send: (data: string) => {
              markUserBrowserUsed(sandboxId);
              ws.send(data);
            },
          };
          ws.send(seatStatus(sandboxId));
          unsubscribeSeat = subscribeSeat(sandboxId, () => {
            ws.send(seatStatus(sandboxId));
          });
          try {
            // The registry starts the screencast when the browser reports
            // ready; nothing else launches a session a person merely wants
            // to LOOK at, so connect (waking the container if it sleeps).
            await registry.addViewer(sandboxId, viewer, getToolset);
            const browser = getUserBrowser(identity);
            try {
              await browser.ensureReady();
            } catch {
              await startUserBrowser(identity);
              await getUserBrowser(identity).ensureReady();
            }
            await pushTabs(ws, await runTabs(identity, { action: "list" }));
            tabsTimer = setInterval(() => {
              void runTabs(identity, { action: "list" }).then((tabs) =>
                pushTabs(ws, tabs)
              );
            }, TABS_POLL_MS);
          } catch (err) {
            logger.warn("browser view attach failed", {
              message: err instanceof Error ? err.message : String(err),
              sandboxId,
            });
            ws.send(
              JSON.stringify({
                error: "screencast_failed",
                message: "browser.streamUnavailable",
              })
            );
            ws.close();
          }
        },
        async onMessage(event, ws) {
          if (!(ticket && identity) || typeof event.data !== "string") {
            return;
          }
          const sandboxId = ticket.sandbox_id;
          const own = parseOwnMessage(event.data);
          if (own?.type === "seat") {
            if (own.action === "take") {
              takeUserSeat(sandboxId);
            } else {
              releaseUserSeat(sandboxId);
            }
            ws.send(seatStatus(sandboxId));
            return;
          }
          if (own?.type === "tabs" && own.action === "list") {
            await pushTabs(ws, await runTabs(identity, { action: "list" }));
            return;
          }
          // The page follows the view's box. Not "driving": it changes how
          // the page lays out, which the person watching sees either way.
          if (own?.type === "viewport") {
            try {
              const page = (
                await getUserBrowser(identity).getManagerForThread()
              ).getPage();
              const current = page.viewportSize();
              if (
                current?.width !== own.width ||
                current?.height !== own.height
              ) {
                await page.setViewportSize({
                  height: own.height,
                  width: own.width,
                });
              }
            } catch (err) {
              logger.debug("browser view viewport resize failed", {
                message: err instanceof Error ? err.message : String(err),
                sandboxId,
              });
            }
            return;
          }
          // Everything below drives the page: only the seat's holder may.
          if (getSeat(sandboxId).holder !== "user") {
            ws.send(seatStatus(sandboxId));
            return;
          }
          markUserBrowserUsed(sandboxId);
          if (own?.type === "tabs") {
            await pushTabs(ws, await runTabs(identity, own));
            return;
          }
          if (own?.type === "navigate" || own?.type === "nav") {
            try {
              const tools = getUserBrowser(identity).getTools();
              if (own.type === "navigate") {
                await tools.browser_goto?.execute?.(
                  { url: own.url } as never,
                  {} as never
                );
              } else if (own.action === "back") {
                await tools.browser_back?.execute?.({} as never, {} as never);
              } else {
                // Reload = go to where the active tab already is.
                const tabs = await runTabs(identity, { action: "list" });
                const current = tabs?.find((tab) => tab.active)?.url;
                if (current) {
                  await tools.browser_goto?.execute?.(
                    { url: current } as never,
                    {} as never
                  );
                }
              }
            } catch (err) {
              logger.warn("browser view navigate failed", {
                message: err instanceof Error ? err.message : String(err),
                sandboxId,
              });
            }
            await pushTabs(ws, await runTabs(identity, { action: "list" }));
            return;
          }
          // Mouse and keyboard: Mastra validates and injects. The payload is
          // NOT logged, here or downstream — it may be a password.
          await handleInputMessage(event.data, getToolset, sandboxId).catch(
            () => undefined
          );
        },
        async onClose() {
          if (!ticket) {
            return;
          }
          const sandboxId = ticket.sandbox_id;
          if (tabsTimer) {
            clearInterval(tabsTimer);
            tabsTimer = null;
          }
          unsubscribeSeat?.();
          unsubscribeSeat = null;
          if (viewer) {
            await registry
              .removeViewer(sandboxId, viewer)
              .catch(() => undefined);
            viewer = null;
          }
          // A view that closes while its person holds the seat would leave
          // every agent refused forever: the seat goes with the window.
          releaseUserSeat(sandboxId);
        },
      };
    })
  );
}
