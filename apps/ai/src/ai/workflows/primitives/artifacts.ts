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
import { createRoutineStoreFromEnv } from "../../index.js";
import { appendGraphCard } from "../graph-card.js";
import {
  ARTIFACT_READ_PRIMITIVE_ID,
  ARTIFACT_WRITE_PRIMITIVE_ID,
  SHOW_ARTIFACT_PRIMITIVE_ID,
} from "../primitive-ids.js";
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

export function createArtifactPrimitives() {
  const ops = createArtifactOperations();

  const artifactWrite = createTool({
    id: ARTIFACT_WRITE_PRIMITIVE_ID,
    description: ARTIFACT_WRITE_DESCRIPTION,
    inputSchema: artifactWriteInputSchema.extend({ entry_id: entryIdSchema }),
    outputSchema: artifactWriteOutputSchema,
    execute: async (input, ctx) => {
      const runCtx = readGraphRunContext(ctx.requestContext);
      const scope = await resolveGraphRunScope(runCtx);
      const { entry_id: entryId, ...write } = input;
      const output = await withGraphToolsAls(runCtx, scope, () =>
        ops.writeArtifact(write)
      );
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
