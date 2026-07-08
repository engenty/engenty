import type { ConnectionsModuleClient } from "@engenty/connections-sdk";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import type { z } from "@hono/zod-openapi";
import {
  calendarEventsListInputSchema,
  calendarEventsListResponseSchema,
  calendarSourcesResponseSchema,
  timeTrackingContextGetInputSchema,
} from "../../schema/zod.js";

/**
 * Connector ids whose events can be overlaid on the time-tracking calendar.
 * Google-first for now: Outlook needs a `list_calendars` action and a
 * `calendar_id` param on its event actions before it can join (see
 * docs/wip/time-tracking-calendar-sync.md, Phase 1 touch-ups).
 */
const OVERLAY_CONNECTOR_IDS = new Set(["google-calendar"]);

const MAX_OVERLAY_EVENTS_PER_CALENDAR = 250;

interface CalendarGatewayDeps {
  connectionsClient: ConnectionsModuleClient | null;
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

type OverlayEvent = z.infer<
  typeof calendarEventsListResponseSchema
>["events"][number];

export function registerTimeTrackingCalendarGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation">,
  deps: CalendarGatewayDeps
) {
  const { connectionsClient } = deps;
  const readOp = {
    moduleId: "time-tracking",
    requiredCapabilities: ["module.time-tracking.read"],
    riskLevel: "low" as const,
    idempotent: true,
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

      for (const target of body.calendars) {
        const calendarId = target.calendar_id ?? "primary";
        try {
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
            events.push({
              event_id: e.event_id,
              connection_id: target.connection_id,
              calendar_id: calendarId,
              calendar_key: `${target.connection_id}:${calendarId}`,
              summary: e.summary ?? null,
              start: e.start ?? null,
              end: e.end ?? null,
              all_day: Boolean(e.all_day),
              location: e.location ?? null,
              html_link: e.html_link ?? null,
            });
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
}
