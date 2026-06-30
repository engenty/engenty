import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  TeamMember,
  TeamMemberInput,
  TeamMembersPaginatedResponse,
  TeamMembersQueryParams,
  TeamMemberUpdateInput,
} from "../schema/types.js";
import { resolveProfileNameForWrite } from "../services/profile-name.js";
import { createTeamModuleDal } from "./team-module-supabase.js";

const PROFILE_NAME_KEYS = [
  "name_prefix",
  "first_name",
  "middle_name",
  "last_name",
  "name_suffix",
  "phonetic_name",
  "birth_name",
  "full_name_override",
  "full_name",
  "initials",
] as const;

const PROFILE_KEYS = new Set([
  "full_name",
  "full_name_override",
  "name_prefix",
  "first_name",
  "middle_name",
  "last_name",
  "name_suffix",
  "phonetic_name",
  "birth_name",
  "initials",
  "phone",
  "email",
  "position",
  "department",
  "location",
  "profile_image_storage_key",
  "user_id",
  "member_type",
  "import_id",
  "last_imported_at",
]);

function rowToTeamMember(row: Record<string, unknown>): TeamMember {
  const memberType =
    (row.member_type as TeamMember["member_type"] | undefined) ?? "internal";
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    user_id: (row.user_id as string | null) ?? null,
    member_type: memberType,
    full_name: String(row.full_name ?? ""),
    name_prefix: (row.name_prefix as string | null) ?? null,
    first_name: (row.first_name as string | null) ?? null,
    middle_name: (row.middle_name as string | null) ?? null,
    last_name: (row.last_name as string | null) ?? null,
    name_suffix: (row.name_suffix as string | null) ?? null,
    phonetic_name: (row.phonetic_name as string | null) ?? null,
    birth_name: (row.birth_name as string | null) ?? null,
    full_name_override: (row.full_name_override as string | null) ?? null,
    initials: (row.initials as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    position: (row.position as string | null) ?? null,
    department: (row.department as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    profile_image_storage_key:
      (row.profile_image_storage_key as string | null) ?? null,
    import_id: (row.import_id as string | null) ?? null,
    last_imported_at: (row.last_imported_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSortBy(sortBy?: TeamMembersQueryParams["sortBy"]): string {
  const map: Record<NonNullable<TeamMembersQueryParams["sortBy"]>, string> = {
    full_name: "full_name",
    position: "position",
    department: "department",
    created_at: "created_at",
  };
  return sortBy ? (map[sortBy] ?? "full_name") : "full_name";
}

function resolveInputProfileName(
  input: TeamMemberInput | TeamMemberUpdateInput
) {
  return resolveProfileNameForWrite(input);
}

function applyResolvedNameToProfilePatch(
  existing: TeamMember,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const touchesName = PROFILE_NAME_KEYS.some((key) => key in patch);
  if (!touchesName) {
    return patch;
  }

  const resolved = resolveProfileNameForWrite({
    name_prefix:
      (patch.name_prefix as string | null | undefined) ?? existing.name_prefix,
    first_name:
      (patch.first_name as string | null | undefined) ?? existing.first_name,
    middle_name:
      (patch.middle_name as string | null | undefined) ?? existing.middle_name,
    last_name:
      (patch.last_name as string | null | undefined) ?? existing.last_name,
    name_suffix:
      (patch.name_suffix as string | null | undefined) ?? existing.name_suffix,
    phonetic_name:
      (patch.phonetic_name as string | null | undefined) ??
      existing.phonetic_name,
    birth_name:
      (patch.birth_name as string | null | undefined) ?? existing.birth_name,
    full_name_override:
      (patch.full_name_override as string | null | undefined) ??
      existing.full_name_override,
    full_name:
      (patch.full_name as string | null | undefined) ?? existing.full_name,
    initials:
      (patch.initials as string | null | undefined) ?? existing.initials,
  });

  return {
    ...patch,
    ...resolved.parts,
    full_name: resolved.full_name,
    initials: resolved.initials,
  };
}

function buildProfileRow(
  profileId: string,
  tenantId: string,
  scopeId: string,
  input: TeamMemberInput,
  now: string
): Record<string, unknown> {
  const { parts, full_name, initials } = resolveInputProfileName(input);
  return {
    id: profileId,
    tenant_id: tenantId,
    scope_id: scopeId,
    user_id: input.user_id ?? null,
    member_type: input.member_type ?? "internal",
    ...parts,
    full_name,
    initials,
    phone: input.phone ?? null,
    email: input.email ?? null,
    position: input.position ?? null,
    department: input.department ?? null,
    location: input.location ?? null,
    profile_image_storage_key: input.profile_image_storage_key ?? null,
    import_id: input.import_id ?? null,
    last_imported_at: input.last_imported_at ?? null,
    created_at: now,
    updated_at: now,
  };
}

function profileUpdatePatch(
  input: TeamMemberUpdateInput
): Record<string, unknown> {
  const profile: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }
    if (PROFILE_KEYS.has(key)) {
      profile[key] = value;
    }
  }
  return profile;
}

export type TeamMemberRepoSupabase = ReturnType<
  typeof createTeamMemberRepoSupabase
>;

export function createTeamMemberRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const schema = "module_team";
  const profiles = () => supabase.schema(schema).from("profiles");
  const taxonomyAssignments = () =>
    supabase.schema(schema).from("profile_taxonomy_assignments");
  const orgNodes = () => supabase.schema(schema).from("org_nodes");
  const groupMembers = () => supabase.schema(schema).from("group_members");

  async function profileIdsMatchingFilters(
    params: TeamMembersQueryParams
  ): Promise<string[] | null> {
    let ids: Set<string> | null = null;

    const intersect = (next: string[]) => {
      if (next.length === 0) {
        ids = new Set();
        return;
      }
      if (ids === null) {
        ids = new Set(next);
        return;
      }
      const nextSet = new Set(next);
      ids = new Set([...ids].filter((id) => nextSet.has(id)));
    };

    if (params.role_term_id) {
      const { data, error } = await taxonomyAssignments()
        .select("profile_id")
        .eq("tenant_id", tenantId)
        .eq("taxonomy_slug", "role")
        .eq("term_id", params.role_term_id);
      if (error) {
        throw new Error(`Failed to filter by role: ${error.message}`);
      }
      intersect((data ?? []).map((row) => String(row.profile_id)));
    }

    if (params.location_term_id) {
      const { data, error } = await taxonomyAssignments()
        .select("profile_id")
        .eq("tenant_id", tenantId)
        .eq("taxonomy_slug", "location")
        .eq("term_id", params.location_term_id);
      if (error) {
        throw new Error(`Failed to filter by location: ${error.message}`);
      }
      intersect((data ?? []).map((row) => String(row.profile_id)));
    }

    if (params.group_id) {
      const { data: members, error: gmErr } = await groupMembers()
        .select("org_node_id")
        .eq("tenant_id", tenantId)
        .eq("group_id", params.group_id);
      if (gmErr) {
        throw new Error(`Failed to filter by group: ${gmErr.message}`);
      }
      const nodeIds = (members ?? []).map((row) => String(row.org_node_id));
      if (nodeIds.length === 0) {
        intersect([]);
      } else {
        const { data: nodes, error: nodeErr } = await orgNodes()
          .select("profile_id")
          .eq("tenant_id", tenantId)
          .eq("node_kind", "human")
          .in("id", nodeIds);
        if (nodeErr) {
          throw new Error(
            `Failed to resolve group members: ${nodeErr.message}`
          );
        }
        intersect(
          (nodes ?? [])
            .map((row) => row.profile_id)
            .filter(
              (id): id is string => typeof id === "string" && id.length > 0
            )
        );
      }
    }

    if (ids === null) {
      return null;
    }
    return [...ids];
  }

  return {
    async create(input: TeamMemberInput): Promise<TeamMember> {
      const { role_term_id, location_term_id, ...memberInput } = input;
      const profileId = uuidv7();
      const now = new Date().toISOString();

      const profileRow = buildProfileRow(
        profileId,
        tenantId,
        scopeId,
        memberInput,
        now
      );

      const { error: profileError } = await profiles()
        .insert(profileRow)
        .select()
        .single();

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      const teamModuleDal = createTeamModuleDal(supabase, tenantId);
      await teamModuleDal.ensureBuiltinTaxonomies();
      const { full_name: orgDisplayName } =
        resolveInputProfileName(memberInput);
      await teamModuleDal.ensureHumanOrgNode(profileId, orgDisplayName);

      const roleTermId = role_term_id?.trim();
      const locationTermId = location_term_id?.trim();
      const taxonomyValues: Record<string, string> = {};
      if (roleTermId) {
        taxonomyValues.role = roleTermId;
      }
      if (locationTermId) {
        taxonomyValues.location = locationTermId;
      }
      if (Object.keys(taxonomyValues).length > 0) {
        await teamModuleDal.setProfileTaxonomies(profileId, taxonomyValues);
      }

      const created = await this.getById(profileId);
      if (!created) {
        throw new Error("Failed to load created team member");
      }
      return created;
    },

    async listPaginated(
      params: TeamMembersQueryParams = {}
    ): Promise<TeamMembersPaginatedResponse> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 1000);
      const sortBy = mapSortBy(params.sortBy);
      const sortOrder = params.sortOrder === "asc";

      let query = profiles()
        .select("*", { count: "exact", head: false })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (params.search?.trim()) {
        const search = `%${params.search.trim()}%`;
        query = query.or(
          `full_name.ilike.${search},first_name.ilike.${search},last_name.ilike.${search},middle_name.ilike.${search},name_prefix.ilike.${search},phonetic_name.ilike.${search},birth_name.ilike.${search},initials.ilike.${search},position.ilike.${search},department.ilike.${search},location.ilike.${search},email.ilike.${search}`
        );
      }

      const filteredIds = await profileIdsMatchingFilters(params);
      if (filteredIds !== null) {
        if (filteredIds.length === 0) {
          return { data: [], total: 0, page, pageSize };
        }
        query = query.in("id", filteredIds);
      }

      const { data, error, count } = await query
        .order(sortBy, { ascending: sortOrder })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) {
        throw new Error(`Failed to list team members: ${error.message}`);
      }

      const rows = data ?? [];
      const teamModuleDal = createTeamModuleDal(supabase, tenantId);
      const orgByProfile = await teamModuleDal.getHumanOrgReportsByProfileIds(
        rows.map((row) => String((row as { id: string }).id))
      );

      return {
        data: rows.map((row) => {
          const member = rowToTeamMember(row as Record<string, unknown>);
          const org = orgByProfile.get(member.id);
          return org ? { ...member, ...org } : member;
        }),
        total: count ?? 0,
        page,
        pageSize,
      };
    },

    async getById(id: string): Promise<TeamMember | null> {
      const { data, error } = await profiles()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }
      const member = rowToTeamMember(data as Record<string, unknown>);
      const teamModuleDal = createTeamModuleDal(supabase, tenantId);
      const [assigned, org] = await Promise.all([
        teamModuleDal.getProfileTaxonomies(id),
        teamModuleDal.getHumanOrgNodeByProfileId(id),
      ]);
      return {
        ...member,
        role_term_id: assigned.role?.id ?? null,
        role_term: assigned.role?.term_slug ?? null,
        location_term_id: assigned.location?.id ?? null,
        location_term: assigned.location?.term_slug ?? null,
        ...(org ?? {
          org_node_id: null,
          reports_to_id: null,
          reports_to_display_name: null,
        }),
      };
    },

    async update(
      id: string,
      input: TeamMemberUpdateInput
    ): Promise<TeamMember | null> {
      const existing = await this.getById(id);
      if (!existing) {
        return null;
      }

      const now = new Date().toISOString();
      const profilePatch = profileUpdatePatch(input);

      if (Object.keys(profilePatch).length > 0) {
        const resolvedPatch = applyResolvedNameToProfilePatch(
          existing,
          profilePatch
        );
        const { error: pErr } = await profiles()
          .update({ ...resolvedPatch, updated_at: now })
          .eq("id", id)
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId);
        if (pErr) {
          throw new Error(`Failed to update profile: ${pErr.message}`);
        }
      }

      const { role_term_id, location_term_id, reports_to_id } = input;
      const teamModuleDal = createTeamModuleDal(supabase, tenantId);

      if (role_term_id !== undefined || location_term_id !== undefined) {
        const assigned = await teamModuleDal.getProfileTaxonomies(id);
        const nextRoleId =
          role_term_id === undefined
            ? (assigned.role?.id ?? null)
            : role_term_id === null
              ? null
              : role_term_id.trim() || null;
        const nextLocationId =
          location_term_id === undefined
            ? (assigned.location?.id ?? null)
            : location_term_id === null
              ? null
              : location_term_id.trim() || null;
        const values: Record<string, string> = {};
        if (nextRoleId) {
          values.role = nextRoleId;
        }
        if (nextLocationId) {
          values.location = nextLocationId;
        }
        await teamModuleDal.setProfileTaxonomies(id, values);
      }

      if (reports_to_id !== undefined) {
        const { full_name: orgDisplayName } = resolveProfileNameForWrite({
          ...existing,
          ...input,
        });
        const orgNode = await teamModuleDal.ensureHumanOrgNode(
          id,
          orgDisplayName
        );
        const resolvedReportsTo =
          await teamModuleDal.resolveReportsToOrgNodeId(reports_to_id);
        await teamModuleDal.updateOrgNode(orgNode.id, {
          reports_to_id: resolvedReportsTo,
        });
      }

      return await this.getById(id);
    },

    async getByImportId(importId: string): Promise<TeamMember | null> {
      const { data, error } = await profiles()
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("import_id", importId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }
      return this.getById(String(data.id));
    },

    async getByEmail(email: string): Promise<TeamMember | null> {
      const normalized = email.trim();
      if (!normalized) {
        return null;
      }
      const { data, error } = await profiles()
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .ilike("email", normalized)
        .limit(1);

      if (error || !data?.length) {
        return null;
      }
      return this.getById(String(data[0].id));
    },

    async delete(id: string): Promise<boolean> {
      const existing = await this.getById(id);
      if (!existing) {
        return false;
      }

      const { error } = await profiles()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (error) {
        throw new Error(`Failed to delete team member: ${error.message}`);
      }
      return true;
    },

    async listTimeTrackingCatalog(): Promise<
      { id: string; full_name: string; user_id: string | null }[]
    > {
      const { data, error } = await profiles()
        .select("id, full_name, user_id")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("full_name", { ascending: true })
        .limit(2000);
      if (error) {
        throw new Error(`Failed to list team member catalog: ${error.message}`);
      }
      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          full_name: String(r.full_name ?? ""),
          user_id: (r.user_id as string | null) ?? null,
        };
      });
    },

    async findActorForPrincipal(
      principalId: string
    ): Promise<{ id: string; full_name: string } | null> {
      const { data, error } = await profiles()
        .select("id, full_name")
        .eq("user_id", principalId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      const r = data as Record<string, unknown>;
      return {
        id: String(r.id),
        full_name: String(r.full_name ?? "Me"),
      };
    },
  };
}
