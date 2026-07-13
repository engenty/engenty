import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  type ArtifactStore,
  ArtifactVersionConflictError,
  createArtifactStore,
} from "../../src/dal/artifacts/index.js";
import { createAiDatabaseAdapter } from "../../src/infra/database.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";

const artifactTypeSchema = z.enum(["markdown", "html", "table"]);

// Build the store directly from the DB adapter (not the ai/index barrel) to
// avoid a circular import: the copilot agent imports this module, and the
// barrel imports the copilot agent.
function resolveStore(injected?: ArtifactStore | null): ArtifactStore {
  if (injected) {
    return injected;
  }
  const client = createAiDatabaseAdapter(
    process.env as unknown as Record<string, unknown>
  );
  if (!client) {
    throw new Error(
      "artifact tools: store unavailable — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return createArtifactStore(client);
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
 * Returns the four artifact tools. Artifacts are created thread-scoped (the
 * current chat); promotion to a task/project/goal happens via `artifact_store`
 * (Phase B). Wire into createEngentyCopilotAgentTools().
 */
export function createArtifactTools(deps?: { store?: ArtifactStore | null }) {
  const store = () => resolveStore(deps?.store);
  const artifactCreate = createTool({
    id: "artifact_create",
    description:
      "Create a document artifact the user can see and open in the artifact panel. Prefer this over pasting long documents into the chat. Use type 'markdown' for prose/notes, 'html' for rich formatted output, 'table' for CSV or a JSON array of rows.",
    inputSchema: z.object({
      type: artifactTypeSchema,
      title: z.string().min(1).max(512),
      content: z.string().min(1),
    }),
    outputSchema: z.object({
      artifact_id: z.string(),
      version: z.number(),
    }),
    execute: async (input) => {
      const { tenantId, threadId, userId } = requireThreadScope();
      const { artifact, version } = await store().create({
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
      return { artifact_id: artifact.id, version: version.version };
    },
  });

  const artifactUpdate = createTool({
    id: "artifact_update",
    description:
      "Replace an artifact's content with a new version. Pass expected_version (the version you last saw). If it returns error 'version_conflict', re-read with artifact_get and retry with the current_version it reports.",
    inputSchema: z.object({
      artifact_id: z.string().min(1),
      content: z.string().min(1),
      expected_version: z.number().int().min(1),
      summary: z.string().max(2000),
    }),
    outputSchema: z.object({
      artifact_id: z.string().optional(),
      version: z.number().optional(),
      error: z.string().optional(),
      current_version: z.number().optional(),
    }),
    execute: async (input) => {
      const { tenantId, userId } = requireThreadScope();
      try {
        const { artifact, version } = await store().addVersion({
          tenantId,
          artifactId: input.artifact_id,
          content: input.content,
          expectedVersion: input.expected_version,
          summary: input.summary,
          createdByKind: "agent",
          createdBy: userId,
        });
        return { artifact_id: artifact.id, version: version.version };
      } catch (err) {
        if (err instanceof ArtifactVersionConflictError) {
          return {
            error: "version_conflict",
            current_version: err.currentVersion,
          };
        }
        throw err;
      }
    },
  });

  const artifactGet = createTool({
    id: "artifact_get",
    description:
      "Read an artifact's current content (or a specific version). Returns the version number to pass to artifact_update.",
    inputSchema: z.object({
      artifact_id: z.string().min(1),
      version: z.number().int().min(1).optional(),
    }),
    outputSchema: z.object({
      artifact_id: z.string(),
      type: z.string(),
      title: z.string(),
      version: z.number(),
      content: z.string().nullable(),
    }),
    execute: async (input) => {
      const { tenantId } = requireThreadScope();
      const result = await store().get({
        tenantId,
        artifactId: input.artifact_id,
        ...(input.version ? { version: input.version } : {}),
      });
      if (!result) {
        throw new Error(
          `artifact_get: artifact ${input.artifact_id} not found`
        );
      }
      return {
        artifact_id: result.artifact.id,
        type: result.artifact.type,
        title: result.artifact.title,
        version: result.version.version,
        content: result.version.content,
      };
    },
  });

  const artifactList = createTool({
    id: "artifact_list",
    description:
      "List artifacts attached to the current chat (id, title, type, version).",
    inputSchema: z.object({}),
    outputSchema: z.object({
      artifacts: z.array(
        z.object({
          artifact_id: z.string(),
          title: z.string(),
          type: z.string(),
          version: z.number(),
        })
      ),
    }),
    execute: async () => {
      const { tenantId, threadId } = requireThreadScope();
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
    },
  });

  return {
    artifact_create: artifactCreate,
    artifact_update: artifactUpdate,
    artifact_get: artifactGet,
    artifact_list: artifactList,
  };
}
