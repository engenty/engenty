import { describe, expect, it } from "vitest";
import type { InboxMessage } from "../schema/types.js";
import { buildMessageSearchDocument } from "./message-embed.js";

function makeMessage(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    attachments_json: [],
    body_html: null,
    body_text: null,
    cc_emails: [],
    classification: null,
    classification_reason: null,
    connection_id: "conn-1",
    created_at: "2026-07-05T10:00:00Z",
    from_email: null,
    from_name: null,
    has_attachments: false,
    id: "msg-1",
    owner_user_id: null,
    provider_message_id: "prov-1",
    provider_thread_id: null,
    received_at: null,
    scope_id: "default",
    snippet: null,
    status: "new",
    status_set_by: null,
    subject: null,
    tenant_id: "tenant-1",
    thread_id: "thread-1",
    to_emails: [],
    updated_at: "2026-07-05T10:00:00Z",
    user_classification: null,
    ...overrides,
  };
}

describe("buildMessageSearchDocument", () => {
  it("renders header lines and the body, skipping empty fields", () => {
    const document = buildMessageSearchDocument(
      makeMessage({
        body_text: "Hallo, anbei das Angebot.",
        from_email: "anna@example.com",
        from_name: "Anna Muster",
        received_at: "2026-07-01T08:30:00Z",
        subject: "Angebot Q3",
        to_emails: ["office@engenty.test"],
      })
    );
    expect(document).toContain("From: Anna Muster <anna@example.com>");
    expect(document).toContain("To: office@engenty.test");
    expect(document).toContain("Subject: Angebot Q3");
    expect(document).toContain("Date: 2026-07-01T08:30:00Z");
    expect(document).toContain("Hallo, anbei das Angebot.");
    expect(document).not.toContain("Cc:");
    expect(document).not.toContain("Attachments:");
  });

  it("lists attachment filenames", () => {
    const document = buildMessageSearchDocument(
      makeMessage({
        attachments_json: [
          {
            attachment_id: "a1",
            content_id: null,
            filename: "rechnung-42.pdf",
            mime_type: "application/pdf",
            size: 1234,
          },
          {
            attachment_id: "a2",
            content_id: null,
            filename: null,
            mime_type: null,
            size: null,
          },
        ],
        subject: "Rechnung",
      })
    );
    expect(document).toContain("Attachments: rechnung-42.pdf");
  });

  it("falls back to the snippet when body_text is empty", () => {
    const document = buildMessageSearchDocument(
      makeMessage({ snippet: "Kurzfassung der Nachricht" })
    );
    expect(document).toContain("Kurzfassung der Nachricht");
  });

  it("caps the body so the document fits the embedding input window", () => {
    const document = buildMessageSearchDocument(
      makeMessage({ body_text: "x".repeat(20_000), subject: "Lang" })
    );
    expect(document.length).toBeLessThan(7000);
  });

  it("returns an empty string for a content-free message", () => {
    expect(buildMessageSearchDocument(makeMessage())).toBe("");
  });
});
