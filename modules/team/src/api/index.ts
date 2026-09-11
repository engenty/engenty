import {
  capabilityCovers,
  createPluginServerGatewayCaller,
  type PluginAuthContext,
  type PluginServerApi,
} from "@engenty/plugin-sdk";
import type { z } from "@hono/zod-openapi";
import type { createTeamMemberRepoSupabase } from "../dal/supabase.js";
import {
  deleteTeamMemberResponseSchema,
  notFoundSchema,
  teamByEmailQuerySchema,
  teamByImportIdQuerySchema,
  teamMemberIdParamsSchema,
  teamMemberInputSchema,
  teamMemberSchema,
  teamMembersListQuerySchema,
  teamMembersPaginatedResponseSchema,
  teamMemberUpdateSchema,
} from "../schema/zod.js";
import { resolveProfileNameForWrite } from "../services/profile-name.js";
import { teamMemberInputForCreate } from "../services/team-member-input.js";
import { registerTeamMembersGatewayMethods } from "./gateway-methods.js";

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

/** Whether tenant user creation for invite is available. */
function canCreateInvitedUserAccount(
  server: Pick<PluginServerApi, "hasOperation">
): boolean {
  return server.hasOperation("core_users_create_in_tenant");
}

type InviteUserResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

/**
 * Creates a tenant Auth/core user for a team-member invite. Shared by POST
 * create and PATCH link-or-create so invite fields are not a silent no-op on
 * update.
 */
async function createInvitedUserAccount(opts: {
  auth: PluginAuthContext | undefined;
  displayName: string;
  inviteEmail: string;
  invitePassword: string;
  inviteRole?: "admin" | "member";
  invokeOperation: (
    methodName: string,
    input?: unknown,
    options?: { auth?: PluginAuthContext }
  ) => Promise<unknown | null>;
  server: Pick<PluginServerApi, "hasOperation">;
}): Promise<InviteUserResult> {
  // The nested core_users_create_in_tenant call runs through the in-process
  // gateway caller, which skips the policy gate — so the capability that
  // operation demands must be checked here, or module.team.write alone would
  // mint user accounts.
  if (!capabilityCovers(opts.auth?.capabilities ?? [], "core.users.manage")) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error:
            "Creating a user account requires the core.users.manage capability.",
        }),
        { status: 403, headers: { "content-type": "application/json" } }
      ),
    };
  }
  if (!canCreateInvitedUserAccount(opts.server)) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error:
            "Creating a user account with the team member is not available.",
        }),
        { status: 501, headers: { "content-type": "application/json" } }
      ),
    };
  }
  try {
    const result = (await opts.invokeOperation(
      "core_users_create_in_tenant",
      {
        display_name: opts.displayName,
        email: opts.inviteEmail.trim(),
        password: opts.invitePassword,
        role: opts.inviteRole ?? "member",
      },
      { auth: opts.auth }
    )) as { id: string };
    if (!result?.id) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: "Failed to create user account" }),
          { status: 400, headers: { "content-type": "application/json" } }
        ),
      };
    }
    return { ok: true, userId: result.id };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create user account";
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    };
  }
}

export function registerTeamMembersApi(
  server: Pick<
    PluginServerApi,
    | "registerHttpRoute"
    | "registerOperation"
    | "hasOperation"
    | "callGatewayMethod"
    | "getTenantDb"
  >,
  repoOrFactory: RepoOrFactory
) {
  const { invokeOperation } = createPluginServerGatewayCaller(
    server as PluginServerApi
  );

  server.registerHttpRoute({
    method: "get",
    path: "/api/team",
    operation: {
      moduleId: "team",
      requiredCapabilities: ["module.team.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List team members",
    tags: ["team"],
    request: { query: teamMembersListQuerySchema },
    responses: {
      200: {
        description: "Team members paginated list",
        schema: teamMembersPaginatedResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const url = new URL(ctx.request.url);
      const parsed = teamMembersListQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        sortBy: url.searchParams.get("sortBy") ?? undefined,
        sortOrder: url.searchParams.get("sortOrder") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        role_term_id: url.searchParams.get("role_term_id") ?? undefined,
        location_term_id: url.searchParams.get("location_term_id") ?? undefined,
        group_id: url.searchParams.get("group_id") ?? undefined,
      });
      return repo.listPaginated(parsed);
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/by-import-id",
    operation: {
      moduleId: "team",
      requiredCapabilities: ["module.team.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get team member by import ID",
    tags: ["team", "import"],
    request: { query: teamByImportIdQuerySchema },
    responses: {
      200: { description: "Team member", schema: teamMemberSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const url = new URL(ctx.request.url);
      const parsed = teamByImportIdQuerySchema.parse({
        import_id: url.searchParams.get("import_id") ?? undefined,
      });
      const member = await repo.getByImportId(parsed.import_id);
      if (!member) {
        return new Response(
          JSON.stringify({ error: "Team member not found" }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return member;
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/by-email",
    operation: {
      moduleId: "team",
      requiredCapabilities: ["module.team.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get team member by email",
    tags: ["team", "import"],
    request: { query: teamByEmailQuerySchema },
    responses: {
      200: { description: "Team member", schema: teamMemberSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const url = new URL(ctx.request.url);
      const parsed = teamByEmailQuerySchema.parse({
        email: url.searchParams.get("email") ?? undefined,
      });
      const member = await repo.getByEmail(parsed.email);
      if (!member) {
        return new Response(
          JSON.stringify({ error: "Team member not found" }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return member;
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/:id",
    operation: {
      moduleId: "team",
      requiredCapabilities: ["module.team.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get team member by ID",
    tags: ["team"],
    request: { params: teamMemberIdParamsSchema },
    responses: {
      200: { description: "Team member", schema: teamMemberSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof teamMemberIdParamsSchema>;
      const member = await repo.getById(params.id);
      if (!member) {
        return new Response(
          JSON.stringify({ error: "Team member not found" }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return member;
    },
  });

  registerTeamMembersGatewayMethods(server, repoOrFactory);

  server.registerHttpRoute({
    method: "post",
    path: "/api/team",
    operation: {
      moduleId: "team",
      requiredCapabilities: ["module.team.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Create team member",
    tags: ["team"],
    request: { body: teamMemberInputSchema },
    responses: {
      201: { description: "Created team member", schema: teamMemberSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const body = ctx.body as z.infer<typeof teamMemberInputSchema>;
      const { invite_email, invite_password, invite_role, ...rest } = body;
      const { full_name: displayName } = resolveProfileNameForWrite(rest);
      let user_id: string | null = rest.user_id ?? null;
      if (invite_email && invite_password?.trim()) {
        const invited = await createInvitedUserAccount({
          auth: ctx.auth,
          displayName,
          inviteEmail: invite_email,
          invitePassword: invite_password,
          inviteRole: invite_role,
          invokeOperation,
          server,
        });
        if (!invited.ok) {
          return invited.response;
        }
        user_id = invited.userId;
      }
      const created = await repo.create(
        teamMemberInputForCreate({
          ...rest,
          user_id,
        })
      );
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/team/:id",
    operation: {
      moduleId: "team",
      requiredCapabilities: ["module.team.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Update team member",
    tags: ["team"],
    request: {
      params: teamMemberIdParamsSchema,
      body: teamMemberUpdateSchema,
    },
    responses: {
      200: { description: "Updated team member", schema: teamMemberSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof teamMemberIdParamsSchema>;
      const patch = ctx.body as z.infer<typeof teamMemberUpdateSchema>;
      const { invite_email, invite_password, invite_role, ...rest } = patch;

      let user_id = rest.user_id;
      if (invite_email && invite_password?.trim()) {
        const existing = await repo.getById(params.id);
        if (!existing) {
          return new Response(
            JSON.stringify({ error: "Team member not found" }),
            {
              status: 404,
              headers: { "content-type": "application/json" },
            }
          );
        }
        const { full_name: displayName } = resolveProfileNameForWrite({
          ...existing,
          ...rest,
        });
        const invited = await createInvitedUserAccount({
          auth: ctx.auth,
          displayName,
          inviteEmail: invite_email,
          invitePassword: invite_password,
          inviteRole: invite_role,
          invokeOperation,
          server,
        });
        if (!invited.ok) {
          return invited.response;
        }
        user_id = invited.userId;
      }

      const updated = await repo.update(params.id, {
        ...rest,
        ...(user_id === undefined ? {} : { user_id }),
      });
      if (!updated) {
        return new Response(
          JSON.stringify({ error: "Team member not found" }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return updated;
    },
  });

  server.registerHttpRoute({
    method: "delete",
    path: "/api/team/:id",
    operation: {
      moduleId: "team",
      requiredCapabilities: ["module.team.write"],
      riskLevel: "critical",
      requiresApproval: true,
    },
    summary: "Delete team member",
    tags: ["team"],
    request: { params: teamMemberIdParamsSchema },
    responses: {
      200: { description: "Deleted", schema: deleteTeamMemberResponseSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const params = ctx.params as z.infer<typeof teamMemberIdParamsSchema>;
      const ok = await repo.delete(params.id);
      if (!ok) {
        return new Response(
          JSON.stringify({ error: "Team member not found" }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return { ok: true as const, id: params.id };
    },
  });
}
