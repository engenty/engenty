import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { teamMembersAiRegistration } from "../ai/registrar.js";
import { registerTeamHabboAvatarRoutes } from "./api/habbo-avatar-routes.js";
import { registerTeamImportRoutes } from "./api/import-routes.js";
import { registerTeamMembersApi } from "./api/index.js";
import { registerTeamModuleRoutes } from "./api/team-module-routes.js";
import { registerTeamContextGraph } from "./context-graph-registration.js";
import { createTeamMemberRepoSupabase } from "./dal/supabase.js";
import { teamMemberCreateInputSchema } from "./schema/zod.js";
import { teamMemberInputForCreate } from "./services/team-member-input.js";

const registerTeamMembersPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "team.viewer",
      title: "Team viewer",
      capabilities: ["module.team.read"],
    },
    {
      id: "team.editor",
      title: "Team editor",
      capabilities: ["module.team.read", "module.team.write"],
    },
  ]);
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): every lane in this
  // module is request- or tenant-shaped (routes carry auth, context-graph
  // status/sync carry a tenantId), so ALL work runs on tenant-locked handles
  // (engenty_server lane, RLS-enforced) — no service-client use remains.
  const getTenantDb = engenty.server.getTenantDb;
  if (!getTenantDb) {
    return;
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;

  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createTeamMemberRepoSupabase(getDb(auth), auth.tenantId, auth.scopeId);
  registerTeamModuleRoutes(engenty.server, getDb);
  registerTeamHabboAvatarRoutes(engenty.server);
  registerTeamImportRoutes(engenty.server);
  registerTeamMembersApi(engenty.server, repoOrFactory);

  engenty.server.registerAiRegistration(teamMembersAiRegistration());
  registerTeamContextGraph({
    getDb,
    server: engenty.server,
  });

  const TEAM_SCHEMA_DESCRIPTION = `Team member create schema (use snake_case). REQUIRED: full_name (string).
Optional (string or null): initials, position, department, phone, email, location. Optional: member_type ("internal"|"external"|"contractor"), user_id (UUID). HR/employment fields belong to the team-hr module, not the core member.`;
  engenty.server.registerTestDataType({
    meta: {
      createOperationId: "team_create",
      module_id: "team",
      data_type: "team",
      description: "Team member records",
      recordSchema: teamMemberCreateInputSchema,
      schemaDescription: TEAM_SCHEMA_DESCRIPTION,
    },
    normalizeInput: (record) => ({
      ...record,
      // Team-members test data should never link to an existing core user.
      user_id: null,
    }),
    persist: async (records, ctx) => {
      const scopeId = ctx.scopeId ?? "default";
      const repo = repoOrFactory({
        tenantId: ctx.tenantId,
        scopeId,
      });
      let created = 0;
      for (const raw of records) {
        const parsed = teamMemberCreateInputSchema.parse(raw) as z.infer<
          typeof teamMemberCreateInputSchema
        >;
        const { invite_email: _invite, ...partial } = parsed;
        await repo.create(teamMemberInputForCreate(partial));
        created++;
      }
      return created;
    },
  });
};

export default registerTeamMembersPlugin;
