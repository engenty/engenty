import type { ConnectionsModuleClient } from "@engenty/connections-sdk";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import type { z } from "@hono/zod-openapi";
import { createCalendarSyncRepo } from "../../dal/calendar-sync.js";
import {
  calendarEventsListInputSchema,
  calendarEventsListResponseSchema,
  calendarSourcesResponseSchema,
  calendarSyncRunResponseSchema,
  calendarSyncSettingsSchema,
  calendarSyncSettingsSetInputSchema,
  timeTrackingContextGetInputSchema,
} from "../../schema/zod.js";
import {
  pullConnection,
  syncConnection,
} from "../../sync/calendar-sync-service.js";

/**
 * Connector ids whose events can be overlaid on the time-tracking calendar.
 * Both Google Calendar and Outlook expose `list_calendars` + a `calendar_id`
 * param on their event actions, so both can join the overlay. (Push-sync and
 * pull-back remain Google-only for now — see the reconcile op.)
 */
const OVERLAY_CONNECTOR_IDS = new Set(["google-calendar", "microsoft-outlook"]);

const MAX_OVERLAY_EVENTS_PER_CALENDAR = 250;
// Microsoft Graph caps calendarView page size well below Google's.
const MAX_OUTLOOK_EVENTS_PER_CALENDAR = 25;

interface CalendarGatewayDeps {
  connectionsClient: ConnectionsModuleClient | null;
  supabase: unknown;
}

/** The acting user for connection policy (owner-visibility + sharing clamp). */
function actingUserId(auth: PluginAuthContext | undefined): string | null {
  if (!auth) {
    return null;
  }
  return (
    (auth as PluginAuthContext & { userId?: string }).userId ??
    auth.principalId ??
    null
  );
}

interface GcalListCalendarsResult {
  calendars?: {
    id: string;
    primary?: boolean;
    summary?: string | null;
    time_zone?: string | null;
  }[];
}

interface GcalListEventsResult {
  events?: {
    all_day?: boolean;
    end?: string | null;
    event_id: string;
    html_link?: string | null;
    location?: string | null;
    start?: string | null;
    status?: string | null;
    summary?: string | null;
  }[];
}

interface OutlookListEventsResult {
  events?: {
    end?: { dateTime?: string | null } | null;
    id?: string;
    isAllDay?: boolean;
    location?: string | null;
    start?: { dateTime?: string | null } | null;
    subject?: string | null;
    webLink?: string | null;
  }[];
}

type OverlayEvent = z.infer<
  typeof calendarEventsListResponseSchema
>["events"][number];

export function registerTimeTrackingCalendarGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation">,
  deps: CalendarGatewayDeps
) {
  const { connectionsClient, supabase } = deps;
  const readOp = {
    moduleId: "time-tracking",
    requiredCapabilities: ["module.time-tracking.read"],
    riskLevel: "low" as const,
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
  };
  const writeOp = {
    moduleId: "time-tracking",
    requiredCapabilities: ["module.time-tracking.write"],
    riskLevel: "medium" as const,
    idempotent: false,
    dryRunSupported: false,
    requiresApproval: false,
  };

  // List the calendar connections the current user may overlay, each with its
  // selectable calendars. Powers the overlay settings picker.
  server.registerOperation({
    operationId: "time_tracking_calendar_sources_list",
    summary: "List overlay-capable calendar connections and their calendars",
    ...readOp,
    inputSchema: timeTrackingContextGetInputSchema,
    outputSchema: calendarSourcesResponseSchema,
    handler: async (_input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      const userId = actingUserId(ctx.auth);
      if (!(connectionsClient && tenantId && userId)) {
        return { sources: [] };
      }

      let connections: Awaited<
        ReturnType<ConnectionsModuleClient["listConnections"]>
      >;
      try {
        connections = await connectionsClient.listConnections({ tenantId });
      } catch {
        // Connections module not installed / tables absent — overlay is opt-in.
        return { sources: [] };
      }

      const usable = connections.filter(
        (c) =>
          OVERLAY_CONNECTOR_IDS.has(c.connector_id) &&
          (c.sharing === "org" || c.owner_user_id === userId)
      );

      const sources: z.infer<typeof calendarSourcesResponseSchema>["sources"] =
        [];
      for (const conn of usable) {
        const label =
          conn.display_name ?? conn.external_account ?? conn.connector_id;
        let calendars: {
          id: string;
          summary: string | null;
          primary: boolean;
          time_zone: string | null;
        }[] = [];
        try {
          const res = (await connectionsClient.callAction({
            connectionId: conn.id,
            actionId: "list_calendars",
            input: {},
            isAutonomous: false,
            principal: { principalId: userId, principalType: "user" },
            tenantId,
          })) as GcalListCalendarsResult;
          calendars = (res.calendars ?? []).map((cal) => ({
            id: cal.id,
            summary: cal.summary ?? null,
            primary: Boolean(cal.primary),
            time_zone: cal.time_zone ?? null,
          }));
        } catch {
          // A single unreachable/denied account must not sink the whole list.
          calendars = [];
        }
        sources.push({
          connection_id: conn.id,
          connector_id: conn.connector_id,
          label,
          sharing: conn.sharing === "org" ? "org" : "personal",
          calendars,
        });
      }
      return { sources };
    },
  });

  // Fetch events for the chosen overlay calendars in a time window. The
  // connection policy layer (sharing clamp) rejects any calendar the user
  // cannot access, so an untrusted `calendars` input is safe.
  server.registerOperation({
    operationId: "time_tracking_calendar_events_list",
    summary: "List overlay calendar events for a time window",
    ...readOp,
    inputSchema: calendarEventsListInputSchema,
    outputSchema: calendarEventsListResponseSchema,
    handler: async (input, ctx) => {
      const body = input as z.infer<typeof calendarEventsListInputSchema>;
      const tenantId = ctx.auth?.tenantId;
      const userId = actingUserId(ctx.auth);
      if (!(connectionsClient && tenantId && userId && body.calendars.length)) {
        return { events: [], errors: [] };
      }

      const principal = {
        principalId: userId,
        principalType: "user" as const,
      };
      const events: OverlayEvent[] = [];
      const errors: z.infer<typeof calendarEventsListResponseSchema>["errors"] =
        [];

      // Resolve each connection's provider so we can shape the request and
      // normalize the response per connector (Google vs Outlook differ).
      const connectorById = new Map<string, string>();
      try {
        for (const conn of await connectionsClient.listConnections({
          tenantId,
        })) {
          connectorById.set(conn.id, conn.connector_id);
        }
      } catch {
        // No connections module — nothing to overlay.
        return { events: [], errors: [] };
      }

      for (const target of body.calendars) {
        const calendarId = target.calendar_id ?? "primary";
        const connectorId = connectorById.get(target.connection_id);
        const push = (e: {
          event_id: string;
          summary: string | null;
          start: string | null;
          end: string | null;
          all_day: boolean;
          location: string | null;
          html_link: string | null;
        }) =>
          events.push({
            ...e,
            connection_id: target.connection_id,
            calendar_id: calendarId,
            calendar_key: `${target.connection_id}:${calendarId}`,
          });
        try {
          if (connectorId === "microsoft-outlook") {
            const res = (await connectionsClient.callAction({
              connectionId: target.connection_id,
              actionId: "list_events",
              input: {
                calendar_id: calendarId,
                start: body.time_min,
                end: body.time_max,
                top: MAX_OUTLOOK_EVENTS_PER_CALENDAR,
              },
              isAutonomous: false,
              principal,
              tenantId,
            })) as OutlookListEventsResult;
            for (const e of res.events ?? []) {
              if (!e.id) {
                continue;
              }
              push({
                event_id: e.id,
                summary: e.subject ?? null,
                start: e.start?.dateTime ?? null,
                end: e.end?.dateTime ?? null,
                all_day: Boolean(e.isAllDay),
                location: e.location ?? null,
                html_link: e.webLink ?? null,
              });
            }
          } else {
            const res = (await connectionsClient.callAction({
              connectionId: target.connection_id,
              actionId: "list_events",
              input: {
                calendar_id: calendarId,
                time_min: body.time_min,
                time_max: body.time_max,
                max_results: MAX_OVERLAY_EVENTS_PER_CALENDAR,
              },
              isAutonomous: false,
              principal,
              tenantId,
            })) as GcalListEventsResult;
            for (const e of res.events ?? []) {
              if (e.status === "cancelled") {
                continue;
              }
              push({
                event_id: e.event_id,
                summary: e.summary ?? null,
                start: e.start ?? null,
                end: e.end ?? null,
                all_day: Boolean(e.all_day),
                location: e.location ?? null,
                html_link: e.html_link ?? null,
              });
            }
          }
        } catch (error) {
          errors.push({
            connection_id: target.connection_id,
            calendar_id: target.calendar_id ?? null,
            message: error instanceof Error ? error.message : "unknown_error",
          });
        }
      }
      return { events, errors };
    },
  });

  // Current user's push-sync settings (which calendar entries are written to).
  server.registerOperation({
    operationId: "time_tracking_calendar_sync_settings_get",
    summary: "Get the current user's calendar push-sync settings",
    ...readOp,
    inputSchema: timeTrackingContextGetInputSchema,
    outputSchema: calendarSyncSettingsSchema,
    handler: async (_input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      const userId = actingUserId(ctx.auth);
      const empty = {
        sync_enabled: false,
        connection_id: null,
        target_calendar_id: null,
        time_zone: null,
        backfill_from: null,
      };
      if (!(supabase && tenantId && userId)) {
        return empty;
      }
      const repo = createCalendarSyncRepo(supabase, tenantId);
      const st = await repo.getOwnerSyncState(userId);
      if (!st) {
        return empty;
      }
      return {
        sync_enabled: st.sync_enabled,
        connection_id: st.connection_id,
        target_calendar_id: st.target_calendar_id,
        time_zone: st.time_zone,
        backfill_from: st.backfill_from,
      };
    },
  });

  server.registerOperation({
    operationId: "time_tracking_calendar_sync_settings_set",
    summary: "Enable/disable calendar push sync and pick the target calendar",
    ...writeOp,
    inputSchema: calendarSyncSettingsSetInputSchema,
    outputSchema: calendarSyncSettingsSchema,
    handler: async (input, ctx) => {
      const body = input as z.infer<typeof calendarSyncSettingsSetInputSchema>;
      const tenantId = ctx.auth?.tenantId;
      const userId = actingUserId(ctx.auth);
      const scopeId = ctx.auth?.scopeId ?? "default";
      if (!(connectionsClient && supabase && tenantId && userId)) {
        throw new Error("calendar_sync_unavailable");
      }
      // Push-sync is Google-only for now (Outlook can overlay but not yet
      // receive entries). Reject a non-Google target so users don't silently
      // pick one that would never sync.
      if (body.sync_enabled) {
        try {
          const conns = await connectionsClient.listConnections({ tenantId });
          const target = conns.find((c) => c.id === body.connection_id);
          if (target && target.connector_id !== "google-calendar") {
            throw new Error("calendar_sync_provider_unsupported");
          }
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "calendar_sync_provider_unsupported"
          ) {
            throw error;
          }
          // Connections lookup failed — fall through and let the write proceed.
        }
      }
      const repo = createCalendarSyncRepo(supabase, tenantId);
      // "future" scope stamps today's boundary; "all" (default) clears it.
      const backfillFrom =
        body.backfill_mode === "future"
          ? new Date().toISOString().slice(0, 10)
          : null;
      await repo.upsertSyncState({
        connection_id: body.connection_id,
        scope_id: scopeId,
        owner_user_id: userId,
        sync_enabled: body.sync_enabled,
        target_calendar_id: body.target_calendar_id,
        time_zone: body.time_zone ?? null,
        backfill_from: backfillFrom,
      });
      // Enable ⇒ backfill the user's scheduled entries now, as the live user
      // (write policy proceeds without the autonomous-mode requirement).
      // Fire-and-forget so the save returns immediately.
      if (body.sync_enabled) {
        const state = await repo.getSyncState(body.connection_id);
        if (state) {
          void syncConnection(
            { connectionsClient, supabase },
            {
              principal: { principalId: userId, principalType: "user" },
              isAutonomous: false,
            },
            { tenantId, state }
          ).catch(() => undefined);
        }
      }
      return {
        sync_enabled: body.sync_enabled,
        connection_id: body.connection_id,
        target_calendar_id: body.target_calendar_id,
        time_zone: body.time_zone ?? null,
        backfill_from: backfillFrom,
      };
    },
  });

  // Reconcile pass — invoked by the apps/ai system job as the service
  // principal (autonomous; needs the connection's autonomous_mode: full).
  server.registerOperation({
    operationId: "time_tracking_calendar_sync_run",
    summary: "Reconcile enabled calendar-sync connections (backfill/repair)",
    ...writeOp,
    inputSchema: timeTrackingContextGetInputSchema,
    outputSchema: calendarSyncRunResponseSchema,
    handler: async (_input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      if (!(connectionsClient && supabase && tenantId)) {
        return {
          connections: 0,
          pushed: 0,
          deleted: 0,
          pulled: 0,
          unlinked: 0,
          errors: 0,
        };
      }
      const repo = createCalendarSyncRepo(supabase, tenantId);
      const states = await repo.listEnabledSyncStates();

      // Pull-back is Google-only in v1 (Outlook lacks a delta feed); resolve
      // which enabled connections are google-calendar so we only pull those.
      let pullableConnectionIds = new Set<string>();
      try {
        const connections = await connectionsClient.listConnections({
          tenantId,
        });
        pullableConnectionIds = new Set(
          connections
            .filter((c) => c.connector_id === "google-calendar")
            .map((c) => c.id)
        );
      } catch {
        // Connections module absent — skip pull-back, push still runs.
      }

      let pushed = 0;
      let deleted = 0;
      let pulled = 0;
      let unlinked = 0;
      let errors = 0;
      for (const state of states) {
        const actor = {
          principal: {
            principalId: state.owner_user_id,
            principalType: "service" as const,
          },
          isAutonomous: true,
        };
        // Pull first so remote changes land before the push re-asserts local
        // state; our own echoes are skipped by the sync-hash.
        if (pullableConnectionIds.has(state.connection_id)) {
          try {
            const pull = await pullConnection(
              { connectionsClient, supabase },
              actor,
              { tenantId, state }
            );
            pulled += pull.pulled;
            unlinked += pull.unlinked;
            errors += pull.errors;
          } catch {
            errors += 1;
          }
        }
        try {
          const summary = await syncConnection(
            { connectionsClient, supabase },
            actor,
            { tenantId, state }
          );
          pushed += summary.pushed;
          deleted += summary.deleted;
          errors += summary.errors;
        } catch (error) {
          errors += 1;
          await repo.recordSyncResult(state.connection_id, {
            last_error:
              error instanceof Error ? error.message : "sync_run_failed",
          });
        }
      }
      return {
        connections: states.length,
        pushed,
        deleted,
        pulled,
        unlinked,
        errors,
      };
    },
  });
}
