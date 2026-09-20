// Observe and act on the page Mastra's `AgentBrowser` already holds. Every
// input is preceded by a freshness check against the observation the
// decision was made on, and a hit-test at the element's centre — a stale or
// covered target is a `StalePageError`, never a click somewhere else.
// Ported from jev-ultrafast `browser.py`; input goes through Playwright's
// mouse/keyboard (the same CDP `Input.*` events underneath).

import { createHash } from "node:crypto";

import {
  actTargetScript,
  MARKER_SCRIPT,
  nodeGuardScript,
  type PageSnapshot,
  SNAPSHOT_SCRIPT,
  type SnapshotAction,
  settleScript,
} from "./snapshot.js";

export class StalePageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StalePageError";
  }
}

/** The slice of a Playwright `Page` the loop uses; typed here so tests can fake it. */
export interface FastLoopPage {
  evaluate<T = unknown>(expression: string): Promise<T>;
  keyboard: {
    insertText(text: string): Promise<void>;
    press(key: string): Promise<void>;
  };
  mouse: {
    click(x: number, y: number): Promise<void>;
    move(x: number, y: number): Promise<void>;
    wheel(deltaX: number, deltaY: number): Promise<void>;
  };
  url(): string;
}

const OBSERVE_ATTEMPTS = 10;
const OBSERVE_RETRY_MS = 20;

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function fingerprint(
  snapshot: Omit<PageSnapshot, "fingerprint">
): string {
  const content = {
    actions: snapshot.actions,
    scroll: snapshot.scroll,
    text: snapshot.text,
    url: snapshot.url,
  };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export class FastLoopDriver {
  private afterInput: SnapshotAction | null = null;
  private readonly page: FastLoopPage;

  constructor(page: FastLoopPage) {
    this.page = page;
  }

  private async evaluate<T>(expression: string): Promise<T> {
    try {
      return await this.page.evaluate<T>(expression);
    } catch (error) {
      // A navigation mid-evaluation detaches the execution context.
      throw new StalePageError(
        `Document changed during evaluation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Wait for the page to come to rest (see `settleScript`). Read-only; a
   * navigation while waiting is fine, the next observation will see it.
   */
  async settle(action: SnapshotAction | null = null): Promise<void> {
    try {
      await this.page.evaluate(settleScript(action));
    } catch {
      // Detached context = the page is navigating; observe() retries that.
    }
  }

  /** A fresh, atomic observation. Retries briefly while the page is navigating. */
  async observe(): Promise<PageSnapshot> {
    if (this.afterInput) {
      const action = this.afterInput;
      this.afterInput = null;
      await this.settle(action);
    }
    for (let attempt = 0; attempt < OBSERVE_ATTEMPTS; attempt += 1) {
      try {
        const raw = await this.evaluate<Omit<
          PageSnapshot,
          "fingerprint"
        > | null>(SNAPSHOT_SCRIPT);
        if (raw === null) {
          throw new StalePageError("Document is navigating");
        }
        return { ...raw, fingerprint: fingerprint(raw) };
      } catch (error) {
        if (
          !(error instanceof StalePageError) ||
          attempt === OBSERVE_ATTEMPTS - 1
        ) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, OBSERVE_RETRY_MS));
      }
    }
    throw new StalePageError("Page did not settle");
  }

  /**
   * Is the page still the one this snapshot describes? With an element
   * action: is that exact element still what we saw (identity + semantics).
   */
  async fresh(page: PageSnapshot, action?: SnapshotAction): Promise<boolean> {
    if (action && (action.kind === "click" || action.kind === "select")) {
      if (typeof action.node !== "number") {
        return false;
      }
      const current = await this.evaluate<unknown>(
        nodeGuardScript(action.node)
      );
      return sameJson(current, [
        page.page_key,
        page.guards[String(action.node)] ?? null,
      ]);
    }
    const marker = await this.evaluate<unknown>(MARKER_SCRIPT);
    return sameJson(marker, page.marker);
  }

  /** Execute one observed action. `text` is required for `fill`. */
  async act(
    action: SnapshotAction,
    page: PageSnapshot,
    text: string | null = null
  ): Promise<void> {
    if (!(await this.fresh(page, action))) {
      throw new StalePageError(
        "Page changed since this decision. Observe again."
      );
    }
    switch (action.kind) {
      case "wait":
        // A WAIT is the classifier asking for the page to finish what it is
        // doing: settle on the next observation like any input does.
        break;
      case "scroll": {
        await this.page.mouse.move(
          Math.floor(page.w / 2),
          Math.floor(page.h * 0.8)
        );
        await this.page.mouse.wheel(0, action.delta ?? 560);
        break;
      }
      case "click":
      case "fill":
      case "select": {
        if (typeof action.node !== "number") {
          throw new StalePageError("Invalid observed node");
        }
        // Code-owned node ids refer to observed elements, never model selectors.
        const target = await this.evaluate<{ x: number; y: number } | null>(
          actTargetScript(action)
        );
        if (target === null) {
          throw new StalePageError(
            action.kind === "select"
              ? "Dropdown value was not applied; observe again."
              : "Target changed or is covered. Observe again."
          );
        }
        if (action.kind !== "select") {
          await this.page.mouse.click(target.x, target.y);
          if (action.kind === "fill") {
            if (text === null) {
              throw new Error("fill_without_text");
            }
            // The browser is the container's Linux Chromium.
            await this.page.keyboard.press("Control+a");
            await this.page.keyboard.insertText(text);
          }
        }
        break;
      }
      default:
        throw new Error(
          `unknown_action_kind: ${String((action as SnapshotAction).kind)}`
        );
    }
    this.afterInput = action;
  }
}
