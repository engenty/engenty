import { ACTIVE_ARTIFACT_METADATA_KEY } from "@engenty/ag-ui-bridge";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { mirrorArtifactToBoundStorage } from "../../src/ai/artifacts/artifact-mirror.js";
import {
  ARTIFACT_TYPE_IDS,
  getArtifactType,
} from "../../src/ai/artifacts/artifact-types.js";
import {
  type ArtifactStore,
  ArtifactVersionConflictError,
  createArtifactStoreFromEnv,
} from "../../src/dal/artifacts/index.js";
import { createThreadStore } from "../../src/dal/threads/index.js";
import { createDbSourceFromEnv } from "../../src/infra/tenant-db.js";
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

/**
 * Record which artifact the agent is presenting on the thread, so every window
 * attached to it follows (the pane subscribes to this metadata key). Anonymous
 * / headless runs have no owning user row to merge against — there is also no
 * window to sync, so it is a no-op there. Best-effort throughout: failing to
 * sync a second window must never fail the presentation.
 */
async function persistActiveArtifact(input: {
  artifactId: string;
  tenantId: string;
  threadId: string;
  userId: string | null;
}): Promise<void> {
  if (!input.userId) {
    return;
  }
  const source = createDbSourceFromEnv();
  if (!source) {
    return;
  }
  try {
    await createThreadStore(source).mergeThreadMetadataForUser({
      patch: {
        [ACTIVE_ARTIFACT_METADATA_KEY]: {
          artifact_id: input.artifactId,
          shown_at: new Date().toISOString(),
        },
      },
      tenantId: input.tenantId,
      threadId: input.threadId,
      userId: input.userId,
    });
  } catch {
    // Best-effort — see doc comment.
  }
}

function fileNameFromStorageKey(key: string): string {
  const segments = key.split("/").filter(Boolean);
  return segments.at(-1) ?? key;
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
 * Returns the artifact tools: ONE writer, ONE reader, ONE presenter.
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
      "Create or update an artifact the user can see, open and download in the artifact panel — prefer this over pasting long documents into the chat, and over handing out storage keys or links. Omit artifact_id to CREATE (needs title, plus type for written content: 'markdown' for prose, 'html' for rich output, 'table' for CSV or a JSON array of rows). For a file you already wrote to storage (spreadsheet, PDF, image, archive), pass `file` with its tenant storage key instead of content — that registers it as a 'file' artifact which the panel previews and offers for download. Pass artifact_id + expected_version + summary to UPDATE (on error 'version_conflict', re-read with artifact_read and retry with the current_version it reports). Add store_to to keep it on a task, project or goal permanently — that moves it out of the chat's tab list, so ask the user first when the target is unclear.",
    inputSchema: z.object({
      artifact_id: z.string().min(1).optional(),
      content: z.string().min(1).optional(),
      expected_version: z.number().int().min(1).optional(),
      file: z
        .object({
          key: z
            .string()
            .min(1)
            .describe(
              "Tenant storage key of an existing file, e.g. tenants/<tenant-id>/ai/workspace/report.xlsx."
            ),
          mime_type: z.string().min(1).optional(),
          name: z
            .string()
            .min(1)
            .optional()
            .describe("Display filename; defaults to the key's last segment."),
        })
        .optional()
        .describe(
          "Register an existing stored file as this artifact (type 'file'). Use instead of content."
        ),
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
      // `file` is the model-friendly face of the file handle: it names a stored
      // object and we build the handle, so nobody hand-writes JSON into a
      // string field and gets the shape subtly wrong.
      const fileHandle = input.file
        ? JSON.stringify({
            key: input.file.key,
            name:
              input.file.name?.trim() || fileNameFromStorageKey(input.file.key),
            ...(input.file.mime_type
              ? { mime_type: input.file.mime_type }
              : {}),
          })
        : null;
      const content = fileHandle ?? input.content ?? null;

      // Scope-only promotion: an id and a target, nothing to write.
      if (input.artifact_id && input.store_to && !content) {
        const promoted = await promoteScope({
          artifactId: input.artifact_id,
          scopeId: input.store_to.scope_id,
          scopeType: input.store_to.scope_type,
          tenantId,
        });
        return { artifact_id: input.artifact_id, ...promoted };
      }

      if (!content) {
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
            content,
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
        const type = input.type ?? (fileHandle ? "file" : undefined);
        if (!(input.title && type)) {
          return { error: "title_and_type_required" };
        }
        const created = await store().create({
          tenantId,
          type,
          title: input.title,
          scopeType: "thread",
          scopeId: threadId,
          threadId,
          createdByKind: "agent",
          createdBy: userId,
          content,
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

  // Presentation, NOT browser manipulation: this returns a handle and the
  // surface renders it from the tool RESULT (pane tab in the SPA, a link on a
  // messaging channel, nothing at all headless). It is deliberately not a
  // frontend tool — those suspend the run until a browser resumes them, which
  // parks forever on any surface that cannot resume (see remote-channels.ts).
  const artifactShow = createTool({
    id: "show_artifact",
    description:
      "Re-open an artifact the user cannot currently see — one from earlier in the conversation, or one they closed. A newly written artifact already surfaces on its own, so do NOT call this straight after artifact_write. On surfaces without an artifact panel (background runs, messaging channels) it simply records the reference, so it is never required for your work to count as done.",
    inputSchema: z.object({
      artifact_id: z.string().min(1),
    }),
    outputSchema: z.object({
      artifact_id: z.string().optional(),
      error: z.string().optional(),
      mime_type: z.string().optional(),
      title: z.string().optional(),
      type: z.string().optional(),
    }),
    execute: async (input) => {
      const { tenantId, threadId, userId } = requireThreadScope();
      const result = await store().get({
        tenantId,
        artifactId: input.artifact_id,
      });
      if (!result) {
        return { error: "not_found" };
      }
      let mimeType: string | undefined;
      try {
        mimeType = getArtifactType(result.artifact.type).mimeType;
      } catch {
        // Unknown type: the handle is still useful without a MIME hint.
      }
      // Multi-window sync (ACTIVE_ARTIFACT_METADATA_KEY): every window on this
      // thread follows the artifact the agent presented. The browser handler
      // used to POST this back; writing it here makes the server the single
      // writer, so it also holds for a run no window is watching.
      await persistActiveArtifact({
        artifactId: result.artifact.id,
        tenantId,
        threadId,
        userId,
      });
      return {
        artifact_id: result.artifact.id,
        title: result.artifact.title,
        type: result.artifact.type,
        ...(mimeType ? { mime_type: mimeType } : {}),
      };
    },
  });

  return {
    artifact_read: artifactRead,
    artifact_write: artifactWrite,
    show_artifact: artifactShow,
  };
}
