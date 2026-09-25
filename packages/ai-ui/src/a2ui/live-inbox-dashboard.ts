"use client";

import {
  aggregateInboxDashboard,
  buildEngentyA2uiMessages,
  composeInboxDashboard,
  DASHBOARD_BLOCKS,
  DASHBOARD_LAYOUTS,
  DASHBOARD_THREAD_LIMIT,
  type DashboardBlockId,
  type DashboardLayout,
  ENGENTY_A2UI_CATALOG_ID,
  type InboxDashboardThread,
} from "@engenty/a2ui-catalog/spec";
import type { A2uiLiveMeta } from "@engenty/ai-core/browser";
import { requestApiJson } from "@engenty/api-client";
import { subscribePostgresChanges } from "@engenty/live-cache";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useEffect, useRef } from "react";
import { useEngentyAIContext } from "../agent-provider/engenty-ai-provider.js";
import {
  LIVE_A2UI_SURFACE_TAB_KEY,
  openA2uiSurfacePaneTab,
  useArtifacts,
} from "../artifacts/artifact-store.js";

function isLayout(value: string): value is DashboardLayout {
  return (DASHBOARD_LAYOUTS as readonly string[]).includes(value);
}

function isBlock(value: string): value is DashboardBlockId {
  return (DASHBOARD_BLOCKS as readonly string[]).includes(value);
}

function asThread(value: unknown): InboxDashboardThread | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  return {
    last_message_at:
      typeof row.last_message_at === "string" ? row.last_message_at : null,
    latest_category:
      typeof row.latest_category === "string" ? row.latest_category : null,
    latest_from_email:
      typeof row.latest_from_email === "string" ? row.latest_from_email : null,
    latest_from_name:
      typeof row.latest_from_name === "string" ? row.latest_from_name : null,
    latest_status:
      typeof row.latest_status === "string" ? row.latest_status : null,
    subject: typeof row.subject === "string" ? row.subject : null,
    unhandled_count:
      typeof row.unhandled_count === "number" ? row.unhandled_count : 0,
  };
}

async function refreshInboxDashboard(params: {
  hostKey: string;
  live: A2uiLiveMeta;
  surfaceId: string;
  title: string;
  signal: AbortSignal;
}): Promise<void> {
  const listed = await requestApiJson<{ threads?: unknown[] }>(
    "/api/tools/inbox_threads_list/invoke",
    {
      body: {
        input: {
          limit: DASHBOARD_THREAD_LIMIT,
          ...(params.live.connection_id
            ? { connection_id: params.live.connection_id }
            : {}),
        },
      },
      method: "POST",
      signal: params.signal,
    }
  );
  const threads = (listed.threads ?? [])
    .map(asThread)
    .filter((row): row is InboxDashboardThread => row !== null);
  const layout = isLayout(params.live.layout)
    ? params.live.layout
    : "metrics-and-charts";
  const included = params.live.included.filter(isBlock);
  const surface = composeInboxDashboard({
    data: aggregateInboxDashboard(threads),
    included: included.length > 0 ? included : ["mail"],
    layout,
  });
  const { messages } = buildEngentyA2uiMessages({
    components: surface.components,
    data: surface.data,
    surfaceId: params.surfaceId,
  });
  openA2uiSurfacePaneTab(params.hostKey, {
    catalog_id: ENGENTY_A2UI_CATALOG_ID,
    live: params.live,
    messages,
    surface_id: params.surfaceId,
    title: params.title,
  });
}

/**
 * Keep the live A2UI surface tab in step with inbox rows. Layout stays the
 * one Jev picked; only the bound numbers and list refresh.
 */
export function useLiveInboxDashboard(hostKey: string): void {
  const { surfaceTabs } = useArtifacts(hostKey);
  const tab = surfaceTabs.find(
    (item) => item.key === LIVE_A2UI_SURFACE_TAB_KEY
  );
  const live = tab?.live?.kind === "inbox_dashboard" ? tab.live : null;
  const surfaceId = tab?.surfaceId ?? null;
  const title = tab?.title ?? "Inbox";
  const { threadsRealtimeClient } = useEngentyAIContext();
  const { currentTenant } = useWorkspaceContext();
  const tenantId = currentTenant?.id ?? null;
  const liveKey = live
    ? `${live.layout}:${live.included.join(",")}:${live.connection_id ?? ""}`
    : "";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!(live && surfaceId && tenantId && threadsRealtimeClient)) {
      return;
    }
    const controller = new AbortController();
    const run = () => {
      void refreshInboxDashboard({
        hostKey,
        live,
        signal: controller.signal,
        surfaceId,
        title,
      }).catch(() => {
        /* a missed refresh leaves the last snapshot in place */
      });
    };
    const unsubscribe = subscribePostgresChanges({
      channelName: `engenty-inbox-dashboard:${tenantId}`,
      changes: [
        {
          event: "*",
          filter: `tenant_id=eq.${tenantId}`,
          schema: "module_inbox",
          table: "threads",
        },
        {
          event: "*",
          filter: `tenant_id=eq.${tenantId}`,
          schema: "module_inbox",
          table: "messages",
        },
      ],
      client: threadsRealtimeClient,
      onSignal: () => {
        if (timer.current) {
          clearTimeout(timer.current);
        }
        timer.current = setTimeout(run, 400);
      },
    });
    return () => {
      controller.abort();
      if (timer.current) {
        clearTimeout(timer.current);
      }
      unsubscribe();
    };
  }, [
    hostKey,
    live,
    liveKey,
    surfaceId,
    tenantId,
    threadsRealtimeClient,
    title,
  ]);
}
