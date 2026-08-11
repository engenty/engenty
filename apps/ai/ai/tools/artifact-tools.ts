import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { mirrorArtifactToBoundStorage } from "../../src/ai/artifacts/artifact-mirror.js";
import { ARTIFACT_TYPE_IDS } from "../../src/ai/artifacts/artifact-types.js";
import {
  type ArtifactStore,
  ArtifactVersionConflictError,
  createArtifactStoreFromEnv,
} from "../../src/dal/artifacts/index.js";
import { getCurrentEngentyToolsClient } from "./engenty-tools/lib/client.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";

const artifactTypeSchema = z.enum(ARTIFACT_TYPE_IDS);

// The DAL factory (not the ai/index barrel — that would be a circular import:
// the copilot agent imports this module, and the barrel imports the copilot
// agent) memoizes one service-role store per process.
function resolveStore(injected?: ArtifactStore | null): ArtifactStore {
  if (injected) {
    return injected;
  }
  const store = createArtifactStoreFromEnv();
  if (!store) {
    throw new Error(
      "artifact tools: store unavailable — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return store;
}

function requireThreadScope() {
  const ctx = getEngentyToolsRunContext();
  const tenantId = ctx.tenantId;
  const threadId = ctx.orchestratorThreadId;
  if (!tenantId) {
    throw new Error("artifact tools: tenant is not set in run context.");
  }
  if (!threadId) {
    throw new Error(
      "artifact tools: no active thread in run context; artifacts must be created inside a chat."
    );
  }
  return { tenantId, threadId, userId: ctx.userId ?? null };
}

/**
 * Returns the artifact tools: ONE writer and ONE reader.
 *
 * It was five (`artifact_create` / `_update` / `_get` / `_list` / `_store`).
 * Five schemas ride in every prompt on every model call, and four of the five
 * differed only in which two fields they carried — so the surface cost far more
 * than the distinction was worth. The verb is now implied by what the model
 * passes: an id means update, no id means create, a `store_to` means promote.
 *
 * Artifacts are still created thread-scoped (the current chat); `store_to`
 * promotes one to a task/project/goal, which moves it out of the chat's tab
 * list. Wire into createEngentyCopilotAgentTools().
 */
export function createArtifactTools(deps?: { store?: ArtifactStore | null }) {
  const store = () => resolveStore(deps?.store);

  async function promoteScope(input: {
    artifactId: string;
    scopeId: string;
    scopeType: "task" | "project" | "goal";
    tenantId: string;
  }) {
    const artifact = await store().updateScope({
      tenantId: input.tenantId,
      artifactId: input.artifactId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    });
    if (!artifact) {
      throw new Error(`artifact_write: artifact ${input.artifactId} not found`);
    }
    // Best-effort mirror to the scope's bound storage connection (Phase C);
    // platform storage stays the render source, so failures don't fail the
    // store.
    const client = getCurrentEngentyToolsClient();
    const mirror = client.ok
      ? await mirrorArtifactToBoundStorage({
          artifact,
          invokeTool: (toolId, mirrorInput) =>
            client.client.invokeTool(toolId, mirrorInput),
          store: store(),
          tenantId: input.tenantId,
        })
      : null;
    return {
      scope_id: artifact.scope_id,
      scope_type: artifact.scope_type,
      ...(mirror?.mirrored ? { mirrored: true, mirror_ref: mirror.ref } : {}),
    };
  }

  const artifactWrite = createTool({
    id: "artifact_write",
    description:
      "Create or update a document artifact the user can see and open in the artifact panel — prefer this over pasting long documents into the chat. Omit artifact_id to CREATE (needs type + title; 'markdown' for prose, 'html' for rich output, 'table' for CSV or a JSON array of rows). Pass artifact_id + expected_version + summary to UPDATE (on error 'version_conflict', re-read with artifact_read and retry with the current_version it reports). Add store_to to keep it on a task, project or goal permanently — that moves it out of the chat's tab list, so ask the user first when the target is unclear.",
    inputSchema: z.object({
      artifact_id: z.string().min(1).optional(),
      content: z.string().min(1).optional(),
      expected_version: z.number().int().min(1).optional(),
      store_to: z
        .object({
          scope_id: z.string().min(1),
          scope_type: z.enum(["task", "project", "goal"]),
        })
        .optional(),
      summary: z.string().max(2000).optional(),
      title: z.string().min(1).max(512).optional(),
      type: artifactTypeSchema.optional(),
    }),
    outputSchema: z.object({
      artifact_id: z.string().optional(),
      current_version: z.number().optional(),
      error: z.string().optional(),
      mirror_ref: z.string().optional(),
      mirrored: z.boolean().optional(),
      scope_id: z.string().optional(),
      scope_type: z.string().optional(),
      version: z.number().optional(),
    }),
    execute: async (input) => {
      const { tenantId, threadId, userId } = requireThreadScope();

      // Scope-only promotion: an id and a target, nothing to write.
      if (input.artifact_id && input.store_to && !input.content) {
        const promoted = await promoteScope({
          artifactId: input.artifact_id,
          scopeId: input.store_to.scope_id,
          scopeType: input.store_to.scope_type,
          tenantId,
        });
        return { artifact_id: input.artifact_id, ...promoted };
      }

      if (!input.content) {
        return { error: "content_required" };
      }

      let artifactId = input.artifact_id ?? null;
      let version: number;
      if (artifactId) {
        if (!input.expected_version) {
          return { error: "expected_version_required" };
        }
        try {
          const updated = await store().addVersion({
            tenantId,
            artifactId,
            content: input.content,
            expectedVersion: input.expected_version,
            summary: input.summary ?? "",
            createdByKind: "agent",
            createdBy: userId,
          });
          version = updated.version.version;
        } catch (err) {
          if (err instanceof ArtifactVersionConflictError) {
            return {
              current_version: err.currentVersion,
              error: "version_conflict",
            };
          }
          throw err;
        }
      } else {
        if (!(input.title && input.type)) {
          return { error: "title_and_type_required" };
        }
        const created = await store().create({
          tenantId,
          type: input.type,
          title: input.title,
          scopeType: "thread",
          scopeId: threadId,
          threadId,
          createdByKind: "agent",
          createdBy: userId,
          content: input.content,
        });
        artifactId = created.artifact.id;
        version = created.version.version;
      }

      // Write-then-promote in one call: the model asked for both, and a second
      // round trip only to move the scope is pure latency.
      const promoted = input.store_to
        ? await promoteScope({
            artifactId,
            scopeId: input.store_to.scope_id,
            scopeType: input.store_to.scope_type,
            tenantId,
          })
        : null;

      return { artifact_id: artifactId, version, ...(promoted ?? {}) };
    },
  });

  const artifactRead = createTool({
    id: "artifact_read",
    description:
      "Read an artifact, or list this chat's artifacts. Pass artifact_id for its current content (or a specific version) — the returned version is what artifact_write needs as expected_version. Omit artifact_id to list the artifacts attached to this chat (id, title, type, version).",
    inputSchema: z.object({
      artifact_id: z.string().min(1).optional(),
      version: z.number().int().min(1).optional(),
    }),
    outputSchema: z.object({
      artifact_id: z.string().optional(),
      artifacts: z
        .array(
          z.object({
            artifact_id: z.string(),
            title: z.string(),
            type: z.string(),
            version: z.number(),
          })
        )
        .optional(),
      content: z.string().nullable().optional(),
      title: z.string().optional(),
      type: z.string().optional(),
      version: z.number().optional(),
    }),
    execute: async (input) => {
      const { tenantId, threadId } = requireThreadScope();
      if (!input.artifact_id) {
        const rows = await store().listByScope({
          tenantId,
          scopeType: "thread",
          scopeId: threadId,
        });
        return {
          artifacts: rows.map((row) => ({
            artifact_id: row.id,
            title: row.title,
            type: row.type,
            version: row.current_version,
          })),
        };
      }
      const result = await store().get({
        tenantId,
        artifactId: input.artifact_id,
        ...(input.version ? { version: input.version } : {}),
      });
      if (!result) {
        throw new Error(
          `artifact_read: artifact ${input.artifact_id} not found`
        );
      }
      return {
        artifact_id: result.artifact.id,
        content: result.version.content,
        title: result.artifact.title,
        type: result.artifact.type,
        version: result.version.version,
      };
    },
  });

  return {
    artifact_read: artifactRead,
    artifact_write: artifactWrite,
  };
}
