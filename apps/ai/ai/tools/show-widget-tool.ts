import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  INTERNAL_MCP_APP_SERVER_ID,
  INTERNAL_MCP_APP_SERVER_LABEL,
  INTERNAL_MCP_APP_SERVER_URL,
  INTERNAL_WIDGET_MAX_BYTES,
} from "../../src/ai/mcp-apps/internal.js";

/**
 * Generative UI (docs/wip/generative-ui.md §4): the agent authors a
 * self-contained HTML widget and the chat renders it through the same
 * sandboxed MCP Apps frame external servers use. The sandbox + injected CSP
 * (`default-src 'none'`, opaque origin, no `allow-same-origin`) is the safety
 * boundary for generated code; interactivity flows through the bridge's
 * `tools/call`, which the host proxies to the core gateway as the VIEWING
 * USER — so a widget can read/write workspace data exactly as far as the user
 * could, and no further.
 *
 * The widget HTML is persisted as the tool output (`_meta` marker), so replay
 * works like every other card. Oversize widgets are rejected, not truncated.
 */

const WIDGET_BRIDGE_GUIDE = [
  "The widget runs in a sandboxed iframe with all network access blocked (CSP default-src 'none'); inline <style> and <script> work, external scripts/styles/fonts/XHR do not.",
  "Talk to the host over postMessage JSON-RPC 2.0 on window.parent:",
  "1. send {jsonrpc:'2.0', id:1, method:'ui/initialize'} and await the response (theme/locale in result.hostContext),",
  "2. send {jsonrpc:'2.0', method:'ui/notifications/initialized'} — the host then pushes {method:'ui/notifications/tool-result', params:{result:{structuredContent}}} carrying this tool's `data` input,",
  "3. call workspace tools with {jsonrpc:'2.0', id:N, method:'tools/call', params:{name:'<gateway tool id, e.g. contacts_list>', arguments:{...}}} — calls run with the viewing user's permissions,",
  "4. report height with {jsonrpc:'2.0', method:'ui/notifications/size-changed', params:{height:<px>}} (host clamps 120–640).",
  "Listen for responses via window.addEventListener('message', …) and match ids.",
].join(" ");

export function createShowWidgetTool() {
  return createTool({
    id: "show_widget",
    description:
      "Render an agent-authored, self-contained HTML widget as an interactive sandboxed card in the chat. Use when a one-off rich UI (a small tool, chart, visualization, or mini-form) serves better than prose and no native card fits. " +
      WIDGET_BRIDGE_GUIDE,
    inputSchema: z.object({
      html: z
        .string()
        .min(1)
        .describe(
          "Complete self-contained HTML document for the widget (inline CSS/JS only)."
        ),
      data: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Optional JSON handed to the widget as its tool-result structuredContent (kept out of model context)."
        ),
      title: z.string().max(160).optional().describe("Short widget title."),
    }),
    // No outputSchema on purpose: schema validation would strip the
    // `_meta.engenty.mcp_app` marker the UI card matches on (same reason
    // show_objects and the MCP-app dynamic tool omit it).
    execute: async (input) => {
      const bytes = Buffer.byteLength(input.html, "utf8");
      if (bytes > INTERNAL_WIDGET_MAX_BYTES) {
        return {
          ok: false,
          error: `Widget HTML is ${bytes} bytes; the limit is ${INTERNAL_WIDGET_MAX_BYTES}. Trim the widget instead of splitting it.`,
        };
      }
      return {
        ok: true,
        ...(input.title ? { title: input.title } : {}),
        summary: "The interactive widget has been rendered in the chat.",
        _meta: {
          engenty: {
            mcp_app: {
              html: input.html,
              server_id: INTERNAL_MCP_APP_SERVER_ID,
              server_label: INTERNAL_MCP_APP_SERVER_LABEL,
              server_url: INTERNAL_MCP_APP_SERVER_URL,
              tool_name: "show_widget",
              // Self-contained by contract: no connect/resource domains — the
              // injected CSP keeps generated widgets offline (§4 guardrail).
              ...(input.data === undefined
                ? {}
                : { structured_content: input.data }),
            },
          },
        },
      };
    },
  });
}
