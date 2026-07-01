import type { PluginServerApi } from "@engenty/plugin-sdk";
import {
  addContactRoleBodySchema,
  contactIdParamsSchema,
  contactIdRoleParamsSchema,
  contactRecordSchema,
  notFoundSchema,
} from "../schema/zod.js";
import type { ContactRepoOrFactory, GetRepoFn } from "./helpers.js";

export function registerRolesRoutes(
  api: PluginServerApi,
  repoOrFactory: ContactRepoOrFactory,
  getRepoFn: GetRepoFn
) {
  api.registerHttpRoute({
    method: "post",
    path: "/api/contacts/:id/roles",
    operation: {
      requiredCapabilities: ["module.contacts.write"],
      riskLevel: "medium",
      requiresApproval: false,
    },
    summary: "Add role to contact",
    tags: ["contacts"],
    request: {
      params: contactIdParamsSchema,
      body: addContactRoleBodySchema,
    },
    responses: {
      200: { description: "Role added", schema: contactRecordSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const params = ctx.params as { id: string };
      const body = ctx.body as { role: string };
      const ok = await repo.addContactRole(params.id, body.role);
      if (!ok) {
        const existing = await repo.getById(params.id);
        const status = existing ? 500 : 404;
        const error = existing ? "Failed to add role" : "Contact not found";
        return new Response(JSON.stringify({ error }), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
      const contact = await repo.getById(params.id);
      return contact;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/contacts/:id/roles/:role",
    operation: {
      requiredCapabilities: ["module.contacts.write"],
      riskLevel: "medium",
      requiresApproval: false,
    },
    summary: "Remove role from contact",
    tags: ["contacts"],
    request: { params: contactIdRoleParamsSchema },
    responses: {
      200: { description: "Role removed", schema: contactRecordSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepoFn(repoOrFactory, ctx.auth);
      const params = ctx.params as { id: string; role: string };
      const ok = await repo.removeContactRole(params.id, params.role);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Contact not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const contact = await repo.getById(params.id);
      return contact;
    },
  });
}
