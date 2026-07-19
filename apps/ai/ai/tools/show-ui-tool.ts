import {
  buildEngentyA2uiMessages,
  ENGENTY_A2UI_CATALOG_ID,
  ENGENTY_A2UI_PROMPT_GUIDE,
  validateEngentyA2uiComponents,
} from "@engenty/a2ui-catalog/spec";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Declarative generative UI (docs/wip/generative-ui.md §5): the agent
 * composes chrome-less native UI from the engenty A2UI catalog — flat
 * component list + data model, rendered in-app from client-controlled
 * implementations (no sandbox needed; UI-as-data). The payload is validated
 * agent-side BEFORE anything reaches the user, and persisted as the ordered
 * A2UI v0.9 message list in `_meta.engenty.a2ui` so transcript replay
 * re-feeds it through the same renderer.
 */

const MAX_COMPONENTS = 64;
const MAX_PAYLOAD_BYTES = 65_536;

export function createShowUiTool() {
  return createTool({
    id: "show_ui",
    description:
      "Compose a native, chrome-less UI surface in the chat from the engenty component catalog — dynamic lists, facts grids, small action sets — when no fixed card fits but the UI should look native (for arbitrary HTML use show_widget instead; to show plain records use show_objects). " +
      ENGENTY_A2UI_PROMPT_GUIDE,
    inputSchema: z.object({
      components: z
        .array(z.record(z.string(), z.unknown()))
        .min(1)
        .max(MAX_COMPONENTS)
        .describe(
          "Flat A2UI component list. Each entry: { id, component, ...props }. Children reference sibling ids; exactly one entry must have id 'root'."
        ),
      data: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Optional data model; component props bind into it with {"path": "/json/pointer"}.'
        ),
      title: z.string().max(160).optional().describe("Short surface title."),
    }),
    // No outputSchema on purpose: schema validation would strip the
    // `_meta.engenty.a2ui` marker the UI card matches on.
    execute: async (input) => {
      const issues = validateEngentyA2uiComponents(input.components);
      if (issues.length > 0) {
        return {
          ok: false,
          error: "Invalid A2UI components — fix and retry.",
          issues: issues.slice(0, 8),
        };
      }
      const payloadBytes = Buffer.byteLength(
        JSON.stringify({ components: input.components, data: input.data }),
        "utf8"
      );
      if (payloadBytes > MAX_PAYLOAD_BYTES) {
        return {
          ok: false,
          error: `UI payload is ${payloadBytes} bytes; the limit is ${MAX_PAYLOAD_BYTES}. Compose a smaller surface.`,
        };
      }
      const { messages, surfaceId } = buildEngentyA2uiMessages({
        components: input.components,
        data: input.data,
        surfaceId: `ui-${crypto.randomUUID()}`,
      });
      return {
        ok: true,
        components: input.components.length,
        ...(input.title ? { title: input.title } : {}),
        summary: "The UI surface has been rendered in the chat.",
        _meta: {
          engenty: {
            a2ui: {
              catalog_id: ENGENTY_A2UI_CATALOG_ID,
              messages,
              surface_id: surfaceId,
              ...(input.title ? { title: input.title } : {}),
            },
          },
        },
      };
    },
  });
}
