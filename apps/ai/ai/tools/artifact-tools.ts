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
import { isUnresolvedSpaceGate } from "./engenty-tools/lib/space-gate.js";

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
  const threadId =
    ctx.userFacingThreadId?.trim() || ctx.orchestratorThreadId?.trim();
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

type ArtifactScope = "agent" | "project" | "space" | "task" | "thread";

function resolvedSpaceId(): string | null {
  const space = getEngentyToolsRunContext().space;
  if (!space || isUnresolvedSpaceGate(space) || !space.spaceId) {
    return null;
  }
  return space.spaceId;
}

/**
 * Copilot drafts stay on the thread unless store_to is set. An Engenty in a
 * resolved Space writes onto the Space so the next run can find and update it
 * (markdown pages and other types share Artifacts).
 */
function resolveWriteScope(
  threadId: string,
  storeTo?: { scope_id: string; scope_type: Exclude<ArtifactScope, "thread"> }
): { scopeId: string; scopeType: ArtifactScope } {
  if (storeTo) {
    return { scopeId: storeTo.scope_id, scopeType: storeTo.scope_type };
  }
  const agentTypeKey = getEngentyToolsRunContext().agentTypeKey;
  const spaceId = resolvedSpaceId();
  if (agentTypeKey && agentTypeKey !== "engenty.copilot" && spaceId) {
    return { scopeId: spaceId, scopeType: "space" };
  }
  return { scopeId: threadId, scopeType: "thread" };
}

export const ARTIFACT_WRITE_DESCRIPTION =
  "Create or update an artifact the user can see, open and download — a real deliverable, not workspace scratch. Omit artifact_id to CREATE (needs title, plus type: 'markdown', 'html', 'table' for CSV, 'app' / 'file' / 'database' handles). Pass artifact_id + expected_version + summary to UPDATE the SAME item (on version_conflict, artifact_read and retry with current_version). An Engenty in a Space stores new artifacts on the Space by default so later runs can update them (markdown pages and other types share Artifacts); Copilot keeps them on this chat unless store_to is set. Add store_to to keep with a task, project, space, or Engenty (scope_type agent, scope_id = the agent id).";

export const artifactWriteInputSchema = z.object({
  artifact_id: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  expected_version: z.number().int().min(1).optional(),
  file: z
    .object({
      key: z
        .string()
        .min(1)
        .describe(
          "Tenant storage key of an existing file in durable Files/storage."
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
      scope_type: z.enum(["task", "project", "space", "agent"]),
    })
    .optional(),
  summary: z.string().max(2000).optional(),
  title: z.string().min(1).max(512).optional(),
  type: artifactTypeSchema.optional(),
});

export const artifactWriteOutputSchema = z.object({
  artifact_id: z.string().optional(),
  current_version: z.number().optional(),
  error: z.string().optional(),
  mirror_ref: z.string().optional(),
  mirrored: z.boolean().optional(),
  scope_id: z.string().optional(),
  scope_type: z.string().optional(),
  version: z.number().optional(),
});

export const ARTIFACT_READ_DESCRIPTION =
  "Read an artifact, or list artifacts this run can update. Pass artifact_id for its current content (or a specific version) — that version is what artifact_write needs as expected_version. Omit artifact_id to list this chat's artifacts and, in a Space, Space Artifacts including markdown pages (id, title, type, version).";

export const artifactReadInputSchema = z.object({
  artifact_id: z.string().min(1).optional(),
  version: z.number().int().min(1).optional(),
});

export const artifactReadOutputSchema = z.object({
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
});

export const SHOW_ARTIFACT_DESCRIPTION =
  "Re-open an artifact the user cannot currently see — one from earlier in the conversation, or one they closed. A newly written artifact already surfaces on its own, so do NOT call this straight after artifact_write. On surfaces without an artifact panel (background runs, messaging channels) it simply records the reference, so it is never required for your work to count as done.";

export const showArtifactInputSchema = z.object({
  artifact_id: z.string().min(1),
});

export const showArtifactOutputSchema = z.object({
  artifact_id: z.string().optional(),
  error: z.string().optional(),
  mime_type: z.string().optional(),
  title: z.string().optional(),
  type: z.string().optional(),
});

/**
 * Returns the artifact tools: ONE writer, ONE reader, ONE presenter.
 *
 * It was five (`artifact_create` / `_update` / `_get` / `_list` / `_store`).
 * Five schemas ride in every prompt on every model call, and four of the five
 * differed only in which two fields they carried — so the surface cost far more
 * than the distinction was worth. The verb is now implied by what the model
 * passes: an id means update, no id means create, a `store_to` means promote.
 *
 * Artifacts default to the current chat. An Engenty in a resolved Space
 * creates them on the Space (markdown pages mixed with other types under
 * Artifacts) so later runs can find and update them.
 * `store_to` still promotes (or creates) onto a task, project, space, or Engenty.
 */
export function createArtifactOperations(deps?: {
  store?: ArtifactStore | null;
}) {
  const store = () => resolveStore(deps?.store);

  async function promoteScope(input: {
    artifactId: string;
    scopeId: string;
    // `space` is promotable since PLAN-space-data.md D6 — a space is the widest
    // scope below the tenant, and its artifacts mirror the same way a
    // project's do.
    scopeType: "agent" | "project" | "space" | "task";
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

  const writeArtifact = async (
    input: z.infer<typeof artifactWriteInputSchema>
  ): Promise<z.infer<typeof artifactWriteOutputSchema>> => {
    const { tenantId, threadId, userId } = requireThreadScope();
    // `file` is the model-friendly face of the file handle: it names a stored
    // object and we build the handle, so nobody hand-writes JSON into a
    // string field and gets the shape subtly wrong.
    const fileHandle = input.file
      ? JSON.stringify({
          key: input.file.key,
          name:
            input.file.name?.trim() || fileNameFromStorageKey(input.file.key),
          ...(input.file.mime_type ? { mime_type: input.file.mime_type } : {}),
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
    const writeScope = resolveWriteScope(threadId, input.store_to);
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
        scopeType: writeScope.scopeType,
        scopeId: writeScope.scopeId,
        threadId,
        createdByKind: "agent",
        createdBy: userId,
        content,
      });
      artifactId = created.artifact.id;
      version = created.version.version;
    }
    // Which run last wrote it: a routine's report links the result from here
    // when the run's final answer does not name it.
    const writingRunId = getEngentyToolsRunContext().runId;
    if (writingRunId) {
      await store()
        .mergeMetadata({
          artifactId,
          patch: { last_run_id: writingRunId },
          tenantId,
        })
        .catch(() => undefined);
    }

    const promoted =
      writeScope.scopeType === "thread" ||
      !(input.store_to || !input.artifact_id)
        ? null
        : await promoteScope({
            artifactId,
            scopeId: writeScope.scopeId,
            scopeType: writeScope.scopeType,
            tenantId,
          });

    return { artifact_id: artifactId, version, ...(promoted ?? {}) };
  };

  const readArtifact = async (
    input: z.infer<typeof artifactReadInputSchema>
  ): Promise<z.infer<typeof artifactReadOutputSchema>> => {
    const { tenantId, threadId } = requireThreadScope();
    if (!input.artifact_id) {
      const threadRows = await store().listByScope({
        tenantId,
        scopeType: "thread",
        scopeId: threadId,
      });
      const spaceId = resolvedSpaceId();
      const spaceRows = spaceId
        ? await store().listByScope({
            tenantId,
            scopeType: "space",
            scopeId: spaceId,
          })
        : [];
      const seen = new Set<string>();
      const artifacts = [...spaceRows, ...threadRows]
        .filter((row) => {
          if (seen.has(row.id)) {
            return false;
          }
          seen.add(row.id);
          return true;
        })
        .map((row) => ({
          artifact_id: row.id,
          title: row.title,
          type: row.type,
          version: row.current_version,
        }));
      return { artifacts };
    }
    const result = await store().get({
      tenantId,
      artifactId: input.artifact_id,
      ...(input.version ? { version: input.version } : {}),
    });
    if (!result) {
      throw new Error(`artifact_read: artifact ${input.artifact_id} not found`);
    }
    return {
      artifact_id: result.artifact.id,
      content: result.version.content,
      title: result.artifact.title,
      type: result.artifact.type,
      version: result.version.version,
    };
  };

  // Presentation, NOT browser manipulation: this returns a handle and the
  // surface renders it from the tool RESULT (pane tab in the SPA, a link on a
  // messaging channel, nothing at all headless). It is deliberately not a
  // frontend tool — those suspend the run until a browser resumes them, which
  // parks forever on any surface that cannot resume (see remote-channels.ts).
  const showArtifact = async (
    input: z.infer<typeof showArtifactInputSchema>
  ): Promise<z.infer<typeof showArtifactOutputSchema>> => {
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
    // What the run presents is its result: a routine's report links this
    // one over anything else the run happened to write.
    const presentingRunId = getEngentyToolsRunContext().runId;
    if (presentingRunId) {
      await store()
        .mergeMetadata({
          artifactId: result.artifact.id,
          patch: { shown_run_id: presentingRunId },
          tenantId,
        })
        .catch(() => undefined);
    }
    return {
      artifact_id: result.artifact.id,
      title: result.artifact.title,
      type: result.artifact.type,
      ...(mimeType ? { mime_type: mimeType } : {}),
    };
  };

  return { readArtifact, showArtifact, writeArtifact };
}

/**
 * The same three operations as Mastra tools, for an agent's tool surface. A
 * graph node calls `createArtifactOperations()` directly instead — it has its
 * own schemas and its own card delivery, and going through a Tool object just
 * to reach `execute` loses the types.
 */
export function createArtifactTools(deps?: { store?: ArtifactStore | null }) {
  const ops = createArtifactOperations(deps);
  return {
    artifact_read: createTool({
      id: "artifact_read",
      description: ARTIFACT_READ_DESCRIPTION,
      inputSchema: artifactReadInputSchema,
      outputSchema: artifactReadOutputSchema,
      execute: async (input) => await ops.readArtifact(input),
    }),
    artifact_write: createTool({
      id: "artifact_write",
      description: ARTIFACT_WRITE_DESCRIPTION,
      inputSchema: artifactWriteInputSchema,
      outputSchema: artifactWriteOutputSchema,
      execute: async (input) => await ops.writeArtifact(input),
    }),
    show_artifact: createTool({
      id: "show_artifact",
      description: SHOW_ARTIFACT_DESCRIPTION,
      inputSchema: showArtifactInputSchema,
      outputSchema: showArtifactOutputSchema,
      execute: async (input) => await ops.showArtifact(input),
    }),
  };
}
