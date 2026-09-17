import { capabilityCovers } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findAccessibleSpace } from "../../dal/space-membership.js";
import { resolveSpaceResourceSurface } from "../../dal/space-mounts.js";
import type { PrincipalContext } from "../../security/auth.js";
import type { GrantsService } from "../../security/grants-service.js";
import type { McpClientGrant } from "./grants.js";
import { grantAllowsSpace } from "./grants.js";

export interface McpGrantedSpace {
  id: string;
  name: string;
}

export interface McpAuthorityResolver {
  listSpaces(
    grant: McpClientGrant,
    principal: PrincipalContext
  ): Promise<McpGrantedSpace[]>;
  resolve(
    grant: McpClientGrant,
    principal: PrincipalContext,
    requestedSpaceId?: string
  ): Promise<PrincipalContext>;
}

export class McpAuthorityError extends Error {
  readonly code: "space_required" | "space_not_allowed";

  constructor(code: "space_required" | "space_not_allowed") {
    super(code);
    this.code = code;
    this.name = "McpAuthorityError";
  }
}

function selectedSpaceId(
  grant: McpClientGrant,
  requestedSpaceId?: string
): string {
  const requested = requestedSpaceId?.trim();
  if (requested) {
    if (!grantAllowsSpace(grant, requested)) {
      throw new McpAuthorityError("space_not_allowed");
    }
    return requested;
  }
  if (grant.spaceIds.length !== 1) {
    throw new McpAuthorityError("space_required");
  }
  return grant.spaceIds[0]!;
}

function intersectCapabilities(
  userCapabilities: string[],
  spaceCapabilities: string[]
): string[] {
  return spaceCapabilities.filter((capability) =>
    userCapabilities.some((ceiling) => capabilityCovers([ceiling], capability))
  );
}

export function createMcpAuthorityResolver(deps: {
  getDb: (auth: { tenantId: string }) => SupabaseClient;
  grants: GrantsService;
}): McpAuthorityResolver {
  const resolveSpace = async (
    grant: McpClientGrant,
    principal: PrincipalContext,
    spaceId: string
  ) => {
    const client = deps.getDb({ tenantId: principal.tenantId });
    const space = await findAccessibleSpace(
      client,
      principal.tenantId,
      grant.userId,
      spaceId
    );
    if (!space) {
      throw new McpAuthorityError("space_not_allowed");
    }
    return { client, space };
  };

  return {
    async listSpaces(grant, principal) {
      const spaces = await Promise.all(
        grant.spaceIds.map(async (spaceId) => {
          try {
            return (await resolveSpace(grant, principal, spaceId)).space;
          } catch {
            return null;
          }
        })
      );
      return spaces
        .filter((space): space is NonNullable<typeof space> => Boolean(space))
        .map((space) => ({ id: space.id, name: space.name }));
    },

    async resolve(grant, principal, requestedSpaceId) {
      const spaceId = selectedSpaceId(grant, requestedSpaceId);
      const { client, space } = await resolveSpace(grant, principal, spaceId);
      const [surface, userResult] = await Promise.all([
        resolveSpaceResourceSurface(client, principal.tenantId, space.id),
        client
          .schema("core")
          .from("users")
          .select("role, is_super_admin")
          .eq("tenant_id", principal.tenantId)
          .eq("id", grant.userId)
          .maybeSingle(),
      ]);
      if (userResult.error || !userResult.data) {
        throw new McpAuthorityError("space_not_allowed");
      }
      const user = userResult.data as {
        is_super_admin?: boolean;
        role?: string;
      };
      const userGrants = await deps.grants.resolveGrants(
        {
          id: grant.userId,
          isSuperAdmin: user.is_super_admin === true,
          kind: "user",
          tenantRole:
            user.role === "admin"
              ? "admin"
              : user.role === "member"
                ? "member"
                : null,
        },
        principal.tenantId
      );
      return {
        ...principal,
        capabilities: intersectCapabilities(
          userGrants.capabilities,
          surface.capabilities
        ),
        maxRiskLevel: grant.maxRiskLevel,
        moduleIds: surface.modules.map((module) => module.moduleId),
        roleProfiles: userGrants.roleProfiles,
        spaceId: space.id,
      };
    },
  };
}

/** Offline test adapter. Production must use the live database resolver above. */
export function createStaticMcpAuthorityResolver(): McpAuthorityResolver {
  return {
    async listSpaces(grant) {
      return grant.spaceIds.map((id) => ({ id, name: id }));
    },
    async resolve(grant, principal, requestedSpaceId) {
      const spaceId = selectedSpaceId(grant, requestedSpaceId);
      return {
        ...principal,
        maxRiskLevel: grant.maxRiskLevel,
        spaceId,
      };
    },
  };
}
