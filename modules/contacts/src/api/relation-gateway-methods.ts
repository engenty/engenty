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
} from "../schema/index.js";
import type { ContactRepoOrFactory, GetRepoFn } from "./helpers.js";

export function registerContactRelationGatewayMethods(
  api: PluginServerApi,
  repoOrFactory: ContactRepoOrFactory,
  getRepoFn: GetRepoFn
) {
  const listRelationsInputSchema = contactIdParamsSchema.merge(
    contactRelationsListQuerySchema
  );

  api.registerOperation({
    operationId: "contacts_create_relation",
    moduleId: "contacts",
    summary: "Create contact relation",
    requiredCapabilities: ["module.contacts.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: contactRelationCreateInputSchema,
    outputSchema: contactRelationRecordSchema,
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = contactRelationCreateInputSchema.parse(input);
      return await repo.createRelation(parsed);
    },
  });

  api.registerOperation({
    operationId: "contacts_list_relations",
    moduleId: "contacts",
    summary: "List contact relations",
    requiredCapabilities: ["module.contacts.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: listRelationsInputSchema,
    outputSchema: z.array(contactRelationListItemSchema),
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = listRelationsInputSchema.parse(input);
      const contact = await repo.getById(parsed.id);
      if (!contact) {
        throw new Error("Contact not found");
      }
      return await repo.listRelationsForContact(parsed.id, {
        includeInactive: parsed.include_inactive,
      });
    },
  });

  api.registerOperation({
    operationId: "contacts_update_relation",
    moduleId: "contacts",
    summary: "Update contact relation",
    requiredCapabilities: ["module.contacts.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      relationId: z.string().min(1),
      patch: contactRelationUpdateSchema,
    }),
    outputSchema: contactRelationRecordSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = z
        .object({
          relationId: z.string().min(1),
          patch: contactRelationUpdateSchema,
        })
        .parse(input);
      return await repo.updateRelation(parsed.relationId, parsed.patch);
    },
  });

  api.registerOperation({
    operationId: "contacts_delete_relation",
    moduleId: "contacts",
    summary: "Delete contact relation",
    requiredCapabilities: ["module.contacts.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: contactRelationIdParamsSchema,
    outputSchema: contactRelationRecordSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const parsed = contactRelationIdParamsSchema.parse(input);
      return await repo.deleteRelation(parsed.relationId);
    },
  });
}
