// Live refresh: core.notifications is in the realtime publication and its
// select policy scopes what this user may receive, so any change to a row
// they can see invalidates the queries instead of waiting for the 30s poll.
//
// One channel per tenant, shared. The bell renders twice on a phone — the
// rail's and the nav sheet's — and supabase-js hands the SAME channel back
// for the same topic, on which a second `.on("postgres_changes")` after
// `subscribe()` throws and takes the page down. So the first mount opens the
// channel, later mounts only count themselves in, and the last one out
// removes it.
import { getOptionalSupabaseAuthClient } from "@engenty/auth-ui";
import type { QueryClient } from "@engenty/query-client";
import { useQueryClient } from "@engenty/query-client";
import { useEffect } from "react";
import { notificationKeys } from "./queries.js";

interface SharedChannel {
  channel: ReturnType<
    NonNullable<ReturnType<typeof getOptionalSupabaseAuthClient>>["channel"]
  >;
  refs: number;
}

const shared = new Map<string, SharedChannel>();

function acquire(
  tenantId: string,
  queryClient: QueryClient
): (() => void) | null {
  const client = getOptionalSupabaseAuthClient();
  if (!client) {
    return null;
  }
  let entry = shared.get(tenantId);
  if (!entry) {
    const channel = client
      .channel(`notifications:${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `tenant_id=eq.${tenantId}`,
          schema: "core",
          table: "notifications",
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: notificationKeys.all,
          });
        }
      )
      .subscribe((status, error) => {
        // supabase-js reports SUBSCRIBED on join; a failed postgres_changes
        // registration only shows up here.
        if (status === "CHANNEL_ERROR" || error) {
          console.warn("[notifications] realtime subscription failed", error);
        }
      });
    entry = { channel, refs: 0 };
    shared.set(tenantId, entry);
  }
  entry.refs += 1;
  const held = entry;
  return () => {
    held.refs -= 1;
    if (held.refs > 0 || shared.get(tenantId) !== held) {
      return;
    }
    shared.delete(tenantId);
    void client.removeChannel(held.channel);
  };
}

export function useNotificationsRealtime(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!tenantId) {
      return;
    }
    return acquire(tenantId, queryClient) ?? undefined;
  }, [queryClient, tenantId]);
}
