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
  htmlLink?: string;
  id: string;
  location?: string;
  organizer?: { displayName?: string; email?: string };
  start?: { date?: string; dateTime?: string; timeZone?: string };
  status?: string;
  summary?: string;
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
    event_id: e.id,
    html_link: e.htmlLink ?? null,
    location: e.location ?? null,
    start: eventTime(e.start),
    status: e.status ?? null,
    summary: e.summary ?? null,
  };
}

/** "2026-07-04" → { date }, full ISO timestamp → { dateTime }. */
function toEventDateTime(
  value: string
): { date: string } | { dateTime: string } {
  return ALL_DAY_DATE.test(value) ? { date: value } : { dateTime: value };
}

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
        "List events from a calendar in a time window, ordered by start time (recurring events expanded to single instances).",
      group: "read",
      handler: async (input, ctx) => {
        const calendarId = input.calendar_id ?? "primary";
        const url = new URL(
          `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`
        );
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
          events: (data.items ?? []).map((e) => ({
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
          .max(25)
          .optional()
          .describe("Maximum number of events to return (1-25, default 10)."),
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
              end: toEventDateTime(input.end),
              start: toEventDateTime(input.start),
              summary: input.summary,
              ...(input.description ? { description: input.description } : {}),
              ...(input.attendees?.length
                ? { attendees: input.attendees.map((email) => ({ email })) }
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
        start: startField,
        summary: z.string().describe("Event title."),
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
          patch.start = toEventDateTime(input.start);
        }
        if (input.end !== undefined) {
          patch.end = toEventDateTime(input.end);
        }
        if (input.attendees !== undefined) {
          patch.attendees = input.attendees.map((email) => ({ email }));
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
          start: startField.optional(),
          summary: z.string().optional().describe("New event title."),
        })
        .refine(
          (v) =>
            v.attendees !== undefined ||
            v.description !== undefined ||
            v.end !== undefined ||
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
