import {
  type ConnectorDefinition,
  defineConnector,
} from "@engenty/connections-sdk";
import { z } from "zod";
import { connectorAction, GOOGLE_OAUTH2, googleJson } from "../shared.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

const SCOPE_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
const SCOPE_COMPOSE = "https://www.googleapis.com/auth/gmail.compose";
const SCOPE_MODIFY = "https://www.googleapis.com/auth/gmail.modify";
const SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send";

// ─── Gmail MIME parsing (ported from the legacy inbox Gmail provider) ───

interface GmailPayload {
  body?: { attachmentId?: string; data?: string; size?: number };
  filename?: string;
  headers?: { name: string; value: string }[];
  mimeType?: string;
  parts?: GmailPayload[];
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPayload;
  snippet?: string;
  threadId?: string;
}

function getHeader(
  headers: { name: string; value: string }[] | undefined,
  name: string
): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value;
}

function parseEmailAddress(raw: string): { email: string; name?: string } {
  // "John Doe <john@example.com>" → { name: "John Doe", email: "john@example.com" }
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { email: match[2], name: match[1].trim().replace(/^"|"$/g, "") };
  }
  return { email: raw.trim() };
}

function parseAddressList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((a) => parseEmailAddress(a.trim()).email)
    .filter((e) => e.length > 0);
}

/** Gmail uses URL-safe base64 for message bodies. */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractBody(
  payload: GmailPayload | undefined,
  mimeType: string
): string | null {
  if (!payload) {
    return null;
  }
  if (payload.mimeType === mimeType && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractBody(part, mimeType);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

function parseGmailMessage(raw: GmailMessage): {
  body_text: string | null;
  cc: string[];
  date: string | null;
  from_email: string | null;
  from_name: string | null;
  message_id: string;
  subject: string | null;
  to: string[];
} {
  const headers = raw.payload?.headers;
  const { email: fromEmail, name: fromName } = parseEmailAddress(
    getHeader(headers, "From") ?? ""
  );
  return {
    body_text: extractBody(raw.payload, "text/plain") ?? raw.snippet ?? null,
    cc: parseAddressList(getHeader(headers, "Cc")),
    date: raw.internalDate
      ? new Date(Number(raw.internalDate)).toISOString()
      : (getHeader(headers, "Date") ?? null),
    from_email: fromEmail || null,
    from_name: fromName ?? null,
    message_id: raw.id,
    subject: getHeader(headers, "Subject") ?? null,
    to: parseAddressList(getHeader(headers, "To")),
  };
}

// ─── RFC 822 assembly for drafts/sending ───

function encodeHeaderValue(value: string): string {
  // RFC 2047 B-encoding for non-ASCII header values.
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function buildRawMessage(input: {
  body_text: string;
  cc?: string[];
  subject: string;
  to: string[];
}): string {
  const lines = [
    `To: ${input.to.join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${encodeHeaderValue(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.body_text,
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8").toString("base64url");
}

// ─── Shared schema fragments ───

const emailAddress = z.string().min(3);

const composeFields = {
  body_text: z.string().describe("Plain-text body of the email."),
  cc: z
    .array(emailAddress.describe("Cc recipient email address."))
    .optional()
    .describe("Optional list of Cc recipient email addresses."),
  subject: z.string().describe("Email subject line."),
  to: z
    .array(emailAddress.describe("Recipient email address."))
    .min(1)
    .describe("List of recipient email addresses (To)."),
};

// ─── Connector ───

export const gmailConnector: ConnectorDefinition = defineConnector({
  actions: [
    connectorAction({
      description:
        "Search Gmail threads with a Gmail query string and return brief per-thread info (subject, sender, date, snippet, message count).",
      group: "read",
      handler: async (input, ctx) => {
        const url = new URL(`${GMAIL_API}/threads`);
        url.searchParams.set("q", input.q);
        url.searchParams.set("maxResults", String(input.max_results ?? 10));
        const list = await googleJson<{
          resultSizeEstimate?: number;
          threads?: { id: string; snippet?: string }[];
        }>(ctx, url.toString());
        const threads = list.threads ?? [];
        const detailed = await Promise.all(
          threads.map(async (t) => {
            const detail = await googleJson<{ messages?: GmailMessage[] }>(
              ctx,
              `${GMAIL_API}/threads/${encodeURIComponent(t.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
            );
            const messages = detail.messages ?? [];
            const last = messages.at(-1);
            const headers = last?.payload?.headers;
            return {
              from: getHeader(headers, "From") ?? null,
              last_message_at: last?.internalDate
                ? new Date(Number(last.internalDate)).toISOString()
                : (getHeader(headers, "Date") ?? null),
              message_count: messages.length,
              snippet: t.snippet ?? null,
              subject: getHeader(headers, "Subject") ?? null,
              thread_id: t.id,
            };
          })
        );
        return {
          result_size_estimate: list.resultSizeEstimate ?? detailed.length,
          threads: detailed,
        };
      },
      id: "search_threads",
      inputSchema: z.object({
        max_results: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("Maximum number of threads to return (1-25, default 10)."),
        q: z
          .string()
          .describe(
            'Gmail search query, same syntax as the Gmail search box (e.g. "from:alice@example.com is:unread newer_than:7d").'
          ),
      }),
      providerScopes: [SCOPE_READONLY],
      summary: "Search Gmail threads",
    }),
    connectorAction({
      description:
        "Fetch a Gmail thread by id with all messages parsed: from/to/cc, subject, date and plain-text body.",
      group: "read",
      handler: async (input, ctx) => {
        const thread = await googleJson<{
          id: string;
          messages?: GmailMessage[];
        }>(
          ctx,
          `${GMAIL_API}/threads/${encodeURIComponent(input.thread_id)}?format=full`
        );
        return {
          message_count: thread.messages?.length ?? 0,
          messages: (thread.messages ?? []).map(parseGmailMessage),
          thread_id: thread.id,
        };
      },
      id: "get_thread",
      inputSchema: z.object({
        thread_id: z
          .string()
          .describe("Gmail thread id (from search_threads results)."),
      }),
      providerScopes: [SCOPE_READONLY],
      summary: "Read a full Gmail thread",
    }),
    connectorAction({
      description:
        "List all Gmail labels (system and user-created) with their ids, for use with modify_labels.",
      group: "read",
      handler: async (_input, ctx) => {
        const data = await googleJson<{
          labels?: { id: string; name: string; type?: string }[];
        }>(ctx, `${GMAIL_API}/labels`);
        return {
          labels: (data.labels ?? []).map((l) => ({
            id: l.id,
            name: l.name,
            type: l.type ?? "user",
          })),
        };
      },
      id: "list_labels",
      inputSchema: z.object({}),
      providerScopes: [SCOPE_READONLY],
      summary: "List Gmail labels",
    }),
    connectorAction({
      description:
        "List Gmail drafts with their ids, recipients and subjects.",
      group: "read",
      handler: async (input, ctx) => {
        const url = new URL(`${GMAIL_API}/drafts`);
        url.searchParams.set("maxResults", String(input.max_results ?? 10));
        const list = await googleJson<{
          drafts?: { id: string; message?: { id: string; threadId?: string } }[];
        }>(ctx, url.toString());
        const drafts = await Promise.all(
          (list.drafts ?? []).map(async (d) => {
            const detail = await googleJson<{
              id: string;
              message?: GmailMessage;
            }>(
              ctx,
              `${GMAIL_API}/drafts/${encodeURIComponent(d.id)}?format=metadata`
            );
            const headers = detail.message?.payload?.headers;
            return {
              draft_id: d.id,
              message_id: detail.message?.id ?? d.message?.id ?? null,
              subject: getHeader(headers, "Subject") ?? null,
              thread_id: detail.message?.threadId ?? null,
              to: parseAddressList(getHeader(headers, "To")),
            };
          })
        );
        return { drafts };
      },
      id: "list_drafts",
      inputSchema: z.object({
        max_results: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("Maximum number of drafts to return (1-25, default 10)."),
      }),
      providerScopes: [SCOPE_READONLY],
      summary: "List Gmail drafts",
    }),
    connectorAction({
      description:
        "Create a Gmail draft (plain text). The draft is saved but NOT sent; use send_message to actually send email.",
      group: "write",
      handler: async (input, ctx) => {
        const result = await googleJson<{
          id: string;
          message?: { id?: string; threadId?: string };
        }>(ctx, `${GMAIL_API}/drafts`, {
          body: JSON.stringify({ message: { raw: buildRawMessage(input) } }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        return {
          draft_id: result.id,
          message_id: result.message?.id ?? null,
          thread_id: result.message?.threadId ?? null,
        };
      },
      id: "create_draft",
      inputSchema: z.object(composeFields),
      providerScopes: [SCOPE_COMPOSE, SCOPE_MODIFY],
      summary: "Create a Gmail draft",
    }),
    connectorAction({
      description:
        "Add and/or remove labels on a Gmail message (label ids from list_labels, e.g. STARRED, or a user label id).",
      group: "write",
      handler: async (input, ctx) => {
        const result = await googleJson<{
          id: string;
          labelIds?: string[];
          threadId?: string;
        }>(
          ctx,
          `${GMAIL_API}/messages/${encodeURIComponent(input.message_id)}/modify`,
          {
            body: JSON.stringify({
              addLabelIds: input.add ?? [],
              removeLabelIds: input.remove ?? [],
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
        return {
          label_ids: result.labelIds ?? [],
          message_id: result.id,
          thread_id: result.threadId ?? null,
        };
      },
      id: "modify_labels",
      inputSchema: z
        .object({
          add: z
            .array(z.string().describe("Label id to add."))
            .optional()
            .describe("Label ids to add to the message."),
          message_id: z.string().describe("Gmail message id to modify."),
          remove: z
            .array(z.string().describe("Label id to remove."))
            .optional()
            .describe("Label ids to remove from the message."),
        })
        .refine((v) => (v.add?.length ?? 0) + (v.remove?.length ?? 0) > 0, {
          message: "Provide at least one label id in add or remove.",
        }),
      providerScopes: [SCOPE_COMPOSE, SCOPE_MODIFY],
      summary: "Modify Gmail message labels",
    }),
    connectorAction({
      description:
        "Send an email via Gmail immediately (plain text). This delivers mail to the recipients — irreversible.",
      group: "destructive",
      handler: async (input, ctx) => {
        const result = await googleJson<{
          id: string;
          labelIds?: string[];
          threadId?: string;
        }>(ctx, `${GMAIL_API}/messages/send`, {
          body: JSON.stringify({ raw: buildRawMessage(input) }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        return {
          message_id: result.id,
          sent: true,
          thread_id: result.threadId ?? null,
        };
      },
      id: "send_message",
      inputSchema: z.object(composeFields),
      providerScopes: [SCOPE_SEND],
      summary: "Send an email via Gmail",
    }),
    connectorAction({
      description:
        "Move a Gmail message to the trash (recoverable in Gmail for ~30 days).",
      group: "destructive",
      handler: async (input, ctx) => {
        const result = await googleJson<{ id: string; labelIds?: string[] }>(
          ctx,
          `${GMAIL_API}/messages/${encodeURIComponent(input.message_id)}/trash`,
          { method: "POST" }
        );
        return { label_ids: result.labelIds ?? [], message_id: result.id, trashed: true };
      },
      id: "trash_message",
      inputSchema: z.object({
        message_id: z.string().describe("Gmail message id to move to trash."),
      }),
      providerScopes: [SCOPE_MODIFY],
      summary: "Trash a Gmail message",
    }),
  ],
  auth: { kind: "oauth2", oauth2: GOOGLE_OAUTH2 },
  description:
    "Read, draft, label and send email in a connected Gmail account.",
  icon: "✉️",
  id: "google-gmail",
  moduleId: "connections-google",
  name: "Gmail",
  toolPrefix: "gmail",
});
