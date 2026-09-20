// `show_ui` / `show_objects` — a node that puts something on screen.
//
// Same ids, same schemas and the same payloads as the agent tools of those
// names, so a flow and a specialist render identically. What differs is only
// what a node can know: it has no model turn to compose with, so everything it
// shows is either a constant in the graph or mapped from an earlier step.
//
// Where the card lands is `graph-card.ts` — the specialist's chat, not the run
// log. The primitive returns the same result the agent tool does, so the run
// view renders it too.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  buildObjectRender,
  SHOW_OBJECTS_DESCRIPTION,
  SHOW_OBJECTS_TOOL_ID,
  showObjectsInputSchema,
} from "../../../../ai/tools/show-objects-tool.js";
import {
  buildUiSurface,
  SHOW_UI_DESCRIPTION,
  SHOW_UI_TOOL_ID,
  showUiInputSchema,
} from "../../../../ai/tools/show-ui-tool.js";
import { createRoutineStoreFromEnv } from "../../index.js";
import { appendGraphCard } from "../graph-card.js";
import { readGraphRunContext } from "../run-context.js";

/**
 * A declarative `tool` entry must declare BOTH schemas — Mastra rejects the
 * workflow otherwise ("Tool must have input and output schemas defined"), which
 * is why the agent tools' deliberate lack of one cannot carry over. A loose
 * record is the schema that satisfies that rule without stripping the
 * `_meta` marker the card matches on: an object schema would drop it.
 */
const passthroughOutputSchema = z.record(z.string(), z.unknown());

/** The node's own id in the stored graph, for the card's stable id. */
const entryIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("Set by the designer; identifies this node's card on replay.");

export function createShowUiPrimitive() {
  return createTool({
    id: SHOW_UI_TOOL_ID,
    description: SHOW_UI_DESCRIPTION,
    inputSchema: showUiInputSchema.extend({ entry_id: entryIdSchema }),
    outputSchema: passthroughOutputSchema,
    execute: async (input, ctx) => {
      const runCtx = readGraphRunContext(ctx.requestContext);
      const output = buildUiSurface(input);
      if (output.ok) {
        await appendGraphCard({
          entryId: input.entry_id ?? SHOW_UI_TOOL_ID,
          input: { components: input.components, title: input.title },
          output,
          primitiveId: SHOW_UI_TOOL_ID,
          routines: createRoutineStoreFromEnv(),
          runCtx,
        });
      }
      return output;
    },
  });
}

/**
 * One ref, for a node that MAPS it from an earlier step.
 *
 * A mapping resolves top-level keys only, so `${stepResults.create.output.id}`
 * can fill a string but never an element of `refs` — and the record a write
 * step just made is exactly the thing a graph wants to show. `refs` stays the
 * shape the agent tool speaks; this is its one-at-a-time sibling.
 */
const singleRefSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "One canonical ref ('offers:offer:<id>'), for a node that maps it from an earlier step. Use instead of `refs`."
  );

export function createShowObjectsPrimitive() {
  return createTool({
    id: SHOW_OBJECTS_TOOL_ID,
    description: SHOW_OBJECTS_DESCRIPTION,
    inputSchema: showObjectsInputSchema
      .extend({ entry_id: entryIdSchema })
      .partial({ refs: true })
      .extend({ ref: singleRefSchema }),
    outputSchema: passthroughOutputSchema,
    execute: async (rawInput, ctx) => {
      const refs =
        rawInput.refs && rawInput.refs.length > 0
          ? rawInput.refs
          : rawInput.ref
            ? [rawInput.ref]
            : [];
      if (refs.length === 0) {
        return { ok: false, error: "show_objects: no refs to show" };
      }
      const input = { ...rawInput, refs };
      const runCtx = readGraphRunContext(ctx.requestContext);
      // Refs only. The agent tool resolves a display snapshot as the VIEWING
      // USER, which is what drops refs that user may not see. A node holds a
      // service scope, so resolving here would write a title and status into a
      // message on someone else's thread that the reader is not entitled to.
      // Refs alone are safe — the client resolves them live as whoever looks.
      const output = await buildObjectRender(input, { snapshots: false });
      if (output.ok) {
        await appendGraphCard({
          entryId: input.entry_id ?? SHOW_OBJECTS_TOOL_ID,
          input: { display: input.display, refs: input.refs },
          output,
          primitiveId: SHOW_OBJECTS_TOOL_ID,
          routines: createRoutineStoreFromEnv(),
          runCtx,
        });
      }
      return output;
    },
  });
}
