"use client";

import { cn } from "@engenty/ui-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { appsAiRequestHeaders } from "../../../ag-ui/apps-ai/apps-ai-api.js";
import { resolveEngentyAiServiceBaseUrlSafe } from "../../../artifacts/artifacts-api.js";

/**
 * MCP Apps widget host frame (spec io.modelcontextprotocol/ui, rev
 * 2026-01-26): a sandboxed srcdoc iframe (opaque origin — no
 * `allow-same-origin`) speaking MCP JSON-RPC over postMessage. Widget
 * `tools/call` requests are proxied through the AI service's
 * `/ai/mcp-apps/call` route, which authenticates the viewing user and
 * validates the target server against the tenant registry.
 *
 * Hand-rolled minimal host on purpose: the official
 * `@modelcontextprotocol/ext-apps` AppBridge tracks the core 2026-07-28
 * release — swap this for it once versions are pinned (exit ramp; the frame
 * props are already shaped for that).
 */

export interface McpAppFrameProps {
  className?: string;
  csp?: { connectDomains?: string[]; resourceDomains?: string[] };
  html: string;
  serverUrl: string;
  structuredContent?: unknown;
  title: string;
  toolInput?: unknown;
  toolName: string;
  toolResult?: unknown;
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
 * Enforce the widget's declared CSP by injecting a meta tag ahead of any
 * widget markup. Undeclared domains stay blocked (`default-src 'none'` base);
 * inline script/style is the spec default for self-contained templates.
 */
export function buildWidgetCsp(csp?: McpAppFrameProps["csp"]): string {
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

function injectCspMeta(html: string, cspValue: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${cspValue}">`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch?.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return html.slice(0, insertAt) + meta + html.slice(insertAt);
  }
  return meta + html;
}

async function proxyToolCall(params: {
  arguments: Record<string, unknown>;
  serverUrl: string;
  toolName: string;
}): Promise<unknown> {
  const base = resolveEngentyAiServiceBaseUrlSafe();
  const headers = await appsAiRequestHeaders();
  const res = await fetch(`${base}/ai/mcp-apps/call`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      server_url: params.serverUrl,
      tool_name: params.toolName,
      arguments: params.arguments,
    }),
  });
  if (!res.ok) {
    throw new Error(`Widget tool call failed (HTTP ${res.status})`);
  }
  const payload = (await res.json()) as { result?: unknown };
  return payload.result ?? {};
}

function hostTheme(): "dark" | "light" {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

export function McpAppFrame({
  className,
  csp,
  html,
  serverUrl,
  structuredContent,
  title,
  toolInput,
  toolName,
  toolResult,
}: McpAppFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [heightPx, setHeightPx] = useState(DEFAULT_HEIGHT_PX);
  // Latest tool data for the push-notifications, without re-binding the
  // message listener per render.
  const dataRef = useRef({ structuredContent, toolInput, toolResult });
  dataRef.current = { structuredContent, toolInput, toolResult };

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

    const pushToolData = () => {
      const {
        structuredContent: sc,
        toolInput: ti,
        toolResult: tr,
      } = dataRef.current;
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
            protocolVersion: "2026-01-26",
            hostInfo: { name: "engenty", version: "1" },
            capabilities: {},
            hostContext: {
              displayMode: "inline",
              locale:
                typeof navigator === "undefined" ? "en" : navigator.language,
              theme: hostTheme(),
            },
          });
          return;
        }
        case "ui/notifications/initialized": {
          pushToolData();
          return;
        }
        case "tools/call": {
          const name =
            typeof msg.params?.name === "string" ? msg.params.name : null;
          if (!name) {
            respondError(-32_602, "tools/call requires a tool name");
            return;
          }
          proxyToolCall({
            arguments: isRecord(msg.params?.arguments)
              ? msg.params.arguments
              : {},
            serverUrl,
            toolName: name,
          })
            .then((result) => respond(result))
            .catch((err) =>
              respondError(
                -32_000,
                err instanceof Error ? err.message : "tool call failed"
              )
            );
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
          // v1 host: widgets render inline; pane/fullscreen stays host-driven.
          respond({ displayMode: "inline" });
          return;
        }
        case "ui/notifications/size-changed": {
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
    return () => window.removeEventListener("message", onMessage);
  }, [serverUrl]);

  return (
    <iframe
      className={cn("w-full bg-background", className)}
      ref={iframeRef}
      sandbox="allow-forms allow-popups allow-scripts"
      srcDoc={srcDoc}
      style={{ height: heightPx }}
      title={title}
    />
  );
}
