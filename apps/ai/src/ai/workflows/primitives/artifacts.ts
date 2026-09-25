// `artifact_write` / `artifact_read` / `show_artifact` — a node that produces a
// deliverable.
//
// These call the same operations the agent tools of those names call, rather
// than reimplementing them: one write path, one scope resolution, one mirror.
// The node's only extra job is to put the run's identity where those operations
// look for it — they read the engenty-tools ALS, a primitive reads
// `requestContext` — and to deliver the card, which an agent gets for free from
// its own transcript.
//
// A node has no agent, so `agentTypeKey` stays null in the bridge. That is
// load-bearing: `resolveWriteScope` promotes to the Space when an agent key is
// set, and a flow that silently promoted every artifact to the Space would be a
// surprise. A node's artifact stays on its thread unless the graph says
// `store_to`.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  ARTIFACT_READ_DESCRIPTION,
  ARTIFACT_WRITE_DESCRIPTION,
  artifactReadInputSchema,
  artifactReadOutputSchema,
  artifactWriteInputSchema,
  artifactWriteOutputSchema,
  createArtifactOperations,
  SHOW_ARTIFACT_DESCRIPTION,
  showArtifactInputSchema,
  showArtifactOutputSchema,
} from "../../../../ai/tools/artifact-tools.js";
import { createArtifactStoreFromEnv } from "../../../dal/artifacts/artifact-store.js";
import { createRoutineStoreFromEnv } from "../../index.js";
import { appendGraphCard } from "../graph-card.js";
import {
  ARTIFACT_READ_PRIMITIVE_ID,
  ARTIFACT_WRITE_PRIMITIVE_ID,
  SHOW_ARTIFACT_PRIMITIVE_ID,
} from "../primitive-ids.js";
import { withHouseStyle } from "../report-style.js";
import { readGraphRunContext, resolveGraphRunScope } from "../run-context.js";
import { withGraphToolsAls } from "../tool-bridge.js";

export {
  ARTIFACT_READ_PRIMITIVE_ID,
  ARTIFACT_WRITE_PRIMITIVE_ID,
  SHOW_ARTIFACT_PRIMITIVE_ID,
} from "../primitive-ids.js";

/** The node's own id in the stored graph, for the card's stable id. */
const entryIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("Set by the designer; identifies this node's card on replay.");

/**
 * A graph cannot know its Space when it is written — a routine's graph runs
 * in whichever Space fires it. `{ scope_type: "space" }` without an id means
 * this run's Space.
 */
const nodeStoreToSchema = z
  .object({
    scope_id: z.string().min(1).optional(),
    scope_type: z.enum(["task", "project", "space", "agent"]),
  })
  .optional();

function runSpaceId(space: unknown): string | null {
  return space &&
    typeof space === "object" &&
    "spaceId" in space &&
    typeof space.spaceId === "string"
    ? space.spaceId
    : null;
}

const CARD_FIELDS = [
  "attention",
  "headline",
  "highlights",
  "key_figures",
  "meta",
  "sections",
  "status",
  "status_tone",
] as const;

/** The parts of an answer the chat card is composed from. */
function cardFields(
  answer: Record<string, unknown> | undefined
): Record<string, unknown> {
  return Object.fromEntries(
    CARD_FIELDS.flatMap((key) =>
      answer?.[key] === undefined ? [] : [[key, answer[key]]]
    )
  );
}

export function createArtifactPrimitives() {
  const ops = createArtifactOperations();

  const artifactWrite = createTool({
    id: ARTIFACT_WRITE_PRIMITIVE_ID,
    description: ARTIFACT_WRITE_DESCRIPTION,
    inputSchema: artifactWriteInputSchema.extend({
      entry_id: entryIdSchema,
      store_to: nodeStoreToSchema,
      update_same_title: z
        .boolean()
        .optional()
        .describe(
          "When the scope already holds a page with this title, add a version to it instead of creating another — a routine's daily page stays one page per day."
        ),
      house_style: z
        .boolean()
        .optional()
        .describe(
          "Store an HTML document with the house stylesheet in its head — a routine's report."
        ),
      answer: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "The answer the document came from; its key figures, highlights and sections ride on to the chat card."
        ),
    }),
    // The summary and the card fields ride on: the settle reads a run's
    // summary and its chat card from its last step.
    outputSchema: artifactWriteOutputSchema.extend({
      ...Object.fromEntries(
        CARD_FIELDS.map((key) => [key, z.unknown().optional()])
      ),
      summary: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      const runCtx = readGraphRunContext(ctx.requestContext);
      const scope = await resolveGraphRunScope(runCtx);
      const {
        answer,
        house_style: houseStyle,
        entry_id: entryId,
        store_to: storeTo,
        update_same_title: updateSameTitle,
        ...fields
      } = input;
      const rest =
        houseStyle &&
        fields.type === "html" &&
        typeof fields.content === "string"
          ? { ...fields, content: withHouseStyle(fields.content) }
          : fields;
      const scopeId =
        storeTo?.scope_id ??
        (storeTo?.scope_type === "space" ? runSpaceId(runCtx.space) : null);
      if (storeTo && !scopeId) {
        return { error: "store_to_space_unknown" };
      }
      const target =
        storeTo && scopeId
          ? { scope_id: scopeId, scope_type: storeTo.scope_type }
          : null;
      const existing =
        updateSameTitle && target && rest.title && !rest.artifact_id
          ? await createArtifactStoreFromEnv()?.findByTitle({
              scopeId: target.scope_id,
              scopeType: target.scope_type,
              tenantId: runCtx.tenantId,
              title: rest.title,
              type: rest.type ?? "markdown",
            })
          : null;
      const write = existing
        ? {
            ...rest,
            artifact_id: existing.id,
            expected_version: existing.current_version,
            summary: rest.summary ?? "",
          }
        : target
          ? { ...rest, store_to: target }
          : rest;
      const output = {
        ...(await withGraphToolsAls(runCtx, scope, () =>
          ops.writeArtifact(write)
        )),
        ...(write.summary ? { summary: write.summary } : {}),
        ...cardFields(answer),
      };
      if (output.artifact_id && !output.error) {
        // An agent's write surfaces on its own because the tool call is in its
        // transcript. A node has no transcript, so it posts the same card.
        await appendGraphCard({
          entryId: entryId ?? ARTIFACT_WRITE_PRIMITIVE_ID,
          input: { title: write.title, type: write.type },
          output,
          primitiveId: ARTIFACT_WRITE_PRIMITIVE_ID,
          routines: createRoutineStoreFromEnv(),
          runCtx,
        });
      }
      return output;
    },
  });

  // A read, so no card: nothing happened that a person needs to see. It exists
  // because updating an artifact needs its `expected_version`.
  const artifactRead = createTool({
    id: ARTIFACT_READ_PRIMITIVE_ID,
    description: ARTIFACT_READ_DESCRIPTION,
    inputSchema: artifactReadInputSchema,
    outputSchema: artifactReadOutputSchema,
    execute: async (input, ctx) => {
      const runCtx = readGraphRunContext(ctx.requestContext);
      const scope = await resolveGraphRunScope(runCtx);
      return await withGraphToolsAls(runCtx, scope, () =>
        ops.readArtifact(input)
      );
    },
  });

  const artifactShow = createTool({
    id: SHOW_ARTIFACT_PRIMITIVE_ID,
    description: SHOW_ARTIFACT_DESCRIPTION,
    inputSchema: showArtifactInputSchema.extend({ entry_id: entryIdSchema }),
    outputSchema: showArtifactOutputSchema,
    execute: async (input, ctx) => {
      const runCtx = readGraphRunContext(ctx.requestContext);
      const scope = await resolveGraphRunScope(runCtx);
      const { entry_id: entryId, ...show } = input;
      const output = await withGraphToolsAls(runCtx, scope, () =>
        ops.showArtifact(show)
      );
      if (output.artifact_id && !output.error) {
        await appendGraphCard({
          entryId: entryId ?? SHOW_ARTIFACT_PRIMITIVE_ID,
          input: show,
          output,
          primitiveId: SHOW_ARTIFACT_PRIMITIVE_ID,
          routines: createRoutineStoreFromEnv(),
          runCtx,
        });
      }
      return output;
    },
  });

  return {
    [ARTIFACT_READ_PRIMITIVE_ID]: artifactRead,
    [ARTIFACT_WRITE_PRIMITIVE_ID]: artifactWrite,
    [SHOW_ARTIFACT_PRIMITIVE_ID]: artifactShow,
  };
}
