import { describe, expect, it } from "vitest";
import type { InboxThreadDetail, InboxThreadListItem } from "./api.js";
import {
  buildInboxThreadSnapshot,
  buildInboxThreadsPreview,
} from "./copilot-snapshot.js";

function makeListItem(
  overrides: Partial<InboxThreadListItem> = {}
): InboxThreadListItem {
  return {
    connection_id: "conn-1",
    created_at: "2026-01-01T00:00:00.000Z",
    id: "thread-1",
    last_message_at: "2026-01-02T00:00:00.000Z",
    latest_category: null,
    latest_from_email: "ap@acme.com",
    latest_from_name: "AP",
    latest_snippet: "Please review the invoice.",
    latest_status: "new",
    message_count: 2,
    owner_user_id: null,
    participants: ["ap@acme.com", "me@engenty.com"],
    provider_thread_id: null,
    scope_id: "default",
    subject: "Q4 invoice",
    tenant_id: "t1",
    unhandled_count: 1,
    updated_at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildInboxThreadsPreview", () => {
  it("caps rows and keeps compact fields only", () => {
    const threads = Array.from({ length: 12 }, (_, i) =>
      makeListItem({ id: `t-${i}`, subject: `Subject ${i}` })
    );
    const preview = buildInboxThreadsPreview(threads);
    expect(preview).toHaveLength(10);
    expect(preview[0]).toEqual({
      id: "t-0",
      subject: "Subject 0",
      from: "AP",
      status: "new",
      received_at: "2026-01-02T00:00:00.000Z",
      message_count: 2,
    });
  });
});

describe("buildInboxThreadSnapshot", () => {
  it("includes participants/snippet/status without bodies", () => {
    const detail: InboxThreadDetail = {
      thread: {
        connection_id: "conn-1",
        created_at: "2026-01-01T00:00:00.000Z",
        id: "thread-1",
        last_message_at: "2026-01-02T00:00:00.000Z",
        message_count: 1,
        owner_user_id: null,
        participants: ["ap@acme.com"],
        provider_thread_id: null,
        scope_id: "default",
        subject: "Hello",
        tenant_id: "t1",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
      messages: [
        {
          ai_category: null,
          attachments_json: [],
          body_html: "<p>secret body</p>",
          body_text: "secret body",
          cc_emails: [],
          classification: null,
          classification_reason: null,
          connection_id: "conn-1",
          created_at: "2026-01-02T00:00:00.000Z",
          from_email: "ap@acme.com",
          from_name: "AP",
          has_attachments: false,
          id: "msg-1",
          owner_user_id: null,
          provider_message_id: "pm-1",
          provider_thread_id: null,
          received_at: "2026-01-02T00:00:00.000Z",
          scope_id: "default",
          snippet: "Please review",
          status: "new",
          status_set_by: null,
          subject: "Hello",
          tenant_id: "t1",
          thread_id: "thread-1",
          to_emails: ["me@engenty.com"],
          updated_at: "2026-01-02T00:00:00.000Z",
          user_classification: null,
        },
      ],
    };

    const snapshot = buildInboxThreadSnapshot(detail);
    expect(snapshot).toEqual({
      id: "thread-1",
      subject: "Hello",
      participants: ["ap@acme.com"],
      message_count: 1,
      last_message_at: "2026-01-02T00:00:00.000Z",
      latest_status: "new",
      latest_from: "AP",
      latest_snippet: "Please review",
    });
    expect(JSON.stringify(snapshot)).not.toContain("secret body");
    expect(JSON.stringify(snapshot)).not.toContain("body_html");
  });
});
