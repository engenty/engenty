import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import {
  contactIdParamsSchema,
  contactRelationCreateInputSchema,
  contactRelationIdParamsSchema,
  contactRelationListItemSchema,
  contactRelationRecordSchema,
  contactRelationsListQuerySchema,
  contactRelationUpdateSchema,
  notFoundSchema,
} from "../schema/index.js";
import type { ContactRepoOrFactory, GetRepoFn } from "./helpers.js";

export function registerContactRelationRoutes(
  api: PluginServerApi,
  repoOrFactory: ContactRepoOrFactory,
  getRepoFn: GetRepoFn
) {
  api.registerHttpRoute({
    method: "post",
    path: "/api/contacts/relations",
    operation: {
      requiredCapabilities: ["module.contacts.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Create contact relation",
    tags: ["contacts"],
    request: { body: contactRelationCreateInputSchema },
    responses: {
      201: {
        description: "Created contact relation",
        schema: contactRelationRecordSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const body = ctx.body as z.infer<typeof contactRelationCreateInputSchema>;
      const created = await repo.createRelation(body);
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/contacts/:id/relations",
    operation: {
      requiredCapabilities: ["module.contacts.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List contact relations",
    tags: ["contacts"],
    request: {
      params: contactIdParamsSchema,
      query: contactRelationsListQuerySchema,
    },
    responses: {
      200: {
        description: "Contact relations",
        schema: z.array(contactRelationListItemSchema),
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof contactIdParamsSchema>;
      const url = new URL(ctx.request.url);
      const query = contactRelationsListQuerySchema.parse({
        include_inactive: url.searchParams.get("include_inactive") ?? undefined,
      });

      const contact = await repo.getById(params.id);
      if (!contact) {
        return new Response(JSON.stringify({ error: "Contact not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }

      return await repo.listRelationsForContact(params.id, {
        includeInactive: query.include_inactive,
      });
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/contacts/relations/:relationId",
    operation: {
      requiredCapabilities: ["module.contacts.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Update contact relation",
    tags: ["contacts"],
    request: {
      params: contactRelationIdParamsSchema,
      body: contactRelationUpdateSchema,
    },
    responses: {
      200: {
        description: "Updated contact relation",
        schema: contactRelationRecordSchema,
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<
        typeof contactRelationIdParamsSchema
      >;
      const patch = ctx.body as z.infer<typeof contactRelationUpdateSchema>;
      const updated = await repo.updateRelation(params.relationId, patch);
      if (!updated) {
        return new Response(JSON.stringify({ error: "Relation not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return updated;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/contacts/relations/:relationId",
    operation: {
      requiredCapabilities: ["module.contacts.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Delete contact relation",
    tags: ["contacts"],
    request: {
      params: contactRelationIdParamsSchema,
    },
    responses: {
      200: {
        description: "Deleted contact relation",
        schema: contactRelationRecordSchema,
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<
        typeof contactRelationIdParamsSchema
      >;
      const deleted = await repo.deleteRelation(params.relationId);
      if (!deleted) {
        return new Response(JSON.stringify({ error: "Relation not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return deleted;
    },
  });
}
