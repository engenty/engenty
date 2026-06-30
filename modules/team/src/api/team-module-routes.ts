import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import {
  createTeamModuleDal,
  TaxonomyTermConflictError,
} from "../dal/team-module-supabase.js";
import { teamMemberFieldDefinitionsPutSchema } from "../schema/member-field-definitions.js";

function getDal(supabase: unknown, auth?: PluginAuthContext) {
  if (!auth?.tenantId) {
    throw new Error("Tenant required");
  }
  return createTeamModuleDal(supabase as never, auth.tenantId);
}

const taxonomyInputSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  target: z.enum(["profile", "group"]),
  supports_order: z.boolean().optional(),
  supports_hierarchy: z.boolean().optional(),
  cardinality: z.enum(["single", "multiple"]).optional(),
  filterable: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const termInputSchema = z.object({
  id: z.string().uuid().optional(),
  term_slug: z.string().min(1),
  label: z.string().min(1),
  parent_term_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export function registerTeamModuleRoutes(
  server: Pick<PluginServerApi, "registerHttpRoute">,
  supabase: unknown
) {
  const readCap = ["module.team.read"] as const;
  const writeCap = ["module.team.write"] as const;
  const settingsCap = ["module.team.settings.write"] as const;
  const orgCap = ["module.team.org.write"] as const;
  const groupsCap = ["module.team.groups.write"] as const;

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/taxonomies",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List taxonomies",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      return dal.listTaxonomies();
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/team/taxonomies",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...settingsCap],
      riskLevel: "medium",
      idempotent: false,
    },
    summary: "Create taxonomy",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      const body = taxonomyInputSchema.parse(await ctx.request.json());
      return dal.upsertTaxonomy({
        ...body,
        builtin: null,
        supports_order: body.supports_order ?? false,
        supports_hierarchy: body.supports_hierarchy ?? false,
        cardinality: body.cardinality ?? "single",
        filterable: body.filterable ?? true,
        sort_order: body.sort_order ?? 0,
        config: body.config ?? {},
        deletable: true,
      });
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/team/taxonomies/:slug",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...settingsCap],
      riskLevel: "medium",
      idempotent: true,
    },
    summary: "Update a custom taxonomy",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      const slug = (ctx.params as { slug: string }).slug;
      const taxonomies = await dal.listTaxonomies();
      const existing = taxonomies.find((t) => t.slug === slug);
      if (!existing) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        });
      }
      if (existing.builtin) {
        return new Response(
          JSON.stringify({ error: "Cannot modify builtin taxonomy" }),
          { status: 403 }
        );
      }
      const patchSchema = z.object({
        label: z.string().min(1).optional(),
        supports_hierarchy: z.boolean().optional(),
        supports_order: z.boolean().optional(),
        cardinality: z.enum(["single", "multiple"]).optional(),
        filterable: z.boolean().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      });
      const patch = patchSchema.parse(await ctx.request.json());
      return dal.upsertTaxonomy({
        ...existing,
        ...patch,
        config: patch.config
          ? { ...existing.config, ...patch.config }
          : existing.config,
      });
    },
  });

  server.registerHttpRoute({
    method: "delete",
    path: "/api/team/taxonomies/:slug",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...settingsCap],
      riskLevel: "high",
      idempotent: true,
    },
    summary: "Delete a custom taxonomy",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      const slug = (ctx.params as { slug: string }).slug;
      const taxonomies = await dal.listTaxonomies();
      const existing = taxonomies.find((t) => t.slug === slug);
      if (!existing) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        });
      }
      if (existing.builtin || !existing.deletable) {
        return new Response(
          JSON.stringify({
            error: "Cannot delete builtin or non-deletable taxonomy",
          }),
          { status: 403 }
        );
      }
      await dal.deleteTaxonomy(slug);
      return { ok: true };
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/taxonomies/:slug/terms",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List taxonomy terms",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      const slug = (ctx.params as { slug: string }).slug;
      const taxonomies = await dal.listTaxonomies();
      const taxonomy = taxonomies.find((t) => t.slug === slug);
      if (!taxonomy) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        });
      }
      if (taxonomy.supports_hierarchy) {
        return dal.getTermsTree(slug);
      }
      const terms = await dal.listTerms(slug);
      const { sortTerms } = await import("../services/taxonomy-resolver.js");
      return sortTerms(terms, taxonomy);
    },
  });

  server.registerHttpRoute({
    method: "put",
    path: "/api/team/taxonomies/:slug/terms",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...settingsCap],
      riskLevel: "medium",
      idempotent: true,
    },
    summary: "Upsert taxonomy terms",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      const slug = (ctx.params as { slug: string }).slug;
      const taxonomies = await dal.listTaxonomies();
      const taxonomy = taxonomies.find((t) => t.slug === slug);
      if (!taxonomy) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        });
      }
      const body = z.array(termInputSchema).parse(await ctx.request.json());
      try {
        return await dal.upsertTerms(taxonomy, body);
      } catch (err) {
        if (err instanceof TaxonomyTermConflictError) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 409,
          });
        }
        throw err;
      }
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/taxonomies/filter-options",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Filter options for team list",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      return dal.listFilterOptions();
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/org",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Org tree",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      return dal.getOrgTree();
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/org/graph",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Flat org graph data with grouping metadata",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      return dal.getOrgGraphData();
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/team/org/:nodeId",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...orgCap],
      riskLevel: "medium",
      idempotent: true,
    },
    summary: "Update org node",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      const body = z
        .object({
          reports_to_id: z.string().nullable().optional(),
          display_name: z.string().optional(),
          display_title: z.string().nullable().optional(),
          icon: z.string().nullable().optional(),
          status: z.string().nullable().optional(),
        })
        .parse(await ctx.request.json());
      return dal.updateOrgNode((ctx.params as { nodeId: string }).nodeId, body);
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/groups",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List groups",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      return dal.listGroups();
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/team/groups",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...groupsCap],
      riskLevel: "medium",
      idempotent: false,
    },
    summary: "Create group",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      const body = z
        .object({
          name: z.string().min(1),
          description: z.string().nullable().optional(),
          type_term_id: z.string().uuid(),
          lead_org_node_id: z.string().nullable().optional(),
        })
        .parse(await ctx.request.json());
      return dal.createGroup(body);
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/member-field-definitions",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List team member custom field definitions",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      return dal.listMemberFieldDefinitions();
    },
  });

  server.registerHttpRoute({
    method: "put",
    path: "/api/team/member-field-definitions",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...settingsCap],
      riskLevel: "medium",
      idempotent: true,
    },
    summary: "Replace team member custom field definitions",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      const body = teamMemberFieldDefinitionsPutSchema.parse(
        await ctx.request.json()
      );
      return dal.replaceMemberFieldDefinitions(body.definitions);
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/settings",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...readCap],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Team module settings",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      const taxonomies = await dal.listTaxonomies();
      const termsByTaxonomy: Record<string, unknown> = {};
      for (const taxonomy of taxonomies) {
        // Always return a flat list for the settings page: the UI taxonomy
        // manager reconstructs the hierarchy from parent_term_id on each term.
        // getTermsTree returns nested children[] nodes which lose parent_term_id
        // and cause child terms to be silently dropped when loading drafts.
        termsByTaxonomy[taxonomy.slug] = await dal.listTerms(taxonomy.slug);
      }
      return {
        taxonomies,
        termsByTaxonomy,
        ...(await dal.getModuleSettings()),
      };
    },
  });

  server.registerHttpRoute({
    method: "put",
    path: "/api/team/members/:id/taxonomies",
    operation: {
      moduleId: "team",
      requiredCapabilities: [...writeCap],
      riskLevel: "medium",
      idempotent: true,
    },
    summary: "Set profile taxonomy assignments",
    tags: ["team"],
    handler: async (ctx) => {
      const dal = getDal(supabase, ctx.auth);
      const body = z
        .record(z.string(), z.union([z.string(), z.array(z.string())]))
        .parse(await ctx.request.json());
      await dal.setProfileTaxonomies((ctx.params as { id: string }).id, body);
      return { ok: true };
    },
  });
}
