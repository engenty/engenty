import type { InboxMessage } from "../schema/types.js";

// Canonical inbox document-text builder, consumed by the `inbox.message`
// retrieval source (`dal/inbox-retrieval-source.ts`) — the central service
// embeds whatever this produces (platform-default model).

// One vector per message: the document must fit the embedding model's input
// window (text-embedding-3-small: 8191 tokens). Header lines are short, so
// capping the body keeps the whole document safely under it while retaining
// far more context than the snippet.
const MAX_BODY_CHARS = 6000;

function addLine(lines: string[], label: string, value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    lines.push(`${label}: ${value.trim()}`);
  }
}

function formatSender(message: InboxMessage): string {
  const name = message.from_name?.trim() ?? "";
  const email = message.from_email?.trim() ?? "";
  if (name && email) {
    return `${name} <${email}>`;
  }
  return name || email;
}

export function buildMessageSearchDocument(message: InboxMessage): string {
  const lines: string[] = [];
  addLine(lines, "From", formatSender(message));
  addLine(lines, "To", message.to_emails.join(", "));
  addLine(lines, "Cc", message.cc_emails.join(", "));
  addLine(lines, "Subject", message.subject);
  addLine(lines, "Date", message.received_at);
  addLine(
    lines,
    "Attachments",
    message.attachments_json
      .map((attachment) => attachment.filename?.trim())
      .filter((filename): filename is string => Boolean(filename))
      .join(", ")
  );
  const body = message.body_text?.trim() || message.snippet?.trim() || "";
  if (body) {
    lines.push("", body.slice(0, MAX_BODY_CHARS));
  }
  return lines.join("\n").trim();
}
