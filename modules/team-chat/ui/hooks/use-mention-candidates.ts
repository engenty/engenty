import { useMemo } from "react";
import type { MentionCandidate } from "../components/composer.js";
import { useTenantUsersQuery } from "../queries.js";

/** Service principals aren't mentionable people. */
export function isServiceIdentity(email: string | null | undefined): boolean {
  return (email ?? "").endsWith("@engenty.local");
}

/**
 * Composer @-mention candidates: tenant users + here/channel broadcasts.
 * Agent candidates join in Phase 3 (mention → agent run).
 */
export function useMentionCandidates(): MentionCandidate[] {
  const usersQuery = useTenantUsersQuery();
  return useMemo(() => {
    const users = (usersQuery.data ?? []).filter(
      (user) => !isServiceIdentity(user.email)
    );
    return [
      ...users.map<MentionCandidate>((user) => ({
        id: user.id,
        insert: `<@u:${user.id}>`,
        kind: "user",
        label: user.display_name || user.email || user.id,
        ...(user.email ? { sublabel: user.email } : {}),
      })),
      { id: "here", insert: "<!here>", kind: "broadcast", label: "@here" },
      {
        id: "channel",
        insert: "<!channel>",
        kind: "broadcast",
        label: "@channel",
      },
    ];
  }, [usersQuery.data]);
}
