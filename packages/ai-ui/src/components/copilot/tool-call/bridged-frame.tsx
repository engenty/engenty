"use client";

import { cn } from "@engenty/ui-core";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Sandboxed host frame speaking MCP JSON-RPC over postMessage (spec
 * io.modelcontextprotocol/ui, rev 2026-01-26).
 *
 * This is the transport half of the former `McpAppFrame`, lifted out so two
 * very different guests can share one audited bridge:
 *
 *   - MCP Apps widgets in the chat transcript, whose `tools/call` goes to a
 *     registered MCP server (`McpAppFrame`);
 *   - engenty Apps in the artifact pane, whose `tools/call` goes to the
 *     app proxy under a manifest allow-list (`AppArtifactView`).
 *
 * What must NOT be parameterised is the isolation: `srcdoc` without
 * `allow-same-origin` gives the guest an opaque origin, so it has no cookies,
 * no localStorage of ours, and no reachable platform session — which is the
 * entire reason tenant-authored code is allowed to run here at all.
 *
 * Exit ramp: the official `@modelcontextprotocol/ext-apps` AppBridge tracks
 * the core 2026-07-28 release; these props are shaped to swap onto it.
 */

export interface BridgedFrameCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
}

export interface BridgedFrameProps {
  /** Handles a guest `tools/call`. Rejecting surfaces as a JSON-RPC error. */
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  className?: string;
  csp?: BridgedFrameCsp;
  /** "inline" clamps height to the chat card range; "fill" fills the pane. */
  fit?: "fill" | "inline";
  /** Stable identity for the message listener — must not change per render. */
  frameKey: string;
  html: string;
  /** Pushed to the guest once it reports `ui/notifications/initialized`. */
  initialData?: {
    structuredContent?: unknown;
    toolInput?: unknown;
    toolResult?: unknown;
  };
  /** Called when the guest asks the host to surface a message. */
  onNotify?: (text: string) => void;
  title: string;
}

const MIN_HEIGHT_PX = 120;
const MAX_HEIGHT_PX = 640;
const DEFAULT_HEIGHT_PX = 320;

interface JsonRpcMessage {
  id?: number | string;
  jsonrpc?: string;
  method?: string;
  params?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Enforce the guest's declared CSP by injecting a meta tag ahead of any guest
 * markup. Undeclared domains stay blocked (`default-src 'none'` base); inline
 * script/style is the spec default for self-contained templates.
 */
export function buildWidgetCsp(csp?: BridgedFrameCsp): string {
  const connect = csp?.connectDomains?.join(" ") ?? "";
  const resources = csp?.resourceDomains?.join(" ") ?? "";
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    `img-src data: blob:${resources ? ` ${resources}` : ""}`,
    `font-src data:${resources ? ` ${resources}` : ""}`,
    `connect-src${connect ? ` ${connect}` : " 'none'"}`,
    "frame-src 'none'",
  ].join("; ");
}

export function injectCspMeta(html: string, cspValue: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${cspValue}">`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch?.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return html.slice(0, insertAt) + meta + html.slice(insertAt);
  }
  return meta + html;
}

function hostTheme(): "dark" | "light" {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

/** Imperative handle a host can use to push a notification into a live frame. */
export interface BridgedFrameHandle {
  notify: (method: string, params: Record<string, unknown>) => void;
}

export function BridgedFrame({
  callTool,
  className,
  csp,
  fit = "inline",
  frameKey,
  html,
  initialData,
  onNotify,
  handleRef,
  title,
}: BridgedFrameProps & {
  handleRef?: { current: BridgedFrameHandle | null };
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [heightPx, setHeightPx] = useState(DEFAULT_HEIGHT_PX);

  // Latest callbacks and payloads, read through refs so the message listener
  // binds once per frame rather than once per render. An inline arrow from the
  // parent changes identity every render; without this the listener would
  // re-bind constantly and drop in-flight replies.
  const callToolRef = useRef(callTool);
  callToolRef.current = callTool;
  const dataRef = useRef(initialData);
  dataRef.current = initialData;
  const notifyRef = useRef(onNotify);
  notifyRef.current = onNotify;

  const srcDoc = useMemo(
    () => injectCspMeta(html, buildWidgetCsp(csp)),
    [html, csp]
  );

  useEffect(() => {
    const post = (message: Record<string, unknown>) => {
      // Sandboxed srcdoc = opaque origin; "*" is the only addressable target.
      // Delivery is still confined to this specific iframe's contentWindow.
      iframeRef.current?.contentWindow?.postMessage(
        { jsonrpc: "2.0", ...message },
        "*"
      );
    };

    if (handleRef) {
      handleRef.current = {
        notify: (method, params) => post({ method, params }),
      };
    }

    const pushInitialData = () => {
      const {
        structuredContent: sc,
        toolInput: ti,
        toolResult: tr,
      } = dataRef.current ?? {};
      post({
        method: "ui/notifications/tool-input",
        params: { arguments: isRecord(ti) ? ti : {} },
      });
      post({
        method: "ui/notifications/tool-result",
        params: {
          result: isRecord(tr) ? tr : { content: [], structuredContent: sc },
        },
      });
    };

    const onMessage = (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) {
        return;
      }
      const msg = event.data as JsonRpcMessage;
      if (!isRecord(msg) || msg.jsonrpc !== "2.0") {
        return;
      }
      const respond = (result: unknown) =>
        post({ id: msg.id, result: result ?? {} });
      const respondError = (code: number, message: string) =>
        post({ id: msg.id, error: { code, message } });

      switch (msg.method) {
        case "ui/initialize": {
          respond({
            capabilities: {},
            hostContext: {
              displayMode: fit === "fill" ? "pane" : "inline",
              locale:
                typeof navigator === "undefined" ? "en" : navigator.language,
              theme: hostTheme(),
            },
            hostInfo: { name: "engenty", version: "1" },
            protocolVersion: "2026-01-26",
          });
          return;
        }
        case "ui/notifications/initialized": {
          pushInitialData();
          return;
        }
        case "tools/call": {
          const name =
            typeof msg.params?.name === "string" ? msg.params.name : null;
          if (!name) {
            respondError(-32_602, "tools/call requires a tool name");
            return;
          }
          callToolRef
            .current(
              name,
              isRecord(msg.params?.arguments) ? msg.params.arguments : {}
            )
            .then((result) => respond(result))
            .catch((err) =>
              respondError(
                -32_000,
                err instanceof Error ? err.message : "tool call failed"
              )
            );
          return;
        }
        case "ui/notifications/message": {
          // Frame → conversation. Text only: the guest is untrusted, so it
          // gets to say something, not to render something.
          const text =
            typeof msg.params?.text === "string" ? msg.params.text : "";
          if (text) {
            notifyRef.current?.(text.slice(0, 2000));
          }
          if (msg.id !== undefined) {
            respond({});
          }
          return;
        }
        case "ui/open-link": {
          const url = typeof msg.params?.url === "string" ? msg.params.url : "";
          if (/^https?:\/\//i.test(url)) {
            window.open(url, "_blank", "noopener,noreferrer");
            respond({});
          } else {
            respondError(-32_602, "Only http(s) links can be opened");
          }
          return;
        }
        case "ui/request-display-mode": {
          respond({ displayMode: fit === "fill" ? "pane" : "inline" });
          return;
        }
        case "ui/notifications/size-changed": {
          if (fit === "fill") {
            // The pane owns its own height; a guest cannot resize it.
            return;
          }
          const raw = msg.params?.height;
          const height = typeof raw === "number" ? raw : Number(raw);
          if (Number.isFinite(height)) {
            setHeightPx(
              Math.min(MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, height))
            );
          }
          return;
        }
        case "ping": {
          respond({});
          return;
        }
        default: {
          if (msg.id !== undefined) {
            respondError(-32_601, `Unsupported method: ${msg.method}`);
          }
        }
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (handleRef) {
        handleRef.current = null;
      }
    };
  }, [fit, frameKey, handleRef]);

  return (
    <iframe
      className={cn(
        "w-full bg-background",
        fit === "fill" && "min-h-0 flex-1 border-0",
        className
      )}
      ref={iframeRef}
      sandbox="allow-forms allow-popups allow-scripts"
      srcDoc={srcDoc}
      style={fit === "fill" ? undefined : { height: heightPx }}
      title={title}
    />
  );
}
