import { useEffect, useState } from "react";
import type { UserRecord } from "../lib/schemas.js";
import { getUserManagementListEnrichers } from "../list-hooks.js";

export type UserListEnrichmentState = Record<string, Record<string, unknown>>;

export function useUserListEnrichments(users: UserRecord[]) {
  const [enrichments, setEnrichments] = useState<UserListEnrichmentState>({});

  useEffect(() => {
    const enrichers = getUserManagementListEnrichers();
    if (users.length === 0 || enrichers.length === 0) {
      setEnrichments({});
      return;
    }

    let cancelled = false;

    void Promise.all(
      enrichers.map(async (enricher) => {
        try {
          const data = await enricher.enrich(users);
          return { id: enricher.id, data };
        } catch {
          return { id: enricher.id, data: {} };
        }
      })
    ).then((results) => {
      if (cancelled) {
        return;
      }

      const next: UserListEnrichmentState = {};
      for (const user of users) {
        next[user.id] = {};
      }

      for (const result of results) {
        for (const [userId, value] of Object.entries(result.data)) {
          next[userId] = {
            ...(next[userId] ?? {}),
            [result.id]: value,
          };
        }
      }

      setEnrichments(next);
    });

    return () => {
      cancelled = true;
    };
  }, [users]);

  return enrichments;
}
