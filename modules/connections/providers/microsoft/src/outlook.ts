import type {
  ConnectorActionContext,
  ConnectorDefinition,
} from "@engenty/connections-sdk";
import { defineConnector } from "@engenty/connections-sdk";
import { z } from "zod";
import { action } from "./action.js";
import { bodyToText, graphJson, MICROSOFT_OAUTH2 } from "./graph.js";

const MAX_LIST_TOP = 25;

interface GraphRecipient {
  emailAddress?: { address?: string | null; name?: string | null } | null;
}

interface GraphMessage {
  body?: { content?: string | null; contentType?: string | null } | null;
  bodyPreview?: string | null;
  ccRecipients?: GraphRecipient[] | null;
  from?: GraphRecipient | null;
  id?: string;
  isRead?: boolean;
  parentFolderId?: string | null;
  receivedDateTime?: string | null;
  subject?: string | null;
  toRecipients?: GraphRecipient[] | null;
  webLink?: string | null;
}

interface GraphDateTimeTimeZone {
  dateTime?: string | null;
  timeZone?: string | null;
}

interface GraphEvent {
  attendees?: Array<
    GraphRecipient & { status?: { response?: string | null } | null }
  > | null;
  body?: { content?: string | null; contentType?: string | null } | null;
  end?: GraphDateTimeTimeZone | null;
  id?: string;
  isAllDay?: boolean;
  location?: { displayName?: string | null } | null;
  organizer?: GraphRecipient | null;
  start?: GraphDateTimeTimeZone | null;
  subject?: string | null;
  webLink?: string | null;
}

function mapRecipient(r: GraphRecipient | null | undefined) {
  return {
    address: r?.emailAddress?.address ?? null,
    name: r?.emailAddress?.name ?? null,
  };
}

function mapMessageSummary(m: GraphMessage) {
  return {
    bodyPreview: m.bodyPreview ?? null,
    from: mapRecipient(m.from),
    id: m.id,
    receivedDateTime: m.receivedDateTime ?? null,
    subject: m.subject ?? null,
  };
}

function mapEventSummary(e: GraphEvent) {
  return {
    end: e.end ?? null,
    id: e.id,
    isAllDay: e.isAllDay ?? false,
    location: e.location?.displayName ?? null,
    organizer: mapRecipient(e.organizer),
    start: e.start ?? null,
    subject: e.subject ?? null,
  };
}

function mapEventDetail(e: GraphEvent) {
  return {
    ...mapEventSummary(e),
    attendees: (e.attendees ?? []).map((a) => ({
      ...mapRecipient(a),
      response: a.status?.response ?? null,
    })),
    body_text: bodyToText(e.body),
    webLink: e.webLink ?? null,
  };
}

function toRecipients(addresses: string[] | undefined): GraphRecipient[] {
  return (addresses ?? []).map((address) => ({ emailAddress: { address } }));
}

function toAttendees(addresses: string[]) {
  return addresses.map((address) => ({
    emailAddress: { address },
    type: "required",
  }));
}

function clampTop(top: number | undefined, fallback: number): number {
  return Math.min(Math.max(top ?? fallback, 1), MAX_LIST_TOP);
}

/** Escape a value for use inside single quotes in an OData $filter. */
function odataQuote(value: string): string {
  return value.replace(/'/g, "''");
}

const topField = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIST_TOP)
  .optional()
  .describe("Max results to return (1–25, default 10).");

const calendarIdField = z
  .string()
  .optional()
  .describe(
    "Calendar id to target (from list_calendars). Defaults to the user's primary calendar."
  );

/** Event collection path for a calendar (primary when no id given). */
function eventsPath(calendarId: string | undefined): string {
  return calendarId
    ? `/me/calendars/${encodeURIComponent(calendarId)}/events`
    : "/me/events";
}

/** calendarView path (recurrence-expanded window) for a calendar. */
function calendarViewPath(calendarId: string | undefined): string {
  return calendarId
    ? `/me/calendars/${encodeURIComponent(calendarId)}/calendarView`
    : "/me/calendarView";
}

const messageDraftFields = {
  body_text: z.string().describe("Plain-text message body."),
  cc: z.array(z.string()).optional().describe("CC recipient email addresses."),
  subject: z.string().describe("Message subject."),
  to: z.array(z.string()).min(1).describe("Recipient email addresses."),
};

function draftMessagePayload(input: {
  body_text: string;
  cc?: string[];
  subject: string;
  to: string[];
}) {
  return {
    body: { content: input.body_text, contentType: "Text" },
    ...(input.cc?.length ? { ccRecipients: toRecipients(input.cc) } : {}),
    subject: input.subject,
    toRecipients: toRecipients(input.to),
  };
}

const EVENT_SELECT = "id,subject,start,end,location,organizer,isAllDay";

async function fetchEventDetail(ctx: ConnectorActionContext, eventId: string) {
  const e = await graphJson<GraphEvent>(
    ctx,
    `/me/events/${encodeURIComponent(eventId)}?$select=${EVENT_SELECT},attendees,body,webLink`
  );
  return mapEventDetail(e);
}

export const microsoftOutlookConnector: ConnectorDefinition = defineConnector({
  actions: [
    // ── read ────────────────────────────────────────────────────────────
    action({
      description:
        "Search Outlook messages by free-text query or by sender/subject filter; returns compact summaries.",
      group: "read",
      id: "search_messages",
      inputSchema: z.object({
        from: z
          .string()
          .optional()
          .describe(
            "Filter: exact sender email address (ignored when query is set)."
          ),
        query: z
          .string()
          .optional()
          .describe(
            "Free-text search across the mailbox (Microsoft Graph $search)."
          ),
        subject_contains: z
          .string()
          .optional()
          .describe(
            "Filter: subject contains this text (ignored when query is set)."
          ),
        top: topField,
      }),
      providerScopes: ["Mail.Read"],
      run: async (input, ctx) => {
        const params = new URLSearchParams();
        params.set("$select", "id,subject,from,receivedDateTime,bodyPreview");
        params.set("$top", String(clampTop(input.top, 10)));
        if (input.query) {
          params.set("$search", `"${input.query.replace(/"/g, '\\"')}"`);
        } else {
          const filters: string[] = [];
          if (input.from) {
            filters.push(
              `from/emailAddress/address eq '${odataQuote(input.from)}'`
            );
          }
          if (input.subject_contains) {
            filters.push(
              `contains(subject,'${odataQuote(input.subject_contains)}')`
            );
          }
          if (filters.length) {
            params.set("$filter", filters.join(" and "));
          }
        }
        const data = await graphJson<{ value?: GraphMessage[] }>(
          ctx,
          `/me/messages?${params.toString()}`
        );
        return { messages: (data.value ?? []).map(mapMessageSummary) };
      },
      summary: "Search Outlook messages",
    }),
    action({
      description:
        "Get a single Outlook message including its body as plain text (HTML bodies are converted).",
      group: "read",
      id: "get_message",
      inputSchema: z.object({
        message_id: z.string().describe("Graph message id."),
      }),
      providerScopes: ["Mail.Read"],
      run: async (input, ctx) => {
        const m = await graphJson<GraphMessage>(
          ctx,
          `/me/messages/${encodeURIComponent(input.message_id)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,body,parentFolderId,webLink`
        );
        return {
          body_text: bodyToText(m.body),
          cc: (m.ccRecipients ?? []).map(mapRecipient),
          from: mapRecipient(m.from),
          id: m.id,
          isRead: m.isRead ?? null,
          parentFolderId: m.parentFolderId ?? null,
          receivedDateTime: m.receivedDateTime ?? null,
          subject: m.subject ?? null,
          to: (m.toRecipients ?? []).map(mapRecipient),
          webLink: m.webLink ?? null,
        };
      },
      summary: "Get an Outlook message with its text body",
    }),
    action({
      description:
        "List mail folders in the mailbox (id, name, item counts) for use with move_message.",
      group: "read",
      id: "list_mail_folders",
      inputSchema: z.object({
        top: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIST_TOP)
          .optional()
          .describe("Max folders to return (1–25, default 25)."),
      }),
      providerScopes: ["Mail.Read"],
      run: async (input, ctx) => {
        const data = await graphJson<{
          value?: Array<{
            displayName?: string | null;
            id?: string;
            totalItemCount?: number;
            unreadItemCount?: number;
          }>;
        }>(
          ctx,
          `/me/mailFolders?$top=${clampTop(input.top, MAX_LIST_TOP)}&$select=id,displayName,totalItemCount,unreadItemCount`
        );
        return {
          folders: (data.value ?? []).map((f) => ({
            displayName: f.displayName ?? null,
            id: f.id,
            totalItemCount: f.totalItemCount ?? null,
            unreadItemCount: f.unreadItemCount ?? null,
          })),
        };
      },
      summary: "List Outlook mail folders",
    }),
    action({
      description:
        "List the calendars the mailbox can see (id, name, primary flag) for use with the calendar_id parameter on the event actions.",
      group: "read",
      id: "list_calendars",
      inputSchema: z.object({}),
      providerScopes: ["Calendars.Read"],
      run: async (_input, ctx) => {
        const data = await graphJson<{
          value?: Array<{
            id?: string;
            isDefaultCalendar?: boolean;
            name?: string | null;
          }>;
        }>(ctx, "/me/calendars?$select=id,name,isDefaultCalendar");
        return {
          calendars: (data.value ?? []).map((c) => ({
            id: c.id,
            primary: Boolean(c.isDefaultCalendar),
            summary: c.name ?? null,
            // Graph exposes no per-calendar default zone on this projection.
            time_zone: null,
          })),
        };
      },
      summary: "List Outlook calendars",
    }),
    action({
      description:
        "List calendar events from a calendar (default: primary). With start and end, expands recurring events in that window (calendarView); otherwise lists event definitions.",
      group: "read",
      id: "list_events",
      inputSchema: z.object({
        calendar_id: calendarIdField,
        end: z
          .string()
          .optional()
          .describe(
            "Window end (ISO 8601). Provide both start and end to query a window."
          ),
        start: z
          .string()
          .optional()
          .describe(
            "Window start (ISO 8601). Provide both start and end to query a window."
          ),
        top: topField,
      }),
      providerScopes: ["Calendars.Read"],
      run: async (input, ctx) => {
        const params = new URLSearchParams({
          $orderby: "start/dateTime",
          $select: EVENT_SELECT,
          $top: String(clampTop(input.top, 10)),
        });
        let path = `${eventsPath(input.calendar_id)}?${params.toString()}`;
        if (input.start && input.end) {
          params.set("startDateTime", input.start);
          params.set("endDateTime", input.end);
          path = `${calendarViewPath(input.calendar_id)}?${params.toString()}`;
        }
        const data = await graphJson<{ value?: GraphEvent[] }>(ctx, path);
        return { events: (data.value ?? []).map(mapEventSummary) };
      },
      summary: "List calendar events",
    }),
    action({
      description:
        "Get a single calendar event with attendees and its body as plain text.",
      group: "read",
      id: "get_event",
      inputSchema: z.object({
        event_id: z.string().describe("Graph event id."),
      }),
      providerScopes: ["Calendars.Read"],
      run: (input, ctx) => fetchEventDetail(ctx, input.event_id),
      summary: "Get a calendar event",
    }),
    // ── write ───────────────────────────────────────────────────────────
    action({
      description:
        "Create an email draft in the Drafts folder (not sent). Use send_message to actually send mail.",
      group: "write",
      id: "create_draft",
      inputSchema: z.object(messageDraftFields),
      providerScopes: ["Mail.ReadWrite"],
      run: async (input, ctx) => {
        const m = await graphJson<GraphMessage>(ctx, "/me/messages", {
          body: draftMessagePayload(input),
          method: "POST",
        });
        return {
          id: m.id,
          subject: m.subject ?? null,
          webLink: m.webLink ?? null,
        };
      },
      summary: "Create an Outlook mail draft",
    }),
    action({
      description:
        "Move a message to another mail folder (use list_mail_folders for folder ids; well-known names like 'archive' also work).",
      group: "write",
      id: "move_message",
      inputSchema: z.object({
        destination_folder_id: z
          .string()
          .describe(
            "Target folder id or well-known name (e.g. 'archive', 'deleteditems')."
          ),
        message_id: z.string().describe("Graph message id to move."),
      }),
      providerScopes: ["Mail.ReadWrite"],
      run: async (input, ctx) => {
        const m = await graphJson<GraphMessage>(
          ctx,
          `/me/messages/${encodeURIComponent(input.message_id)}/move`,
          {
            body: { destinationId: input.destination_folder_id },
            method: "POST",
          }
        );
        return {
          id: m.id,
          parentFolderId: m.parentFolderId ?? null,
          subject: m.subject ?? null,
        };
      },
      summary: "Move an Outlook message to a folder",
    }),
    action({
      description:
        "Create a calendar event in the user's chosen calendar (default: primary).",
      group: "write",
      id: "create_event",
      inputSchema: z.object({
        attendees: z
          .array(z.string())
          .optional()
          .describe("Attendee email addresses (invited as required)."),
        body_text: z
          .string()
          .optional()
          .describe("Plain-text event description."),
        calendar_id: calendarIdField,
        end: z
          .string()
          .describe(
            "Event end, ISO 8601 date-time (e.g. 2026-07-04T15:00:00)."
          ),
        start: z
          .string()
          .describe(
            "Event start, ISO 8601 date-time (e.g. 2026-07-04T14:00:00)."
          ),
        subject: z.string().describe("Event subject/title."),
        time_zone: z
          .string()
          .default("UTC")
          .describe('Time zone for start and end (default "UTC").'),
      }),
      providerScopes: ["Calendars.ReadWrite"],
      run: async (input, ctx) => {
        const e = await graphJson<GraphEvent>(
          ctx,
          eventsPath(input.calendar_id),
          {
            body: {
              ...(input.attendees?.length
                ? { attendees: toAttendees(input.attendees) }
                : {}),
              ...(input.body_text
                ? { body: { content: input.body_text, contentType: "Text" } }
                : {}),
              end: { dateTime: input.end, timeZone: input.time_zone },
              start: { dateTime: input.start, timeZone: input.time_zone },
              subject: input.subject,
            },
            method: "POST",
          }
        );
        return mapEventDetail(e);
      },
      summary: "Create a calendar event",
    }),
    action({
      description:
        "Update fields of an existing calendar event (only the provided fields are changed).",
      group: "write",
      id: "update_event",
      inputSchema: z.object({
        attendees: z
          .array(z.string())
          .optional()
          .describe("Replace the attendee list with these email addresses."),
        body_text: z
          .string()
          .optional()
          .describe("New plain-text event description."),
        end: z.string().optional().describe("New end, ISO 8601 date-time."),
        event_id: z.string().describe("Graph event id to update."),
        start: z.string().optional().describe("New start, ISO 8601 date-time."),
        subject: z.string().optional().describe("New event subject/title."),
        time_zone: z
          .string()
          .default("UTC")
          .describe('Time zone for start/end when provided (default "UTC").'),
      }),
      providerScopes: ["Calendars.ReadWrite"],
      run: async (input, ctx) => {
        const patch: Record<string, unknown> = {};
        if (input.subject !== undefined) {
          patch.subject = input.subject;
        }
        if (input.body_text !== undefined) {
          patch.body = { content: input.body_text, contentType: "Text" };
        }
        if (input.start !== undefined) {
          patch.start = { dateTime: input.start, timeZone: input.time_zone };
        }
        if (input.end !== undefined) {
          patch.end = { dateTime: input.end, timeZone: input.time_zone };
        }
        if (input.attendees !== undefined) {
          patch.attendees = toAttendees(input.attendees);
        }
        if (Object.keys(patch).length === 0) {
          throw new Error("update_event: no fields to update");
        }
        const e = await graphJson<GraphEvent>(
          ctx,
          `/me/events/${encodeURIComponent(input.event_id)}`,
          { body: patch, method: "PATCH" }
        );
        return mapEventDetail(e);
      },
      summary: "Update a calendar event",
    }),
    // ── destructive ─────────────────────────────────────────────────────
    action({
      description:
        "Send an email immediately on behalf of the connected account.",
      group: "destructive",
      id: "send_message",
      inputSchema: z.object({
        ...messageDraftFields,
        save_to_sent_items: z
          .boolean()
          .default(true)
          .describe("Save a copy to Sent Items (default true)."),
      }),
      providerScopes: ["Mail.Send"],
      run: async (input, ctx) => {
        await graphJson(ctx, "/me/sendMail", {
          body: {
            message: draftMessagePayload(input),
            saveToSentItems: input.save_to_sent_items,
          },
          method: "POST",
        });
        return { sent: true, subject: input.subject, to: input.to };
      },
      summary: "Send an email",
    }),
    action({
      description:
        "Delete a message (moves it to the Deleted Items folder; recoverable from there).",
      group: "destructive",
      id: "delete_message",
      inputSchema: z.object({
        message_id: z.string().describe("Graph message id to delete."),
      }),
      providerScopes: ["Mail.ReadWrite"],
      run: async (input, ctx) => {
        await graphJson(
          ctx,
          `/me/messages/${encodeURIComponent(input.message_id)}`,
          { method: "DELETE" }
        );
        return { deleted: true, message_id: input.message_id };
      },
      summary: "Delete an Outlook message",
    }),
    action({
      description:
        "Delete a calendar event (cancels it for attendees if the user is the organizer).",
      group: "destructive",
      id: "delete_event",
      inputSchema: z.object({
        event_id: z.string().describe("Graph event id to delete."),
      }),
      providerScopes: ["Calendars.ReadWrite"],
      run: async (input, ctx) => {
        await graphJson(
          ctx,
          `/me/events/${encodeURIComponent(input.event_id)}`,
          { method: "DELETE" }
        );
        return { deleted: true, event_id: input.event_id };
      },
      summary: "Delete a calendar event",
    }),
  ],
  auth: { kind: "oauth2", oauth2: MICROSOFT_OAUTH2 },
  description:
    "Outlook mail and calendar via Microsoft Graph: search and read messages, drafts, sending, folders, and calendar events.",
  icon: "logo:microsoft-outlook",
  id: "microsoft-outlook",
  moduleId: "connections-microsoft",
  name: "Microsoft Outlook",
  toolPrefix: "outlook",
});
