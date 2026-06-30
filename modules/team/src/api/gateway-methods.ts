import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { createTeamMemberRepoSupabase } from "../dal/supabase.js";
import {
  deleteTeamMemberResponseSchema,
  teamMemberCreateInputSchema,
  teamMemberIdParamsSchema,
  teamMemberSchema,
  teamMembersListQuerySchema,
  teamMembersPaginatedResponseSchema,
  teamMemberUpdateSchema,
  timeTrackingActorInputSchema,
  timeTrackingActorOutputSchema,
  timeTrackingListCatalogInputSchema,
  timeTrackingListCatalogOutputSchema,
} from "../schema/zod.js";
import { teamMemberInputForCreate } from "../services/team-member-input.js";

type TeamMemberRepo = ReturnType<typeof createTeamMemberRepoSupabase>;
type RepoOrFactory =
  | TeamMemberRepo
  | ((auth: PluginAuthContext) => TeamMemberRepo);

function getRepo(
  repoOrFactory: RepoOrFactory,
  auth?: PluginAuthContext
): TeamMemberRepo {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required for server-first repo");
    }
    return repoOrFactory(auth);
  }
  return repoOrFactory;
}

export function registerTeamMembersGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation">,
  repoOrFactory: RepoOrFactory
) {
  server.registerOperation({
    operationId: "team_list",
    summary: "List team members",
    moduleId: "team",
    requiredCapabilities: ["module.team.read"],
    riskLevel: "low",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: teamMembersListQuerySchema.partial(),
    outputSchema: teamMembersPaginatedResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = teamMembersListQuerySchema.parse(input ?? {});
      return repo.listPaginated(parsed);
    },
  });

  server.registerOperation({
    operationId: "team_get",
    summary: "Get team member by ID",
    moduleId: "team",
    requiredCapabilities: ["module.team.read"],
    riskLevel: "low",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: teamMemberIdParamsSchema,
    outputSchema: teamMemberSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const { id } = teamMemberIdParamsSchema.parse(input);
      return repo.getById(id);
    },
  });

  server.registerOperation({
    operationId: "team_create",
    summary: "Create team member",
    moduleId: "team",
    requiredCapabilities: ["module.team.write"],
    riskLevel: "high",
    idempotent: false,
    dryRunSupported: false,
    requiresApproval: true,
    inputSchema: teamMemberCreateInputSchema,
    outputSchema: teamMemberSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = teamMemberCreateInputSchema.parse(input);
      const {
        invite_email: _invite,
        invite_password: _invitePassword,
        invite_role: _inviteRole,
        ...partial
      } = parsed;
      return repo.create(teamMemberInputForCreate(partial));
    },
  });

  server.registerOperation({
    operationId: "team_update",
    summary: "Update team member",
    moduleId: "team",
    requiredCapabilities: ["module.team.write"],
    riskLevel: "high",
    idempotent: false,
    dryRunSupported: false,
    requiresApproval: true,
    inputSchema: z.object({
      id: z.string().min(1),
      patch: teamMemberUpdateSchema,
    }),
    outputSchema: teamMemberSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as {
        id: string;
        patch: z.infer<typeof teamMemberUpdateSchema>;
      };
      return repo.update(parsed.id, parsed.patch);
    },
  });

  server.registerOperation({
    operationId: "team_delete",
    summary: "Delete team member",
    moduleId: "team",
    requiredCapabilities: ["module.team.write"],
    riskLevel: "critical",
    idempotent: false,
    dryRunSupported: false,
    requiresApproval: true,
    inputSchema: teamMemberIdParamsSchema,
    outputSchema: deleteTeamMemberResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const { id } = teamMemberIdParamsSchema.parse(input);
      const deleted = await repo.delete(id);
      if (!deleted) {
        throw new Error(`Team member not found: ${id}`);
      }
      return { ok: true as const, id };
    },
  });

  server.registerOperation({
    operationId: "team_time_tracking_list_catalog",
    summary: "List team members for time-tracking catalog",
    moduleId: "team",
    requiredCapabilities: ["module.team.read"],
    riskLevel: "low",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: timeTrackingListCatalogInputSchema,
    outputSchema: timeTrackingListCatalogOutputSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      timeTrackingListCatalogInputSchema.parse(input);
      return repo.listTimeTrackingCatalog();
    },
  });

  server.registerOperation({
    operationId: "team_time_tracking_actor_for_principal",
    summary:
      "Resolve team member profile for a principal (time-tracking context)",
    moduleId: "team",
    requiredCapabilities: ["module.team.read"],
    riskLevel: "low",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: timeTrackingActorInputSchema,
    outputSchema: timeTrackingActorOutputSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const { principal_id } = timeTrackingActorInputSchema.parse(input);
      return repo.findActorForPrincipal(principal_id);
    },
  });
}
