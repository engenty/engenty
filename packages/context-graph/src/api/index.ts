// HTTP routes for `/api/context-graph/*`.
// Every handler filters on `ctx.auth.tenantId`; DAL's explicit tenant
// predicate is the second line of defense.

import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import {
  createEdgeBodySchema,
  createEntityBodySchema,
  edgeRowSchema,
  edgesListQuerySchema,
  edgesListResponseSchema,
  entitiesListQuerySchema,
  entitiesListResponseSchema,
  entityDetailResponseSchema,
  entityRowSchema,
  ontologyResponseSchema,
  updateEntityBodySchema,
} from "../schema/zod.js";
import type { ContextGraphServerApi } from "../server-api.js";
import type { ContextGraphSourceRegistry } from "../source-registry.js";
import { askResponseSchema, runNlQuery } from "./nl-query.js";

type Server = Pick<PluginServerApi, "registerHttpRoute">;
interface Auth {
  tenantId?: string | null;
}

function tenantOr401(auth?: Auth): string | Response {
  const t = auth?.tenantId;
  if (!t) {
    return new Response(JSON.stringify({ error: "missing tenant context" }), {
      headers: { "content-type": "application/json" },
      status: 401,
    });
  }
  return t;
}

const lowReadOp = { idempotent: true, riskLevel: "low" } as const;

export function registerContextGraphApi(input: {
  api: ContextGraphServerApi;
  server: Server;
  sourceRegistry?: ContextGraphSourceRegistry;
}): void {
  const { api, server, sourceRegistry } = input;

  server.registerHttpRoute({
    method: "get",
    path: "/api/context-graph/ontology",
    operation: lowReadOp,
    summary: "List registered entity and edge types",
    tags: ["context-graph"],
    responses: {
      200: { description: "Ontology snapshot", schema: ontologyResponseSchema },
    },
    handler: async () => {
      const snap = api.getOntology();
      return Response.json({
        entityTypes: Object.values(snap.entityTypes),
        edgeTypes: Object.values(snap.edgeTypes),
      });
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/context-graph/entities",
    operation: lowReadOp,
    summary: "List entities by type and/or external ref components",
    tags: ["context-graph"],
    request: { query: entitiesListQuerySchema },
    responses: {
      200: { description: "Entity list", schema: entitiesListResponseSchema },
    },
    handler: async (ctx) => {
      const t = tenantOr401(ctx.auth as Auth);
      if (typeof t !== "string") {
        return t;
      }
      const q = (ctx.query ?? {}) as z.infer<typeof entitiesListQuerySchema>;
      const items = await api.listEntities({
        tenantId: t,
        type: q.type,
        module: q.module,
        entity: q.entity,
        externalId: q.id,
      });
      return Response.json({ items });
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/context-graph/entities/:id",
    operation: lowReadOp,
    summary: "Get an entity plus its outgoing and incoming edges",
    tags: ["context-graph"],
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      200: { description: "Entity detail", schema: entityDetailResponseSchema },
    },
    handler: async (ctx) => {
      const t = tenantOr401(ctx.auth as Auth);
      if (typeof t !== "string") {
        return t;
      }
      const { id } = ctx.params as { id: string };
      const entity = await api.getEntity({ tenantId: t, id });
      if (!entity) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          headers: { "content-type": "application/json" },
          status: 404,
        });
      }
      const [outgoing, incoming] = await Promise.all([
        api.listEdges({ tenantId: t, fromEntityId: id }),
        api.listEdges({ tenantId: t, toEntityId: id }),
      ]);
      // Resolve the display name of every entity on the other end of an edge
      // so the UI can render connections by name rather than by id.
      const connectedIds = new Set<string>();
      for (const e of outgoing) {
        connectedIds.add(e.object_id);
      }
      for (const e of incoming) {
        connectedIds.add(e.subject_id);
      }
      connectedIds.delete(id);
      const connectedNames: Record<string, string | null> = {};
      await Promise.all(
        [...connectedIds].map(async (cid) => {
          const other = await api.getEntity({ tenantId: t, id: cid });
          connectedNames[cid] = other?.name ?? null;
        })
      );
      return Response.json({ entity, outgoing, incoming, connectedNames });
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/context-graph/ask",
    operation: { idempotent: true, riskLevel: "low" },
    summary: "Answer a natural-language question by traversing the graph",
    tags: ["context-graph"],
    request: { body: z.object({ question: z.string().min(1).max(500) }) },
    responses: {
      200: {
        description: "Answer with highlighted nodes/edges",
        schema: askResponseSchema,
      },
    },
    handler: async (ctx) => {
      const t = tenantOr401(ctx.auth as Auth);
      if (typeof t !== "string") {
        return t;
      }
      if (!process.env.AI_GATEWAY_API_KEY) {
        return new Response(
          JSON.stringify({ error: "AI_GATEWAY_API_KEY not configured" }),
          { headers: { "content-type": "application/json" }, status: 503 }
        );
      }
      const { question } = (ctx.body ?? {}) as { question?: string };
      if (!question?.trim()) {
        return new Response(JSON.stringify({ error: "question required" }), {
          headers: { "content-type": "application/json" },
          status: 400,
        });
      }
      try {
        const result = await runNlQuery({ api, question, tenantId: t });
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "query failed";
        return new Response(JSON.stringify({ error: message }), {
          headers: { "content-type": "application/json" },
          status: 500,
        });
      }
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/context-graph/edges",
    operation: lowReadOp,
    summary: "List edges by filters",
    tags: ["context-graph"],
    request: { query: edgesListQuerySchema },
    responses: {
      200: { description: "Edge list", schema: edgesListResponseSchema },
    },
    handler: async (ctx) => {
      const t = tenantOr401(ctx.auth as Auth);
      if (typeof t !== "string") {
        return t;
      }
      const q = (ctx.query ?? {}) as z.infer<typeof edgesListQuerySchema>;
      const items = await api.listEdges({
        tenantId: t,
        type: q.type,
        fromEntityId: q.subject_id,
        toEntityId: q.object_id,
      });
      return Response.json({ items });
    },
  });

  const writeMedium = { riskLevel: "medium" } as const;
  const writeHigh = { riskLevel: "high" } as const;

  server.registerHttpRoute({
    method: "post",
    path: "/api/context-graph/entities",
    operation: writeMedium,
    summary: "Create entity",
    tags: ["context-graph"],
    request: { body: createEntityBodySchema },
    responses: {
      200: { description: "Created entity", schema: entityRowSchema },
    },
    handler: async (ctx) => {
      const t = tenantOr401(ctx.auth as Auth);
      if (typeof t !== "string") {
        return t;
      }
      const body = ctx.body as z.infer<typeof createEntityBodySchema>;
      const entity = await api.upsertEntity({ tenantId: t, ...body });
      return Response.json(entity);
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/context-graph/entities/:id",
    operation: writeMedium,
    summary: "Update entity name / attributes",
    tags: ["context-graph"],
    request: {
      params: z.object({ id: z.string().min(1) }),
      body: updateEntityBodySchema,
    },
    responses: {
      200: { description: "Updated entity", schema: entityRowSchema },
    },
    handler: async (ctx) => {
      const t = tenantOr401(ctx.auth as Auth);
      if (typeof t !== "string") {
        return t;
      }
      const { id } = ctx.params as { id: string };
      const body = ctx.body as z.infer<typeof updateEntityBodySchema>;
      const entity = await api.updateEntity({ tenantId: t, id, ...body });
      return Response.json(entity);
    },
  });

  server.registerHttpRoute({
    method: "delete",
    path: "/api/context-graph/entities/:id",
    operation: writeHigh,
    summary: "Delete entity and cascade its edges",
    tags: ["context-graph"],
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: { 200: { description: "Deleted" } },
    handler: async (ctx) => {
      const t = tenantOr401(ctx.auth as Auth);
      if (typeof t !== "string") {
        return t;
      }
      const { id } = ctx.params as { id: string };
      await api.deleteEntity({ tenantId: t, id });
      return Response.json({ ok: true });
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/context-graph/edges",
    operation: writeMedium,
    summary: "Create edge between two entities",
    tags: ["context-graph"],
    request: { body: createEdgeBodySchema },
    responses: { 200: { description: "Created edge", schema: edgeRowSchema } },
    handler: async (ctx) => {
      const t = tenantOr401(ctx.auth as Auth);
      if (typeof t !== "string") {
        return t;
      }
      const body = ctx.body as z.infer<typeof createEdgeBodySchema>;
      const edge = await api.upsertEdge({ tenantId: t, ...body });
      return Response.json(edge);
    },
  });

  server.registerHttpRoute({
    method: "delete",
    path: "/api/context-graph/edges/:id",
    operation: writeHigh,
    summary: "Delete edge by id",
    tags: ["context-graph"],
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: { 200: { description: "Deleted" } },
    handler: async (ctx) => {
      const t = tenantOr401(ctx.auth as Auth);
      if (typeof t !== "string") {
        return t;
      }
      const { id } = ctx.params as { id: string };
      await api.deleteEdgeById({ tenantId: t, id });
      return Response.json({ ok: true });
    },
  });

  if (!sourceRegistry) {
    return;
  }

  server.registerHttpRoute({
    method: "get",
    path: "/api/context-graph/sources",
    operation: lowReadOp,
    summary: "List registered context-graph sources",
    tags: ["context-graph"],
    responses: { 200: { description: "Source list" } },
    handler: async () => {
      const sources = sourceRegistry.list().map((s) => ({
        description: s.description ?? null,
        displayName: s.displayName,
        entityTypeIds: s.entityTypeIds ?? [],
        id: s.id,
      }));
      return Response.json({ sources });
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/context-graph/sources/:sourceId/status",
    operation: lowReadOp,
    summary: "Source sync status",
    tags: ["context-graph"],
    request: { params: z.object({ sourceId: z.string().min(1) }) },
    responses: { 200: { description: "Source status" } },
    handler: async (ctx) => {
      const t = tenantOr401(ctx.auth as Auth);
      if (typeof t !== "string") {
        return t;
      }
      const { sourceId } = ctx.params as { sourceId: string };
      const source = sourceRegistry.get(sourceId);
      if (!source) {
        return Response.json({ error: "source_not_found" }, { status: 404 });
      }
      const status = await source.getStatus(api, t);
      return Response.json(status);
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/context-graph/sources/:sourceId/sync",
    operation: { riskLevel: "medium" } as const,
    summary: "Sync source into context graph",
    tags: ["context-graph"],
    request: { params: z.object({ sourceId: z.string().min(1) }) },
    responses: { 200: { description: "Sync result" } },
    handler: async (ctx) => {
      const t = tenantOr401(ctx.auth as Auth);
      if (typeof t !== "string") {
        return t;
      }
      const { sourceId } = ctx.params as { sourceId: string };
      const source = sourceRegistry.get(sourceId);
      if (!source) {
        return Response.json({ error: "source_not_found" }, { status: 404 });
      }
      const result = await source.sync(api, t);
      return Response.json(result);
    },
  });
}
