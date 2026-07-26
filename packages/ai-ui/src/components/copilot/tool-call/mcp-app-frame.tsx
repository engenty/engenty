"use client";

import { appsAiRequestHeaders } from "../../../ag-ui/apps-ai/apps-ai-api.js";
import { resolveEngentyAiServiceBaseUrlSafe } from "../../../artifacts/artifacts-api.js";
import { BridgedFrame, type BridgedFrameCsp } from "./bridged-frame.js";

/**
 * MCP Apps widget host frame (spec io.modelcontextprotocol/ui, rev
 * 2026-01-26). The transport lives in `BridgedFrame`, which engenty Apps in
 * the artifact pane share; this module supplies the MCP-server transport:
 * widget `tools/call` requests are proxied through the AI service's
 * `/ai/mcp-apps/call` route, which authenticates the viewing user and
 * validates the target server against the tenant registry.
 */

export interface McpAppFrameProps {
  className?: string;
  csp?: BridgedFrameCsp;
  html: string;
  serverUrl: string;
  structuredContent?: unknown;
  title: string;
  toolInput?: unknown;
  toolName: string;
  toolResult?: unknown;
}

async function proxyToolCall(params: {
  arguments: Record<string, unknown>;
  serverUrl: string;
  toolName: string;
}): Promise<unknown> {
  const base = resolveEngentyAiServiceBaseUrlSafe();
  const headers = await appsAiRequestHeaders();
  const res = await fetch(`${base}/ai/mcp-apps/call`, {
    body: JSON.stringify({
      arguments: params.arguments,
      server_url: params.serverUrl,
      tool_name: params.toolName,
    }),
    headers: { ...headers, "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Widget tool call failed (HTTP ${res.status})`);
  }
  const payload = (await res.json()) as { result?: unknown };
  return payload.result ?? {};
}

export function McpAppFrame({
  className,
  csp,
  html,
  serverUrl,
  structuredContent,
  title,
  toolInput,
  toolResult,
}: McpAppFrameProps) {
  return (
    <BridgedFrame
      callTool={(name, args) =>
        proxyToolCall({ arguments: args, serverUrl, toolName: name })
      }
      csp={csp}
      fit="inline"
      frameKey={serverUrl}
      html={html}
      initialData={{ structuredContent, toolInput, toolResult }}
      title={title}
      {...(className ? { className } : {})}
    />
  );
}

// Re-exported from its original home: the CSP builder is covered by tests and
// imported by name elsewhere.
export { buildWidgetCsp } from "./bridged-frame.js";
