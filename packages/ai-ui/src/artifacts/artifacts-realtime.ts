import {
  type PostgresChangeRealtimeClient,
  subscribePostgresChanges,
} from "@engenty/live-cache";

export interface ArtifactsRealtimeSubscription {
  unsubscribe: () => void;
}

/**
 * Subscribe to ai.artifact changes for a tenant and invalidate the pane's
 * queries. A version insert bumps artifact.updated_at, so publishing only
 * ai.artifact is enough to refresh both list and (via refetch) content.
 */
export function createArtifactsRealtimeSubscription(params: {
  client: PostgresChangeRealtimeClient | null;
  /** Receives the changed artifact row (replica identity full) when available. */
  onArtifactsChange: (record: Record<string, unknown> | null) => void;
  tenantId: string;
}): ArtifactsRealtimeSubscription | null {
  if (!(params.client && params.tenantId)) {
    return null;
  }
  const unsubscribe = subscribePostgresChanges({
    channelName: `engenty-artifacts:${params.tenantId}`,
    client: params.client,
    changes: [
      {
        event: "*",
        filter: `tenant_id=eq.${params.tenantId}`,
        schema: "ai",
        table: "artifact",
      },
    ],
    onSignal: (signal) => {
      params.onArtifactsChange(signal.record ?? null);
    },
  });
  return { unsubscribe };
}
