import {
  type ConnectorDefinition,
  defineConnector,
} from "@engenty/connections-sdk";
import { z } from "zod";
import {
  connectorAction,
  GOOGLE_OAUTH2,
  googleFetch,
  googleJson,
} from "../shared.js";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

const SCOPE_READONLY = "https://www.googleapis.com/auth/calendar.readonly";
const SCOPE_EVENTS = "https://www.googleapis.com/auth/calendar.events";

const ALL_DAY_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface CalendarEvent {
  attendees?: {
    displayName?: string;
    email?: string;
    optional?: boolean;
    responseStatus?: string;
  }[];
  description?: string;
  end?: { date?: string; dateTime?: string; timeZone?: string };
  etag?: string;
  extendedProperties?: { private?: Record<string, string> };
  htmlLink?: string;
  id: string;
  location?: string;
  organizer?: { displayName?: string; email?: string };
  start?: { date?: string; dateTime?: string; timeZone?: string };
  status?: string;
  summary?: string;
  updated?: string;
}

function eventTime(
  t: { date?: string; dateTime?: string } | undefined
): string | null {
  return t?.dateTime ?? t?.date ?? null;
}

function toEventSummary(e: CalendarEvent) {
  return {
    all_day: Boolean(e.start?.date),
    end: eventTime(e.end),
    etag: e.etag ?? null,
    event_id: e.id,
    html_link: e.htmlLink ?? null,
    location: e.location ?? null,
    private_properties: e.extendedProperties?.private ?? null,
    start: eventTime(e.start),
    status: e.status ?? null,
    summary: e.summary ?? null,
    // RFC3339 last-modified stamp; drives the pull-back conflict rule.
    updated: e.updated ?? null,
  };
}

/** Bounds the incremental-sync page walk so a huge changelog can't hang. */
const MAX_SYNC_PAGES = 20;

const privatePropertiesField = z
  .record(z.string(), z.string())
  .optional()
  .describe(
    "Private key/value metadata stored on the event (extendedProperties.private), not visible to attendees. Used to tag events created by an integration."
  );

/**
 * "2026-07-04" → { date } (all-day); a timestamp → { dateTime }. When
 * `timeZone` is given, a zone-less local timestamp is resolved by Google in
 * that IANA zone (DST-safe) instead of requiring an explicit offset.
 */
function toEventDateTime(
  value: string,
  timeZone?: string
): { date: string } | { dateTime: string; timeZone?: string } {
  if (ALL_DAY_DATE.test(value)) {
    return { date: value };
  }
  return timeZone ? { dateTime: value, timeZone } : { dateTime: value };
}

const timeZoneField = z
  .string()
  .optional()
  .describe(
    'IANA time zone (e.g. "Europe/Vienna") for timed start/end given without an offset. Optional when start/end already carry an offset.'
  );

const calendarIdField = z
  .string()
  .optional()
  .describe('Calendar id (default "primary", the user\'s main calendar).');

const startField = z
  .string()
  .describe(
    'Event start: ISO 8601 timestamp with offset (e.g. "2026-07-04T10:00:00+02:00") or a plain date "YYYY-MM-DD" for an all-day event.'
  );
const endField = z
  .string()
  .describe(
    'Event end: ISO 8601 timestamp, or a plain date "YYYY-MM-DD" (exclusive) for an all-day event.'
  );
const attendeesField = z
  .array(z.string().describe("Attendee email address."))
  .optional()
  .describe("Optional list of attendee email addresses.");

export const calendarConnector: ConnectorDefinition = defineConnector({
  actions: [
    connectorAction({
      description:
        "List the calendars the connected account can see, with id, name, primary flag and access role.",
      group: "read",
      handler: async (_input, ctx) => {
        const data = await googleJson<{
          items?: {
            accessRole?: string;
            description?: string;
            id: string;
            primary?: boolean;
            summary?: string;
            timeZone?: string;
          }[];
        }>(ctx, `${CALENDAR_API}/users/me/calendarList?maxResults=100`);
        return {
          calendars: (data.items ?? []).map((c) => ({
            access_role: c.accessRole ?? null,
            description: c.description ?? null,
            id: c.id,
            primary: Boolean(c.primary),
            summary: c.summary ?? null,
            time_zone: c.timeZone ?? null,
          })),
        };
      },
      id: "list_calendars",
      inputSchema: z.object({}),
      providerScopes: [SCOPE_READONLY],
      summary: "List Google calendars",
    }),
    connectorAction({
      description:
        "List events from a calendar in a time window, ordered by start time (recurring events expanded to single instances). For incremental two-way sync, pass a prior `sync_token` to fetch only changes since then, or set `return_sync_token` to receive a `next_sync_token` for the next incremental pull.",
      group: "read",
      handler: async (input, ctx) => {
        const calendarId = input.calendar_id ?? "primary";
        const eventsUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(
          calendarId
        )}/events`;
        // Sync mode: a token was supplied, or the caller wants one back. Both
        // require draining every page so the terminal nextSyncToken is captured
        // (Google only returns it on the last page of a completed sync).
        const syncMode =
          input.sync_token !== undefined || input.return_sync_token === true;

        if (!syncMode) {
          const url = new URL(eventsUrl);
          url.searchParams.set("singleEvents", "true");
          url.searchParams.set("orderBy", "startTime");
          url.searchParams.set("maxResults", String(input.max_results ?? 10));
          if (input.time_min) {
            url.searchParams.set("timeMin", input.time_min);
          }
          if (input.time_max) {
            url.searchParams.set("timeMax", input.time_max);
          }
          const data = await googleJson<{ items?: CalendarEvent[] }>(
            ctx,
            url.toString()
          );
          return {
            calendar_id: calendarId,
            next_sync_token: null,
            sync_token_expired: false,
            events: (data.items ?? []).map((e) => ({
              ...toEventSummary(e),
              attendee_count: e.attendees?.length ?? 0,
            })),
          };
        }

        const items: CalendarEvent[] = [];
        let pageToken: string | undefined;
        let nextSyncToken: string | null = null;
        for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
          const url = new URL(eventsUrl);
          // singleEvents must stay constant across a sync series; syncToken is
          // incompatible with orderBy/timeMin/timeMax (they only seed the
          // initial full sync when no token is present).
          url.searchParams.set("singleEvents", "true");
          url.searchParams.set("maxResults", String(input.max_results ?? 250));
          if (input.sync_token) {
            url.searchParams.set("syncToken", input.sync_token);
          } else {
            url.searchParams.set("orderBy", "startTime");
            if (input.time_min) {
              url.searchParams.set("timeMin", input.time_min);
            }
            if (input.time_max) {
              url.searchParams.set("timeMax", input.time_max);
            }
          }
          if (pageToken) {
            url.searchParams.set("pageToken", pageToken);
          }
          const res = await ctx.fetchImpl(url.toString(), {
            headers: { Authorization: `Bearer ${ctx.accessToken}` },
          });
          // 410 GONE ⇒ the sync token expired; the caller must re-list in full.
          if (res.status === 410) {
            return {
              calendar_id: calendarId,
              next_sync_token: null,
              sync_token_expired: true,
              events: [],
            };
          }
          if (!res.ok) {
            const body = (await res.text().catch(() => "")).slice(0, 200);
            throw new Error(`google_api_error (${res.status}): ${body}`);
          }
          const data = (await res.json()) as {
            items?: CalendarEvent[];
            nextPageToken?: string;
            nextSyncToken?: string;
          };
          items.push(...(data.items ?? []));
          if (data.nextSyncToken) {
            nextSyncToken = data.nextSyncToken;
          }
          if (!data.nextPageToken) {
            break;
          }
          pageToken = data.nextPageToken;
        }
        return {
          calendar_id: calendarId,
          next_sync_token: nextSyncToken,
          sync_token_expired: false,
          events: items.map((e) => ({
            ...toEventSummary(e),
            attendee_count: e.attendees?.length ?? 0,
          })),
        };
      },
      id: "list_events",
      inputSchema: z.object({
        calendar_id: calendarIdField,
        max_results: z
          .number()
          .int()
          .min(1)
          .max(250)
          .optional()
          .describe("Maximum number of events to return (1-250, default 10)."),
        return_sync_token: z
          .boolean()
          .optional()
          .describe(
            "Drain all pages and return a `next_sync_token` to seed the next incremental pull (used for two-way sync)."
          ),
        sync_token: z
          .string()
          .optional()
          .describe(
            "Incremental sync token from a prior `next_sync_token`. Returns only events changed since then (incompatible with time_min/time_max/order). If expired, the response sets `sync_token_expired`."
          ),
        time_max: z
          .string()
          .optional()
          .describe(
            'Only events starting before this ISO 8601 timestamp (e.g. "2026-07-11T00:00:00Z").'
          ),
        time_min: z
          .string()
          .optional()
          .describe(
            'Only events ending after this ISO 8601 timestamp (e.g. "2026-07-04T00:00:00Z").'
          ),
      }),
      providerScopes: [SCOPE_READONLY],
      summary: "List calendar events",
    }),
    connectorAction({
      description:
        "Fetch one calendar event by id with full details: description, organizer, attendees and their response status.",
      group: "read",
      handler: async (input, ctx) => {
        const calendarId = input.calendar_id ?? "primary";
        const e = await googleJson<CalendarEvent>(
          ctx,
          `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.event_id)}`
        );
        return {
          ...toEventSummary(e),
          attendees: (e.attendees ?? []).map((a) => ({
            display_name: a.displayName ?? null,
            email: a.email ?? null,
            optional: Boolean(a.optional),
            response_status: a.responseStatus ?? null,
          })),
          calendar_id: calendarId,
          description: e.description ?? null,
          organizer: e.organizer?.email ?? null,
        };
      },
      id: "get_event",
      inputSchema: z.object({
        calendar_id: calendarIdField,
        event_id: z.string().describe("Calendar event id."),
      }),
      providerScopes: [SCOPE_READONLY],
      summary: "Get a calendar event",
    }),
    connectorAction({
      description:
        "Create a calendar event (timed or all-day), optionally inviting attendees by email.",
      group: "write",
      handler: async (input, ctx) => {
        const calendarId = input.calendar_id ?? "primary";
        const created = await googleJson<CalendarEvent>(
          ctx,
          `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            body: JSON.stringify({
              end: toEventDateTime(input.end, input.time_zone),
              start: toEventDateTime(input.start, input.time_zone),
              summary: input.summary,
              ...(input.description ? { description: input.description } : {}),
              ...(input.attendees?.length
                ? { attendees: input.attendees.map((email) => ({ email })) }
                : {}),
              ...(input.private_properties
                ? { extendedProperties: { private: input.private_properties } }
                : {}),
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
        return { ...toEventSummary(created), calendar_id: calendarId };
      },
      id: "create_event",
      inputSchema: z.object({
        attendees: attendeesField,
        calendar_id: calendarIdField,
        description: z
          .string()
          .optional()
          .describe("Optional event description/notes."),
        end: endField,
        private_properties: privatePropertiesField,
        start: startField,
        summary: z.string().describe("Event title."),
        time_zone: timeZoneField,
      }),
      providerScopes: [SCOPE_EVENTS],
      summary: "Create a calendar event",
    }),
    connectorAction({
      description:
        "Update fields of an existing calendar event (patch semantics: only the provided fields change).",
      group: "write",
      handler: async (input, ctx) => {
        const calendarId = input.calendar_id ?? "primary";
        const patch: Record<string, unknown> = {};
        if (input.summary !== undefined) {
          patch.summary = input.summary;
        }
        if (input.description !== undefined) {
          patch.description = input.description;
        }
        if (input.start !== undefined) {
          patch.start = toEventDateTime(input.start, input.time_zone);
        }
        if (input.end !== undefined) {
          patch.end = toEventDateTime(input.end, input.time_zone);
        }
        if (input.attendees !== undefined) {
          patch.attendees = input.attendees.map((email) => ({ email }));
        }
        if (input.private_properties !== undefined) {
          patch.extendedProperties = { private: input.private_properties };
        }
        const updated = await googleJson<CalendarEvent>(
          ctx,
          `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.event_id)}`,
          {
            body: JSON.stringify(patch),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          }
        );
        return { ...toEventSummary(updated), calendar_id: calendarId };
      },
      id: "update_event",
      inputSchema: z
        .object({
          attendees: attendeesField,
          calendar_id: calendarIdField,
          description: z
            .string()
            .optional()
            .describe("New event description (replaces the existing one)."),
          end: endField.optional(),
          event_id: z.string().describe("Calendar event id to update."),
          private_properties: privatePropertiesField,
          start: startField.optional(),
          summary: z.string().optional().describe("New event title."),
          time_zone: timeZoneField,
        })
        .refine(
          (v) =>
            v.attendees !== undefined ||
            v.description !== undefined ||
            v.end !== undefined ||
            v.private_properties !== undefined ||
            v.start !== undefined ||
            v.summary !== undefined,
          { message: "Provide at least one field to update." }
        ),
      providerScopes: [SCOPE_EVENTS],
      summary: "Update a calendar event",
    }),
    connectorAction({
      description:
        "Delete a calendar event permanently (attendees are notified of the cancellation).",
      group: "destructive",
      handler: async (input, ctx) => {
        const calendarId = input.calendar_id ?? "primary";
        await googleFetch(
          ctx,
          `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.event_id)}`,
          { method: "DELETE" }
        );
        return {
          calendar_id: calendarId,
          deleted: true,
          event_id: input.event_id,
        };
      },
      id: "delete_event",
      inputSchema: z.object({
        calendar_id: calendarIdField,
        event_id: z.string().describe("Calendar event id to delete."),
      }),
      providerScopes: [SCOPE_EVENTS],
      summary: "Delete a calendar event",
    }),
  ],
  auth: { kind: "oauth2", oauth2: GOOGLE_OAUTH2 },
  description: "Read and manage events in a connected Google Calendar account.",
  icon: "logo:google-calendar",
  id: "google-calendar",
  moduleId: "connections-google",
  name: "Google Calendar",
  toolPrefix: "gcal",
});
