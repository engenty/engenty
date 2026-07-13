import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Context, Hono } from "hono";
import { z } from "zod";
import {
  ARTIFACT_TYPE_IDS,
  ArtifactInvalidContentError,
  ArtifactUnknownTypeError,
} from "../ai/artifacts/artifact-types.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { ArtifactStore } from "../dal/artifacts/index.js";
import {
  ArtifactContentTooLargeError,
  ArtifactVersionConflictError,
} from "../dal/artifacts/index.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

const scopeTypeSchema = z.enum(["thread", "task", "project", "goal"]);
const promotableScopeSchema = z.enum(["task", "project", "goal"]);

const createBodySchema = z.object({
  type: z.enum(ARTIFACT_TYPE_IDS),
  title: z.string().min(1).max(512),
  scope_id: z.string().min(1).max(256),
  content: z.string().min(1),
});

const addVersionBodySchema = z.object({
  content: z.string().min(1),
  expected_version: z.number().int().min(1),
  summary: z.string().max(2000).optional(),
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

export function registerArtifactRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    artifactStore: ArtifactStore;
    scopeResolver: AiScopeResolver;
  }
): void {
  const base = `${AI_BASE_PATH}/artifacts`;

  app.get(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
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
      const result = await opts.artifactStore.create({
        tenantId: scope.scope.tenantId,
        type: body.data.type,
        title: body.data.title,
        // User-created artifacts from the UI are thread-scoped like the agent's.
        scopeType: "thread",
        scopeId: body.data.scope_id,
        threadId: body.data.scope_id,
        createdByKind: "user",
        createdBy: scope.scope.userId,
        content: body.data.content,
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
