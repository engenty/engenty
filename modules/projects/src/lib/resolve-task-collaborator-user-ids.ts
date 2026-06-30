import type { SupabaseClient } from "@supabase/supabase-js";

const TEAM_SCHEMA = "module_team";
const CORE_SCHEMA = "core";

/** Task collaborators FK to `core.users`; inputs may be auth user ids or team-member profile ids. */
export async function resolveTaskCollaboratorUserIds(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  rawIds: readonly string[]
): Promise<string[]> {
  const unique = [...new Set(rawIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return [];
  }

  const { data: profiles, error: profileError } = await supabase
    .schema(TEAM_SCHEMA)
    .from("profiles")
    .select("id, user_id")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId);
  if (profileError) {
    throw new Error(
      `Failed to resolve task assignees: ${profileError.message}`
    );
  }

  const profileUserIdByProfileId = new Map<string, string | null>();
  const knownAuthUserIds = new Set<string>();
  for (const row of profiles ?? []) {
    const record = row as { id?: unknown; user_id?: unknown };
    const profileId =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : null;
    const userId =
      typeof record.user_id === "string" && record.user_id.trim()
        ? record.user_id.trim()
        : null;
    if (profileId) {
      profileUserIdByProfileId.set(profileId, userId);
    }
    if (userId) {
      knownAuthUserIds.add(userId);
    }
  }

  const candidateUserIds = new Set<string>();
  const unlinkedProfileIds: string[] = [];

  for (const id of unique) {
    if (profileUserIdByProfileId.has(id)) {
      const linkedUserId = profileUserIdByProfileId.get(id);
      if (linkedUserId) {
        candidateUserIds.add(linkedUserId);
      } else {
        unlinkedProfileIds.push(id);
      }
      continue;
    }
    if (knownAuthUserIds.has(id)) {
      candidateUserIds.add(id);
      continue;
    }
    candidateUserIds.add(id);
  }

  if (unlinkedProfileIds.length > 0) {
    throw new Error(
      "task_collaborator_requires_linked_user: assignees must be team members with a linked login account"
    );
  }

  const resolved = [...candidateUserIds];
  if (resolved.length === 0) {
    return [];
  }

  const { data: users, error: userError } = await supabase
    .schema(CORE_SCHEMA)
    .from("users")
    .select("id")
    .in("id", resolved);
  if (userError) {
    throw new Error(`Failed to validate task assignees: ${userError.message}`);
  }

  const validUserIds = new Set(
    (users ?? [])
      .map((row) => (row as { id?: unknown }).id)
      .filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
  );
  const invalid = resolved.filter((id) => !validUserIds.has(id));
  if (invalid.length > 0) {
    throw new Error(
      "task_collaborator_invalid_user: one or more assignees are not valid login users"
    );
  }

  return resolved;
}
