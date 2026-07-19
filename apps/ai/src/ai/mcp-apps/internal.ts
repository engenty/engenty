/**
 * Internal MCP Apps origin (`engenty:internal`) — first-party and
 * agent-generated widgets rendered through the same sandboxed frame and
 * postMessage bridge as external MCP app widgets. Two differences from
 * external servers:
 *
 * - `tools/call` never goes out over HTTP: it runs through the core gateway
 *   with the VIEWING USER's token (the same `invokeTool` path `show_objects`
 *   snapshots use), so authz is module authz, not server trust. An internal
 *   widget can call `offers_update` exactly as far as the user could.
 * - Templates come from an in-process registry (modules pre-declare `ui://`
 *   documents at boot), not a `resources/read` round-trip.
 */

import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";
import type { McpAppCsp, McpAppToolResult } from "./http-client.js";

/**
 * Pseudo server id/url marking the internal origin. It doubles as the
 * `server_url` widgets echo back through the bridge proxy, so it must never
 * be a resolvable URL.
 */
export const INTERNAL_MCP_APP_SERVER_ID = "engenty:internal";
export const INTERNAL_MCP_APP_SERVER_URL = "engenty:internal";
export const INTERNAL_MCP_APP_SERVER_LABEL = "Engenty";

/** Generated/first-party widget HTML cap — well below the 1MB template cap. */
export const INTERNAL_WIDGET_MAX_BYTES = 262_144;
/** Bridge `tools/call` argument payload cap for internal calls. */
export const INTERNAL_CALL_ARGS_MAX_BYTES = 65_536;

export interface InternalMcpAppTemplate {
  /** Declared CSP domains; omitted = fully self-contained (no network). */
  csp?: McpAppCsp;
  html: string;
  /** `ui://` identifier, e.g. `ui://offers/quick-edit.html`. */
  uri: string;
}

const internalTemplates = new Map<string, InternalMcpAppTemplate>();

/**
 * Register a first-party widget template. Modules call this at boot so their
 * tools can return rich sandboxed widgets without shipping JS into the host
 * bundle. Returns an unregister handle (tests, module reload).
 */
export function registerInternalMcpAppTemplate(
  template: InternalMcpAppTemplate
): () => void {
  if (Buffer.byteLength(template.html, "utf8") > INTERNAL_WIDGET_MAX_BYTES) {
    throw new Error(
      `Internal MCP App template ${template.uri} exceeds the ${INTERNAL_WIDGET_MAX_BYTES} byte limit`
    );
  }
  internalTemplates.set(template.uri, template);
  return () => {
    if (internalTemplates.get(template.uri) === template) {
      internalTemplates.delete(template.uri);
    }
  };
}

export function getInternalMcpAppTemplate(
  uri: string
): InternalMcpAppTemplate | undefined {
  return internalTemplates.get(uri);
}

export function clearInternalMcpAppTemplatesForTests(): void {
  internalTemplates.clear();
}

/**
 * Build the `_meta.engenty.mcp_app` tool result for a registered internal
 * template — the first-party sibling of `callMcpAppTool`'s payload assembly.
 * Module tools call this from `execute` and spread the result into their
 * return value (no `outputSchema`, or the marker gets stripped).
 */
export function buildInternalMcpAppToolResult(params: {
  resourceUri: string;
  structuredContent?: unknown;
  text?: string;
  toolName: string;
}): McpAppToolResult {
  const template = getInternalMcpAppTemplate(params.resourceUri);
  if (!template) {
    return {
      ok: false,
      content: [
        {
          type: "text",
          text: `No internal widget template registered for ${params.resourceUri}`,
        },
      ],
      result: null,
    };
  }
  return {
    ok: true,
    content: [
      {
        type: "text",
        text:
          params.text ??
          "The interactive widget has been rendered in the chat.",
      },
    ],
    result: null,
    _meta: {
      engenty: {
        mcp_app: {
          html: template.html,
          resource_uri: params.resourceUri,
          server_id: INTERNAL_MCP_APP_SERVER_ID,
          server_label: INTERNAL_MCP_APP_SERVER_LABEL,
          server_url: INTERNAL_MCP_APP_SERVER_URL,
          tool_name: params.toolName,
          ...(template.csp ? { csp: template.csp } : {}),
          ...(params.structuredContent === undefined
            ? {}
            : { structured_content: params.structuredContent }),
        },
      },
    },
  };
}

export class InternalMcpAppCallError extends Error {
  readonly code: string;
  readonly status: 400 | 401 | 502;

  constructor(status: 400 | 401 | 502, code: string, message: string) {
    super(message);
    this.name = "InternalMcpAppCallError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Execute a widget-initiated `tools/call` against the core gateway as the
 * viewing user. MUST run with the user's token — never a service principal
 * (docs/wip/generative-ui.md §7): the gateway enforces module authz per call.
 * Returns an MCP-shaped result so widgets read internal and external calls
 * identically.
 */
export async function callInternalMcpAppTool(params: {
  arguments: Record<string, unknown>;
  coreBaseUrl?: string;
  fetchImpl?: typeof fetch;
  toolName: string;
  userAccessToken: string | undefined;
}): Promise<{
  content: Array<{ text: string; type: "text" }>;
  structuredContent: unknown;
}> {
  if (!params.userAccessToken) {
    throw new InternalMcpAppCallError(
      401,
      "mcpApps.internalUnauthorized",
      "Internal widget tool calls require the viewing user's session"
    );
  }
  if (
    Buffer.byteLength(JSON.stringify(params.arguments), "utf8") >
    INTERNAL_CALL_ARGS_MAX_BYTES
  ) {
    throw new InternalMcpAppCallError(
      400,
      "mcpApps.internalArgumentsTooLarge",
      `Internal widget tool call arguments exceed ${INTERNAL_CALL_ARGS_MAX_BYTES} bytes`
    );
  }
  const coreBaseUrl = params.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
  if (!coreBaseUrl) {
    throw new InternalMcpAppCallError(
      502,
      "mcpApps.internalUnconfiguredCore",
      "Core gateway base URL is not configured"
    );
  }
  const client = new EngentyCoreClient({
    coreBaseUrl,
    userAccessToken: params.userAccessToken,
    ...(params.fetchImpl ? { fetchImpl: params.fetchImpl } : {}),
  });
  const data = await client.invokeTool(params.toolName, params.arguments);
  return {
    content: [{ type: "text", text: JSON.stringify(data ?? null) }],
    structuredContent: data ?? null,
  };
}
