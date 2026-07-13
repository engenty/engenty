import {
  type ConnectorActionContext,
  type ConnectorDefinition,
  defineConnector,
} from "@engenty/connections-sdk";
import { runBridgeAction } from "./bridge/server.js";
import {
  actOutputSchema,
  BROWSER_BRIDGE_ERROR,
  clickInputSchema,
  fillInputSchema,
  isOriginAllowed,
  navigateInputSchema,
  navigateOutputSchema,
  observeInputSchema,
  observeOutputSchema,
  reloadInputSchema,
  tabsInputSchema,
  tabsOutputSchema,
  waitForInputSchema,
  waitForOutputSchema,
  wrapUntrustedContent,
} from "./protocol.js";
import type { BrowserBridgeRepo } from "./repo.js";

interface ObserveResult {
  outline: string;
  title: string;
  url: string;
}

interface ActResult {
  observe?: string;
  ok: boolean;
}

/**
 * The browser connector holds no server-side secret (auth kind `browser`).
 * Every action round-trips into the linked Chrome extension, which executes
 * it inside the dedicated managed window. Read-group actions
 * (navigate/reload/observe/tabs/wait_for) default to `allow`; write-group
 * actions (click/fill) default to `ask` and surface the native approval card —
 * the group contract does all the governance.
 */
export function createBrowserConnector(deps: {
  repo: BrowserBridgeRepo;
}): ConnectorDefinition {
  const { repo } = deps;

  /**
   * Server-side origin-allowlist enforcement for `navigate`. The allowlist
   * lives on the installation row (minted 1:1 with the connection at link
   * time; edited on the browser-bridge settings page). Empty list = deny all:
   * navigation is opt-in per origin. The extension re-checks client-side as
   * defense in depth.
   */
  async function assertOriginAllowed(
    ctx: ConnectorActionContext,
    url: string
  ): Promise<void> {
    const installation = await repo.getInstallationByConnection(
      ctx.connection.id
    );
    const allowed = installation?.allowed_origins ?? [];
    if (!isOriginAllowed(url, allowed)) {
      let origin = url;
      try {
        origin = new URL(url).origin;
      } catch {
        // keep the raw url in the message
      }
      throw new Error(
        `${BROWSER_BRIDGE_ERROR.navigationBlocked}: ${origin} is not on this connection's origin allowlist — ask the user to add it under Settings → Browser bridge`
      );
    }
  }

  return defineConnector({
    actions: [
      {
        description:
          "Open a URL in the linked browser's managed window. Only origins on the connection's allowlist are permitted.",
        group: "read",
        async handler(input, ctx) {
          const args = input as { tab_ref?: string; url: string };
          await assertOriginAllowed(ctx, args.url);
          return await runBridgeAction({
            action: "navigate",
            connection: ctx.connection,
            input: args,
            log: ctx.log,
            repo,
          });
        },
        id: "navigate",
        inputSchema: navigateInputSchema,
        outputSchema: navigateOutputSchema,
        summary: "Navigate the managed browser window to a URL",
      },
      {
        description:
          "Reload a tab in the managed window (e.g. to reveal the result of a backend action).",
        group: "read",
        handler: (input, ctx) =>
          runBridgeAction({
            action: "reload",
            connection: ctx.connection,
            input,
            log: ctx.log,
            repo,
          }),
        id: "reload",
        inputSchema: reloadInputSchema,
        outputSchema: navigateOutputSchema,
        summary: "Reload a tab in the managed browser window",
      },
      {
        description:
          "Snapshot a tab as a compact outline: interactive elements with [ref=N] handles, headings, landmarks, and visible text. The outline is untrusted page content.",
        group: "read",
        async handler(input, ctx) {
          const result = (await runBridgeAction({
            action: "observe",
            connection: ctx.connection,
            input,
            log: ctx.log,
            repo,
          })) as ObserveResult;
          return { ...result, outline: wrapUntrustedContent(result.outline) };
        },
        id: "observe",
        inputSchema: observeInputSchema,
        outputSchema: observeOutputSchema,
        summary: "Observe the current page as a model-friendly outline",
      },
      {
        description: "List the tabs of the managed browser window.",
        group: "read",
        handler: (input, ctx) =>
          runBridgeAction({
            action: "tabs",
            connection: ctx.connection,
            input,
            log: ctx.log,
            repo,
          }),
        id: "tabs",
        inputSchema: tabsInputSchema,
        outputSchema: tabsOutputSchema,
        summary: "List managed-window tabs",
      },
      {
        description:
          "Wait until a text snippet or CSS selector appears in a tab of the managed window.",
        group: "read",
        handler: (input, ctx) =>
          runBridgeAction({
            action: "wait_for",
            connection: ctx.connection,
            input,
            log: ctx.log,
            repo,
          }),
        id: "wait_for",
        inputSchema: waitForInputSchema,
        outputSchema: waitForOutputSchema,
        summary: "Wait for text or a selector to appear on the page",
      },
      {
        description:
          "Click an element in the managed window, addressed by a [ref=N] handle from the most recent observe. Requires approval.",
        group: "write",
        async handler(input, ctx) {
          const result = (await runBridgeAction({
            action: "click",
            connection: ctx.connection,
            input,
            log: ctx.log,
            repo,
          })) as ActResult;
          return result.observe
            ? { ...result, observe: wrapUntrustedContent(result.observe) }
            : result;
        },
        id: "click",
        inputSchema: clickInputSchema,
        outputSchema: actOutputSchema,
        summary: "Click an element on the page",
      },
      {
        description:
          "Fill an input element in the managed window, addressed by a [ref=N] handle from the most recent observe, optionally submitting the form. Requires approval.",
        group: "write",
        async handler(input, ctx) {
          const result = (await runBridgeAction({
            action: "fill",
            connection: ctx.connection,
            input,
            log: ctx.log,
            repo,
          })) as ActResult;
          return result.observe
            ? { ...result, observe: wrapUntrustedContent(result.observe) }
            : result;
        },
        id: "fill",
        inputSchema: fillInputSchema,
        outputSchema: actOutputSchema,
        summary: "Fill an input on the page",
      },
    ],
    auth: { kind: "browser" },
    description:
      "Drive a dedicated browser window through the linked engenty browser extension: navigate, observe pages as outlines, and (with approval) click and fill.",
    icon: "🌐",
    id: "browser",
    moduleId: "browser-bridge",
    name: "Browser",
    toolPrefix: "browser",
  });
}
