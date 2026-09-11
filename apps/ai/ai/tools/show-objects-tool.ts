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

/**
 * Canonical ref types that have a registered UI widget. The entity name is not
 * derivable from the module name (`team` holds `member`s), so models guess —
 * `team:team:<id>` was a real miss that silently degraded to the generic
 * fallback card. Normalize the plausible guesses instead of shipping a
 * worse-looking card, and keep the list in the tool description so the model
 * mostly gets it right first.
 */
const OBJECT_TYPE_ALIASES: Record<string, string> = {
  "team:team": "team:member",
  "team:teammember": "team:member",
  "team:team_member": "team:member",
  "contacts:contacts": "contacts:contact",
  "offers:offers": "offers:offer",
  "tasks:tasks": "tasks:task",
  "invoices:invoices": "invoices:invoice",
};

/** Map a ref onto its canonical type when the model guessed an alias. */
export function normalizeObjectRef(ref: ObjectRef): ObjectRef {
  const canonical =
    OBJECT_TYPE_ALIASES[`${ref.module}:${ref.entity}`.toLowerCase()];
  if (!canonical) {
    return ref;
  }
  const [module, entity] = canonical.split(":");
  return { ...ref, module, entity };
}

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
  /** Authz/not-found — the ref must not render at all. */
  dropped?: boolean;
  item?: ObjectDisplayItem;
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
    if (
      err instanceof EngentyCoreHttpError &&
      (err.status === 403 || err.status === 404)
    ) {
      // 404 on the op route (unknown operation) is indistinguishable from a
      // missing record via status alone; use the code to keep unknown-op
      // refs renderable client-side.
      if (err.code === "not_found" && /operation|tool/i.test(err.message)) {
        return { unresolved: true };
      }
      return { dropped: true };
    }
    // Service errors: keep the ref, client-side resolution may still work.
    return { unresolved: true };
  }
}

export const SHOW_OBJECTS_TOOL_ID = "show_objects";

export const SHOW_OBJECTS_DESCRIPTION =
  "Render engenty objects (contacts, offers, tasks, invoices, team members, …) as interactive cards in the chat UI instead of describing them in prose. Pass refs as '<module>:<entity>:<id>' strings. The entity is NOT the module name — use exactly: 'contacts:contact:<uuid>', 'offers:offer:<uuid>', 'tasks:task:<uuid>', 'invoices:invoice:<uuid>', 'team:member:<uuid>'. Use display 'inline' for cards in the conversation (default), 'panel' to open in the side panel, 'expanded' for the large view. When the user wants to work ON one record (e.g. 'let's work on offer X', 'show me the full offer'), pass its single ref with display 'expanded' — offers/invoices then render as a full document beside the chat that live-updates as you edit them with module tools. Prefer this whenever the user asks to see, list, or work on records.";

export const showObjectsInputSchema = z.object({
  refs: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_REFS)
    .describe(
      "Canonical object refs: 'contacts:contact:<id>', 'offers:offer:<id>', 'tasks:task:<id>', 'invoices:invoice:<id>', 'team:member:<id>'."
    ),
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
});

export type ShowObjectsInput = z.infer<typeof showObjectsInputSchema>;

export interface BuildObjectRenderOptions {
  /**
   * Resolve a display snapshot per ref before the card is written.
   *
   * TRUE only when the caller holds the VIEWING USER's token: the snapshot
   * carries title/subtitle/status into the persisted message, and the gateway
   * read is what drops refs that user may not see.
   *
   * FALSE for a graph-action node, which holds a service scope — resolving
   * there would write fields into a message on someone else's thread that the
   * reader is not entitled to. Refs alone are safe: the client resolves them
   * live as whoever is looking.
   */
  snapshots: boolean;
}

/** The card payload for a set of refs — the `_meta.engenty.object_render` marker included. */
export async function buildObjectRender(
  input: ShowObjectsInput,
  options: BuildObjectRenderOptions
): Promise<Record<string, unknown>> {
  const parsed: ObjectRef[] = [];
  const invalid: string[] = [];
  for (const raw of input.refs) {
    const ref = parseObjectRef(raw);
    if (ref) {
      parsed.push(normalizeObjectRef(ref));
    } else {
      invalid.push(raw);
    }
  }

  const client = options.snapshots
    ? getCurrentEngentyToolsClient()
    : { ok: false as const };
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
    // No end-user token (headless run), or snapshots deliberately off — render
    // refs alone and let the client resolve live data with the viewing user's
    // own session.
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
            ...(input.total === undefined ? {} : { total: input.total }),
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
}

export function createShowObjectsTool() {
  return createTool({
    id: SHOW_OBJECTS_TOOL_ID,
    description: SHOW_OBJECTS_DESCRIPTION,
    inputSchema: showObjectsInputSchema,
    // No outputSchema on purpose: schema validation would strip the
    // `_meta.engenty.object_render` marker the UI card matches on (same
    // reason the MCP-app dynamic tool omits it).
    execute: async (input) => buildObjectRender(input, { snapshots: true }),
  });
}
