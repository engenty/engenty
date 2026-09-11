// Live refresh: core.notifications is in the realtime publication and its
// select policy scopes what this user may receive, so any change to a row
// they can see invalidates the queries instead of waiting for the 30s poll.
import { getOptionalSupabaseAuthClient } from "@engenty/auth-ui";
import { useQueryClient } from "@engenty/query-client";
import { useEffect } from "react";
import { notificationKeys } from "./queries.js";

export function useNotificationsRealtime(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!tenantId) {
      return;
    }
    const client = getOptionalSupabaseAuthClient();
    if (!client) {
      return;
    }
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
    return () => {
      void client.removeChannel(channel);
    };
  }, [queryClient, tenantId]);
}
