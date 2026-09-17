"use client";

import { cn } from "@engenty/ui-core";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Sandboxed host frame using the official MCP Apps AppBridge
 * (`io.modelcontextprotocol/ui`). Isolation is not optional: `srcdoc` without
 * `allow-same-origin` gives the guest an opaque origin — no cookies, no local
 * storage, no host session, no bearer tokens.
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
  initialData?: {
    structuredContent?: unknown;
    toolInput?: unknown;
    toolResult?: unknown;
  };
  onNotify?: (text: string) => void;
  title: string;
}

const MIN_HEIGHT_PX = 120;
const MAX_HEIGHT_PX = 640;
const DEFAULT_HEIGHT_PX = 320;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

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
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }
    let cancelled = false;
    let bridge: AppBridge | null = null;

    const start = async () => {
      const win = iframe.contentWindow;
      if (!win || cancelled) {
        return;
      }
      const next = new AppBridge(
        null,
        { name: "engenty", version: "1" },
        { openLinks: {}, serverTools: {} },
        {
          hostContext: {
            displayMode: fit === "fill" ? "fullscreen" : "inline",
            availableDisplayModes: ["inline", "fullscreen"],
            platform: "web",
            theme: hostTheme(),
          },
        }
      );
      bridge = next;
      next.oncalltool = async (params) => {
        const result = await callToolRef.current(
          params.name,
          isRecord(params.arguments) ? params.arguments : {}
        );
        if (isRecord(result) && Array.isArray(result.content)) {
          return result as {
            content: Array<{ type: "text"; text: string }>;
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: typeof result === "string" ? result : "ok",
            },
          ],
        };
      };
      next.onopenlink = async (params) => {
        if (/^https?:\/\//i.test(params.url)) {
          window.open(params.url, "_blank", "noopener,noreferrer");
        }
        return {};
      };
      next.onmessage = async (params) => {
        const text = params.content
          .map((block) =>
            block.type === "text" && "text" in block ? String(block.text) : ""
          )
          .join("")
          .trim();
        if (text) {
          notifyRef.current?.(text.slice(0, 2000));
        }
        return {};
      };
      next.onsizechange = ({ height }) => {
        if (fit === "fill" || typeof height !== "number") {
          return;
        }
        setHeightPx(Math.min(MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, height)));
      };
      next.oninitialized = () => {
        const data = dataRef.current;
        void next.sendToolInput({
          arguments: isRecord(data?.toolInput) ? data.toolInput : {},
        });
        void next.sendToolResult({
          content: [],
          structuredContent: data?.structuredContent,
          ...(isRecord(data?.toolResult) ? data.toolResult : {}),
        });
      };
      if (handleRef) {
        handleRef.current = {
          notify: (method, params) => {
            if (method === "ui/notifications/tool-result") {
              void next.sendToolResult({
                content: [],
                ...(isRecord(params) ? params : {}),
              });
            }
          },
        };
      }
      await next.connect(new PostMessageTransport(win, win));
    };

    const onLoad = () => {
      void start();
    };
    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") {
      void start();
    }
    return () => {
      cancelled = true;
      iframe.removeEventListener("load", onLoad);
      if (handleRef) {
        handleRef.current = null;
      }
      void bridge?.teardownResource({}).catch(() => undefined);
    };
  }, [fit, frameKey, handleRef, srcDoc]);

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
