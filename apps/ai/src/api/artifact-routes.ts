import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Context, Hono } from "hono";
import { z } from "zod";
import {
  ARTIFACT_TYPE_IDS,
  ArtifactInvalidContentError,
  ArtifactUnknownTypeError,
} from "../ai/artifacts/artifact-types.js";
import { createScopeModuleOperationInvoker } from "../ai/sessions/task-workspace-hook.js";
import { resolveTenantDefaultSpaceId } from "../ai/work-scope/resolve-space.js";
import {
  resolveWorkContainer,
  type WorkContainerRef,
} from "../ai/work-scope/resolve-work-container.js";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  ArtifactContentTooLargeError,
  ArtifactInvalidParentError,
  type ArtifactRow,
  type ArtifactStore,
  ArtifactVersionConflictError,
} from "../dal/artifacts/index.js";
import type { ArtifactScopeType } from "../dal/artifacts/types.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

const scopeTypeSchema = z.enum(["thread", "task", "project", "space", "agent"]);
/**
 * Scopes an artifact can be PROMOTED to — moved out of the chat's tab list and
 * kept permanently (PLAN-space-data.md D6).
 *
 * `space` joined task/project when the space Data tree gave artifacts a home.
 * `agent` is an Engenty: kept with that agent (desk), not dumped into Ablage.
 */
const promotableScopeSchema = z.enum(["task", "project", "space", "agent"]);
const containerTierSchema = z.enum([
  "thread",
  "task",
  "routine",
  "project",
  "space",
  "global",
]);

/** Parse a `<tier>:<id>` container query param. `global` ignores the id. */
function parseContainerParam(raw: string): WorkContainerRef | null {
  const idx = raw.indexOf(":");
  const tierRaw = idx === -1 ? raw : raw.slice(0, idx);
  const id = idx === -1 ? "" : raw.slice(idx + 1).trim();
  const tier = containerTierSchema.safeParse(tierRaw.trim());
  if (!tier.success) {
    return null;
  }
  if (tier.data === "global") {
    return { tier: "global", id: id || "global" };
  }
  if (!id) {
    return null;
  }
  return { tier: tier.data, id };
}

const createBodySchema = z.object({
  type: z.enum(ARTIFACT_TYPE_IDS),
  title: z.string().min(1).max(512),
  scope_id: z.string().min(1).max(256),
  scope_type: scopeTypeSchema.optional(),
  parent_id: z.string().uuid().nullable().optional(),
  content: z.string(),
});

const addVersionBodySchema = z.object({
  content: z.string(),
  expected_version: z.number().int().min(1),
  summary: z.string().max(2000).optional(),
  title: z.string().min(1).max(512).optional(),
});

const patchBodySchema = z.object({
  parent_id: z.string().uuid().nullable(),
});

/** Malformed JSON is a client error, not a 500 from Hono's default handler. */
async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

/** Content/type failures from the store are client errors — map them to 4xx. */
function clientErrorResponse(c: Context, err: unknown) {
  if (err instanceof ArtifactContentTooLargeError) {
    return c.json({ error: "artifacts.contentTooLarge" }, 413);
  }
  if (err instanceof ArtifactInvalidParentError) {
    return c.json({ error: "artifacts.invalidParent" }, 400);
  }
  if (
    err instanceof ArtifactInvalidContentError ||
    err instanceof ArtifactUnknownTypeError
  ) {
    return c.json({ error: "artifacts.invalidContent" }, 400);
  }
  return null;
}

const storeBodySchema = z.object({
  scope_type: promotableScopeSchema,
  scope_id: z.string().min(1).max(256),
});

const storageBindingBodySchema = z.object({
  scope_type: promotableScopeSchema,
  scope_id: z.string().min(1).max(256),
  /** null clears the binding (back to platform storage only). */
  connection_id: z.string().uuid().nullable(),
  folder_ref: z.string().max(1024).nullish(),
});

export function registerArtifactRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    artifactStore: ArtifactStore;
    /**
     * Best-effort mirror of a just-promoted artifact to its scope's bound
     * storage connection (never throws). Absent in tests / unconfigured envs.
     */
    mirrorArtifact?: (params: {
      artifact: ArtifactRow;
      authorization: string | null;
      tenantId: string;
    }) => Promise<void>;
    /**
     * Agent ids mounted on a space, so a space container listing also returns
     * artifacts kept with those Engenties. Absent in tests / unconfigured envs.
     */
    listSpaceAgentIds?: (params: {
      authorization: string | null;
      spaceId: string;
    }) => Promise<string[]>;
    scopeResolver: AiScopeResolver;
  }
): void {
  const base = `${AI_BASE_PATH}/artifacts`;

  app.get(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    // Container wins if present: resolve its contents and IN-query over the
    // resolved artifact scopes (global → the whole tenant catalog).
    const containerRaw = c.req.query("container");
    if (containerRaw) {
      const ref = parseContainerParam(containerRaw);
      if (!ref) {
        return c.json({ error: "artifacts.invalidContainer" }, 400);
      }
      try {
        if (ref.tier === "global") {
          const artifacts = await opts.artifactStore.listAllByTenant({
            tenantId: scope.scope.tenantId,
          });
          return c.json({ artifacts });
        }
        const invoke = createScopeModuleOperationInvoker(scope.scope);
        const authorization = c.req.header("authorization") ?? null;
        const listSpaceAgentIds = opts.listSpaceAgentIds;
        const resolved = await resolveWorkContainer(
          {
            invoke,
            spaceId: await resolveTenantDefaultSpaceId(scope.scope.tenantId),
            tenantId: scope.scope.tenantId,
            ...(listSpaceAgentIds
              ? {
                  listSpaceAgentIds: (spaceId: string) =>
                    listSpaceAgentIds({ authorization, spaceId }),
                }
              : {}),
          },
          ref
        );
        const artifacts = await opts.artifactStore.listByScopes({
          tenantId: scope.scope.tenantId,
          scopes: resolved.artifactScopes.map((s) => ({
            scopeType: s.scope_type as ArtifactScopeType,
            scopeId: s.scope_id,
          })),
        });
        return c.json({ artifacts });
      } catch (err) {
        return handleRouteError(
          c,
          "listArtifacts (container) failed",
          "artifacts.listFailed",
          err
        );
      }
    }
    const scopeType = scopeTypeSchema.safeParse(c.req.query("scope_type"));
    const scopeId = z
      .string()
      .min(1)
      .max(256)
      .safeParse(c.req.query("scope_id"));
    if (!(scopeType.success && scopeId.success)) {
      return c.json({ error: "artifacts.invalidScope" }, 400);
    }
    try {
      const artifacts = await opts.artifactStore.listByScope({
        tenantId: scope.scope.tenantId,
        scopeType: scopeType.data,
        scopeId: scopeId.data,
      });
      return c.json({ artifacts });
    } catch (err) {
      return handleRouteError(
        c,
        "listArtifacts failed",
        "artifacts.listFailed",
        err
      );
    }
  });

  app.post(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = createBodySchema.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json({ error: "artifacts.invalidBody" }, 400);
    }
    try {
      const scopeType = body.data.scope_type ?? "thread";
      const result = await opts.artifactStore.create({
        tenantId: scope.scope.tenantId,
        type: body.data.type,
        title: body.data.title,
        scopeType,
        scopeId: body.data.scope_id,
        threadId: scopeType === "thread" ? body.data.scope_id : null,
        createdByKind: "user",
        createdBy: scope.scope.userId,
        content: body.data.content,
        parentId: body.data.parent_id ?? null,
      });
      return c.json(result, 201);
    } catch (err) {
      const clientError = clientErrorResponse(c, err);
      if (clientError) {
        return clientError;
      }
      return handleRouteError(
        c,
        "createArtifact failed",
        "artifacts.createFailed",
        err
      );
    }
  });

  // Registered before the `/:artifactId` param routes so "storage-binding"
  // never resolves as an artifact id.
  app.get(`${base}/storage-binding`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const scopeType = promotableScopeSchema.safeParse(
      c.req.query("scope_type")
    );
    const scopeId = z
      .string()
      .min(1)
      .max(256)
      .safeParse(c.req.query("scope_id"));
    if (!(scopeType.success && scopeId.success)) {
      return c.json({ error: "artifacts.invalidScope" }, 400);
    }
    try {
      const binding = await opts.artifactStore.getStorageBinding({
        tenantId: scope.scope.tenantId,
        scopeType: scopeType.data,
        scopeId: scopeId.data,
      });
      return c.json({ binding });
    } catch (err) {
      return handleRouteError(
        c,
        "getArtifactStorageBinding failed",
        "artifacts.storageBindingFailed",
        err
      );
    }
  });

  app.put(`${base}/storage-binding`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = storageBindingBodySchema.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json({ error: "artifacts.invalidBody" }, 400);
    }
    try {
      const binding = await opts.artifactStore.setStorageBinding({
        tenantId: scope.scope.tenantId,
        scopeType: body.data.scope_type,
        scopeId: body.data.scope_id,
        connectionId: body.data.connection_id,
        folderRef: body.data.folder_ref ?? null,
        createdBy: scope.scope.userId,
      });
      return c.json({ binding });
    } catch (err) {
      return handleRouteError(
        c,
        "setArtifactStorageBinding failed",
        "artifacts.storageBindingFailed",
        err
      );
    }
  });

  // Tenant-wide listing for the admin console. Registered before the
  // `/:artifactId` param route so "all" never resolves as an artifact id.
  app.get(`${base}/all`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const includeArchived = c.req.query("include_archived") === "true";
    try {
      const artifacts = await opts.artifactStore.listAllByTenant({
        tenantId: scope.scope.tenantId,
        includeArchived,
      });
      return c.json({ artifacts });
    } catch (err) {
      return handleRouteError(
        c,
        "listAllArtifacts failed",
        "artifacts.listFailed",
        err
      );
    }
  });

  app.get(`${base}/:artifactId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const version = z.coerce
      .number()
      .int()
      .min(1)
      .safeParse(c.req.query("version"));
    try {
      const result = await opts.artifactStore.get({
        tenantId: scope.scope.tenantId,
        artifactId: c.req.param("artifactId"),
        ...(version.success ? { version: version.data } : {}),
      });
      if (!result) {
        return c.json({ error: "artifacts.notFound" }, 404);
      }
      return c.json(result);
    } catch (err) {
      return handleRouteError(
        c,
        "getArtifact failed",
        "artifacts.getFailed",
        err
      );
    }
  });

  app.patch(`${base}/:artifactId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = patchBodySchema.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json({ error: "artifacts.invalidBody" }, 400);
    }
    try {
      const artifact = await opts.artifactStore.updateParent({
        tenantId: scope.scope.tenantId,
        artifactId: c.req.param("artifactId"),
        parentId: body.data.parent_id,
      });
      if (!artifact) {
        return c.json({ error: "artifacts.notFound" }, 404);
      }
      return c.json({ artifact });
    } catch (err) {
      const clientError = clientErrorResponse(c, err);
      if (clientError) {
        return clientError;
      }
      return handleRouteError(
        c,
        "updateArtifact failed",
        "artifacts.updateFailed",
        err
      );
    }
  });

  app.get(`${base}/:artifactId/versions`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    try {
      const versions = await opts.artifactStore.listVersions({
        tenantId: scope.scope.tenantId,
        artifactId: c.req.param("artifactId"),
      });
      if (!versions) {
        return c.json({ error: "artifacts.notFound" }, 404);
      }
      return c.json({ versions });
    } catch (err) {
      return handleRouteError(
        c,
        "listArtifactVersions failed",
        "artifacts.listFailed",
        err
      );
    }
  });

  app.post(`${base}/:artifactId/versions`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = addVersionBodySchema.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json({ error: "artifacts.invalidBody" }, 400);
    }
    try {
      const result = await opts.artifactStore.addVersion({
        tenantId: scope.scope.tenantId,
        artifactId: c.req.param("artifactId"),
        content: body.data.content,
        expectedVersion: body.data.expected_version,
        summary: body.data.summary ?? null,
        createdByKind: "user",
        createdBy: scope.scope.userId,
        ...(body.data.title ? { title: body.data.title } : {}),
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof ArtifactVersionConflictError) {
        return c.json(
          {
            error: "artifacts.versionConflict",
            current_version: err.currentVersion,
          },
          409
        );
      }
      const clientError = clientErrorResponse(c, err);
      if (clientError) {
        return clientError;
      }
      return handleRouteError(
        c,
        "addArtifactVersion failed",
        "artifacts.updateFailed",
        err
      );
    }
  });

  app.post(`${base}/:artifactId/store`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = storeBodySchema.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json({ error: "artifacts.invalidBody" }, 400);
    }
    try {
      const artifact = await opts.artifactStore.updateScope({
        tenantId: scope.scope.tenantId,
        artifactId: c.req.param("artifactId"),
        scopeType: body.data.scope_type,
        scopeId: body.data.scope_id,
      });
      if (!artifact) {
        return c.json({ error: "artifacts.notFound" }, 404);
      }
      await opts.mirrorArtifact?.({
        artifact,
        authorization: c.req.header("authorization") ?? null,
        tenantId: scope.scope.tenantId,
      });
      return c.json({ artifact });
    } catch (err) {
      return handleRouteError(
        c,
        "storeArtifact failed",
        "artifacts.storeFailed",
        err
      );
    }
  });

  app.post(`${base}/:artifactId/archive`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    try {
      const artifact = await opts.artifactStore.setStatus({
        tenantId: scope.scope.tenantId,
        artifactId: c.req.param("artifactId"),
        status: "archived",
      });
      if (!artifact) {
        return c.json({ error: "artifacts.notFound" }, 404);
      }
      return c.json({ artifact });
    } catch (err) {
      return handleRouteError(
        c,
        "archiveArtifact failed",
        "artifacts.archiveFailed",
        err
      );
    }
  });
}
