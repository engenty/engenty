import {
  BROWSER_BRIDGE_ERROR,
  DEFAULT_OBSERVE_MAX_CHARS,
  isOriginAllowed,
} from "@engenty/browser-bridge/protocol";
import {
  type ContentCommand,
  type ContentResult,
  contentMain,
} from "../content/content-main.js";
import type { ClaimedRequest } from "./api.js";
import { getState } from "./state.js";
import { ensureManagedWindow, getManagedWindowId } from "./window.js";

export interface CommandOutcome {
  error?: string;
  errorCode?: string;
  ok: boolean;
  response?: unknown;
}

class CommandError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CommandError";
    this.code = code;
  }
}

/**
 * Last observe generation per tab. In-memory only: after a service-worker
 * restart the map is empty and click/fill pass `expectedGeneration: null`,
 * letting the page-side registry (which survives in the tab) decide staleness
 * by element identity instead.
 */
const tabGenerations = new Map<number, number>();

const NAV_TIMEOUT_MS = 25_000;

async function resolveTab(
  tabRef: string | undefined
): Promise<chrome.tabs.Tab> {
  const windowId = await getManagedWindowId();
  if (windowId === null) {
    throw new CommandError(
      BROWSER_BRIDGE_ERROR.windowClosed,
      "the managed browser window is closed — reopen it from the extension panel"
    );
  }
  if (tabRef !== undefined) {
    const tabId = Number.parseInt(tabRef, 10);
    if (Number.isNaN(tabId)) {
      throw new CommandError(
        BROWSER_BRIDGE_ERROR.tabNotFound,
        `invalid tab_ref "${tabRef}"`
      );
    }
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || tab.windowId !== windowId) {
      throw new CommandError(
        BROWSER_BRIDGE_ERROR.tabNotFound,
        `tab ${tabRef} is not part of the managed window`
      );
    }
    return tab;
  }
  const [active] = await chrome.tabs.query({ active: true, windowId });
  if (!active) {
    throw new CommandError(
      BROWSER_BRIDGE_ERROR.tabNotFound,
      "the managed window has no active tab"
    );
  }
  return active;
}

function waitForNavigation(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      chrome.webNavigation.onCompleted.removeListener(onCompleted);
      chrome.webNavigation.onErrorOccurred.removeListener(onCompleted);
      resolve();
    };
    const onCompleted = (details: { frameId: number; tabId: number }) => {
      if (details.tabId === tabId && details.frameId === 0) {
        finish();
      }
    };
    chrome.webNavigation.onCompleted.addListener(onCompleted);
    chrome.webNavigation.onErrorOccurred.addListener(onCompleted);
    setTimeout(finish, NAV_TIMEOUT_MS);
  });
}

async function runInTab(
  tabId: number,
  command: ContentCommand
): Promise<ContentResult> {
  let results: { result?: unknown }[];
  try {
    results = await chrome.scripting.executeScript({
      args: [command],
      func: contentMain,
      target: { tabId },
    });
  } catch (error) {
    // Almost always a missing optional host permission for the tab's origin.
    throw new CommandError(
      BROWSER_BRIDGE_ERROR.permissionLost,
      `cannot access this page — grant site access from the extension panel (${
        error instanceof Error ? error.message : "injection failed"
      })`
    );
  }
  const result = results[0]?.result as ContentResult | undefined;
  if (!result) {
    throw new CommandError(
      BROWSER_BRIDGE_ERROR.tabNotFound,
      "the page did not return a result"
    );
  }
  return result;
}

function contentFailureToOutcome(result: ContentResult): CommandOutcome | null {
  if (result.ok) {
    return null;
  }
  return {
    error: result.error,
    errorCode:
      result.errorCode === "ref_stale"
        ? BROWSER_BRIDGE_ERROR.refStale
        : BROWSER_BRIDGE_ERROR.tabNotFound,
    ok: false,
  };
}

function rememberGeneration(tabId: number, result: ContentResult): void {
  if (result.ok && typeof result.generation === "number") {
    tabGenerations.set(tabId, result.generation);
  }
}

async function navigate(input: {
  tab_ref?: string;
  url: string;
}): Promise<CommandOutcome> {
  const state = await getState();
  // Client-side allowlist check — defense in depth; the server already
  // enforced this in the connector handler.
  if (!isOriginAllowed(input.url, state.allowedOrigins)) {
    return {
      error: `navigation to ${input.url} is not allowed by the origin allowlist`,
      errorCode: BROWSER_BRIDGE_ERROR.navigationBlocked,
      ok: false,
    };
  }
  const windowId = await ensureManagedWindow();
  let tab: chrome.tabs.Tab;
  if (input.tab_ref === undefined) {
    const [active] = await chrome.tabs.query({ active: true, windowId });
    // Reuse a fresh/blank active tab, otherwise open a new one.
    if (
      active?.id !== undefined &&
      (active.url === "chrome://newtab/" || !active.url)
    ) {
      tab = active;
      await chrome.tabs.update(tab.id as number, { url: input.url });
    } else {
      tab = await chrome.tabs.create({ url: input.url, windowId });
    }
  } else {
    tab = await resolveTab(input.tab_ref);
    await chrome.tabs.update(tab.id as number, { url: input.url });
  }
  const tabId = tab.id as number;
  await waitForNavigation(tabId);
  const fresh = await chrome.tabs.get(tabId);
  tabGenerations.delete(tabId);
  return {
    ok: true,
    response: {
      final_url: fresh.url ?? input.url,
      tab_ref: String(tabId),
      title: fresh.title ?? "",
    },
  };
}

async function reload(input: { tab_ref?: string }): Promise<CommandOutcome> {
  const tab = await resolveTab(input.tab_ref);
  const tabId = tab.id as number;
  await chrome.tabs.reload(tabId);
  await waitForNavigation(tabId);
  const fresh = await chrome.tabs.get(tabId);
  tabGenerations.delete(tabId);
  return {
    ok: true,
    response: {
      final_url: fresh.url ?? "",
      tab_ref: String(tabId),
      title: fresh.title ?? "",
    },
  };
}

async function listTabs(): Promise<CommandOutcome> {
  const windowId = await getManagedWindowId();
  if (windowId === null) {
    return {
      error:
        "the managed browser window is closed — reopen it from the extension panel",
      errorCode: BROWSER_BRIDGE_ERROR.windowClosed,
      ok: false,
    };
  }
  const tabs = await chrome.tabs.query({ windowId });
  return {
    ok: true,
    response: {
      tabs: tabs.map((tab) => ({
        active: tab.active,
        tab_ref: String(tab.id),
        title: tab.title ?? "",
        url: tab.url ?? "",
      })),
    },
  };
}

async function observe(input: {
  max_chars?: number;
  mode?: "outline" | "text";
  tab_ref?: string;
}): Promise<CommandOutcome> {
  const tab = await resolveTab(input.tab_ref);
  const tabId = tab.id as number;
  const result = await runInTab(tabId, {
    kind: "observe",
    maxChars: input.max_chars ?? DEFAULT_OBSERVE_MAX_CHARS,
    mode: input.mode ?? "outline",
  });
  const failure = contentFailureToOutcome(result);
  if (failure) {
    return failure;
  }
  rememberGeneration(tabId, result);
  if (!result.ok) {
    return { ok: false };
  }
  return {
    ok: true,
    response: {
      outline: result.outline ?? "",
      title: result.title,
      url: result.url,
    },
  };
}

async function waitFor(input: {
  selector?: string;
  tab_ref?: string;
  text?: string;
  timeout_ms?: number;
}): Promise<CommandOutcome> {
  const tab = await resolveTab(input.tab_ref);
  const result = await runInTab(tab.id as number, {
    kind: "wait_for",
    selector: input.selector,
    text: input.text,
    timeoutMs: input.timeout_ms ?? 10_000,
  });
  const failure = contentFailureToOutcome(result);
  if (failure) {
    return failure;
  }
  return {
    ok: true,
    response: { found: result.ok ? (result.found ?? false) : false },
  };
}

async function act(
  kind: "click" | "fill",
  input: {
    ref: number;
    submit?: boolean;
    tab_ref?: string;
    value?: string;
  }
): Promise<CommandOutcome> {
  const tab = await resolveTab(input.tab_ref);
  const tabId = tab.id as number;
  const expectedGeneration = tabGenerations.get(tabId) ?? null;
  const command: ContentCommand =
    kind === "click"
      ? { expectedGeneration, kind, ref: input.ref }
      : {
          expectedGeneration,
          kind,
          ref: input.ref,
          submit: input.submit ?? false,
          value: input.value ?? "",
        };
  const result = await runInTab(tabId, command);
  const failure = contentFailureToOutcome(result);
  if (failure) {
    return failure;
  }
  rememberGeneration(tabId, result);
  if (!result.ok) {
    return { ok: false };
  }
  return { ok: true, response: { observe: result.observe, ok: true } };
}

/** Execute one claimed command; never throws — errors become outcomes. */
export async function executeCommand(
  request: ClaimedRequest
): Promise<CommandOutcome> {
  try {
    const input = request.input ?? {};
    switch (request.action) {
      case "navigate":
        return await navigate(input as { tab_ref?: string; url: string });
      case "reload":
        return await reload(input as { tab_ref?: string });
      case "tabs":
        return await listTabs();
      case "observe":
        return await observe(
          input as {
            max_chars?: number;
            mode?: "outline" | "text";
            tab_ref?: string;
          }
        );
      case "wait_for":
        return await waitFor(
          input as {
            selector?: string;
            tab_ref?: string;
            text?: string;
            timeout_ms?: number;
          }
        );
      case "click":
        return await act("click", input as { ref: number; tab_ref?: string });
      case "fill":
        return await act(
          "fill",
          input as {
            ref: number;
            submit?: boolean;
            tab_ref?: string;
            value?: string;
          }
        );
      default:
        return {
          error: `unknown action "${request.action}"`,
          errorCode: BROWSER_BRIDGE_ERROR.tabNotFound,
          ok: false,
        };
    }
  } catch (error) {
    if (error instanceof CommandError) {
      return { error: error.message, errorCode: error.code, ok: false };
    }
    return {
      error: error instanceof Error ? error.message : "command failed",
      errorCode: BROWSER_BRIDGE_ERROR.timeout,
      ok: false,
    };
  }
}
