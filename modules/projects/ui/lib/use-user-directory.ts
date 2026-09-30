/**
 * Everyone in the tenant who can sign in, by auth user id — what a task's
 * person assignee points at. Same query key as the tasks module's new-task
 * dialog, so both read one cached request.
 */
import { requestApiEnvelope } from "@engenty/api-client";
import { useQuery } from "@engenty/query-client";
import { useMemo } from "react";

interface DirectoryUser {
  displayName: string | null;
  email: string;
  id: string;
}

export function useUserDirectoryNames(): Map<string, string> {
  const query = useQuery({
    queryKey: ["users", "directory"],
    queryFn: async ({ signal }) => {
      const res = await requestApiEnvelope<DirectoryUser[]>(
        "/api/users/directory",
        { method: "GET", signal }
      );
      return res.data ?? [];
    },
    staleTime: 60_000,
  });
  return useMemo(
    () =>
      new Map(
        (query.data ?? []).map((user) => [
          user.id,
          user.displayName?.trim() || user.email,
        ])
      ),
    [query.data]
  );
}
