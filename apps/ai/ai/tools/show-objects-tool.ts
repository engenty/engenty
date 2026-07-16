import {
  formatObjectRef,
  type ObjectDisplayItem,
  type ObjectRef,
  type ObjectRenderMeta,
  parseObjectRef,
} from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { EngentyCoreHttpError } from "../../src/ai/core-http-client.js";
import { getCurrentEngentyToolsClient } from "./engenty-tools/lib/client.js";

/**
 * Renders engenty objects (contacts, offers, tasks, …) in the chat UI by
 * REFERENCE — the module's storage stays canonical, the client resolves live
 * data as the viewing user. The tool fetches a minimal display snapshot per
 * ref through the core gateway with the requesting user's token, so
 * unauthorized refs are dropped server-side too (they never reach the
 * transcript). Output carries the `_meta.engenty.object_render` marker the
 * `core.object-render` card matches on; the marker is display-only and kept
 * small so its echo through model context stays cheap.
 */

const MAX_REFS = 24;
const TITLE_MAX = 120;
const SUBTITLE_MAX = 120;
const STATUS_MAX = 40;

/** Gateway read op per ref type; default is `${module}_get` with `{ id }`. */
const SNAPSHOT_OPERATION_OVERRIDES: Record<string, string> = {
  "team:member": "team_get",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pickString(
  record: Record<string, unknown>,
  keys: string[],
  max: number
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, max);
    }
  }
  return;
}

export function snapshotFromRecord(
  ref: ObjectRef,
  record: Record<string, unknown>
): ObjectDisplayItem {
  const title =
    pickString(
      record,
      ["name", "title", "display_name", "full_name", "subject", "label"],
      TITLE_MAX
    ) ??
    pickString(record, ["number", "email"], TITLE_MAX) ??
    ref.id;
  const subtitle = pickString(
    record,
    ["company", "organization", "email", "city", "role", "position"],
    SUBTITLE_MAX
  );
  const status = pickString(record, ["status", "state"], STATUS_MAX);
  return {
    ref: formatObjectRef(ref),
    title,
    ...(subtitle && subtitle !== title ? { subtitle } : {}),
    ...(status ? { status } : {}),
  };
}

function snapshotOperationId(ref: ObjectRef): string {
  return (
    SNAPSHOT_OPERATION_OVERRIDES[`${ref.module}:${ref.entity}`] ??
    `${ref.module}_get`
  );
}

interface SnapshotOutcome {
  item?: ObjectDisplayItem;
  /** Authz/not-found — the ref must not render at all. */
  dropped?: boolean;
  /** Module has no matching read op — keep the ref, client resolves live. */
  unresolved?: boolean;
}

async function fetchSnapshot(
  invokeTool: (toolId: string, input: unknown) => Promise<unknown>,
  ref: ObjectRef
): Promise<SnapshotOutcome> {
  try {
    const result = await invokeTool(snapshotOperationId(ref), { id: ref.id });
    if (result === null || result === undefined) {
      return { dropped: true };
    }
    if (!isRecord(result)) {
      return { unresolved: true };
    }
    // Some gateway ops wrap payloads in a { data } envelope.
    const record = isRecord(result.data) ? result.data : result;
    return { item: snapshotFromRecord(ref, record) };
  } catch (err) {
    if (err instanceof EngentyCoreHttpError) {
      if (err.status === 403 || err.status === 404) {
        // 404 on the op route (unknown operation) is indistinguishable from a
        // missing record via status alone; use the code to keep unknown-op
        // refs renderable client-side.
        if (err.code === "not_found" && /operation|tool/i.test(err.message)) {
          return { unresolved: true };
        }
        return { dropped: true };
      }
    }
    // Service errors: keep the ref, client-side resolution may still work.
    return { unresolved: true };
  }
}

export function createShowObjectsTool() {
  return createTool({
    id: "show_objects",
    description:
      "Render engenty objects (contacts, offers, tasks, invoices, team members, …) as interactive cards in the chat UI instead of describing them in prose. Pass refs as '<module>:<entity>:<id>' strings, e.g. 'contacts:contact:<uuid>' or 'offers:offer:<uuid>'. Use display 'inline' for cards in the conversation (default), 'panel' to open in the side panel, 'expanded' for the large view. Prefer this whenever the user asks to see, list, or work on records.",
    inputSchema: z.object({
      refs: z
        .array(z.string().min(1))
        .min(1)
        .max(MAX_REFS)
        .describe("Canonical object refs: '<module>:<entity>:<id>'."),
      display: z.enum(["inline", "panel", "expanded"]).optional(),
      title: z
        .string()
        .max(256)
        .optional()
        .describe("Tab title when display is panel/expanded."),
      query: z
        .string()
        .max(512)
        .optional()
        .describe("The user query/filter these objects answer, for context."),
      total: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Total matches when refs are a subset of a larger result."),
    }),
    // No outputSchema on purpose: schema validation would strip the
    // `_meta.engenty.object_render` marker the UI card matches on (same
    // reason the MCP-app dynamic tool omits it).
    execute: async (input) => {
      const parsed: ObjectRef[] = [];
      const invalid: string[] = [];
      for (const raw of input.refs) {
        const ref = parseObjectRef(raw);
        if (ref) {
          parsed.push(ref);
        } else {
          invalid.push(raw);
        }
      }

      const client = getCurrentEngentyToolsClient();
      const items: ObjectDisplayItem[] = [];
      const shownRefs: string[] = [];
      const dropped: string[] = [];
      if (client.ok) {
        const outcomes = await Promise.all(
          parsed.map((ref) =>
            fetchSnapshot(
              (toolId, opInput) => client.client.invokeTool(toolId, opInput),
              ref
            ).then((outcome) => ({ ref, outcome }))
          )
        );
        for (const { ref, outcome } of outcomes) {
          if (outcome.dropped) {
            dropped.push(formatObjectRef(ref));
            continue;
          }
          shownRefs.push(formatObjectRef(ref));
          if (outcome.item) {
            items.push(outcome.item);
          }
        }
      } else {
        // No end-user token (headless run): render refs without snapshots —
        // the client resolves live data with the viewing user's own session.
        shownRefs.push(...parsed.map(formatObjectRef));
      }

      if (shownRefs.length === 0) {
        return {
          ok: false,
          shown: 0,
          dropped: dropped.length,
          invalid: invalid.length,
          titles: [],
        };
      }

      const objectRender: ObjectRenderMeta = {
        refs: shownRefs,
        display: input.display ?? "inline",
        items,
        ...(input.title ? { title: input.title } : {}),
        ...(input.query || input.total !== undefined
          ? {
              provenance: {
                ...(input.total !== undefined ? { total: input.total } : {}),
                ...(input.query ? { query: input.query } : {}),
              },
            }
          : {}),
        ...(dropped.length > 0 ? { dropped } : {}),
      };

      return {
        ok: true,
        shown: shownRefs.length,
        dropped: dropped.length,
        invalid: invalid.length,
        titles: items.map((item) => item.title),
        _meta: { engenty: { object_render: objectRender } },
      };
    },
  });
}
