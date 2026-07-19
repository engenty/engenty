import { describe, expect, it, vi } from "vitest";
import {
  composeNotificationEmail,
  type DueNotification,
  type EmailNotifierDeps,
  parseInboxThreadId,
  runEmailNotifierOnce,
} from "./email-notifier.js";

const RECORD: DueNotification = {
  createdAt: "2026-07-20T00:00:00Z",
  id: "n-1",
  payload: {
    conversation_label: "#waff-website-support",
    route: "/mdl/team-chat/conv-1?ts=1.2",
    text_preview: "Hallo von engenty",
  },
  summary: "Mentioned in #waff-website-support: Hallo von engenty",
  threadId: "inbox:tenant-1:user-1",
};

function deps(overrides: Partial<EmailNotifierDeps> = {}): EmailNotifierDeps {
  return {
    invoke: vi.fn(async (operationId: string) =>
      operationId === "connections_list_accounts"
        ? { accounts: [{ connection_id: "c1" }] }
        : { sent: true }
    ),
    listDue: vi.fn(async () => [RECORD]),
    lookupUserEmail: vi.fn(async () => "user@example.com"),
    markEmailed: vi.fn(async () => {
      // recorded via mock calls
    }),
    serviceTenantId: vi.fn(async () => "tenant-1"),
    ...overrides,
  };
}

describe("parseInboxThreadId", () => {
  it("parses per-user threads and rejects team/foreign shapes", () => {
    expect(parseInboxThreadId("inbox:t1:u1")).toEqual({
      tenantId: "t1",
      userId: "u1",
    });
    expect(parseInboxThreadId("inbox:t1")).toBeNull();
    expect(parseInboxThreadId("other:t1:u1")).toBeNull();
  });
});

describe("composeNotificationEmail", () => {
  it("builds subject with channel label and body with preview + link", () => {
    const mail = composeNotificationEmail(RECORD, "https://app.example/");
    expect(mail.subject).toBe(
      "[#waff-website-support] Mentioned in #waff-website-support: Hallo von engenty"
    );
    expect(mail.body_text).toContain("Hallo von engenty");
    expect(mail.body_text).toContain(
      "https://app.example/mdl/team-chat/conv-1?ts=1.2"
    );
  });

  it("falls back to the summary without payload context", () => {
    const mail = composeNotificationEmail(
      { payload: null, summary: "New direct message" },
      undefined
    );
    expect(mail.subject).toBe("New direct message");
    expect(mail.body_text).toContain("New direct message");
  });
});

describe("runEmailNotifierOnce", () => {
  it("sends due records via gmail_send_message and marks them", async () => {
    const d = deps();
    const summary = await runEmailNotifierOnce(d);
    expect(summary).toEqual({ failed: 0, sent: 1, skipped: 0 });
    expect(d.invoke).toHaveBeenCalledWith(
      "gmail_send_message",
      expect.objectContaining({ to: ["user@example.com"] })
    );
    expect(d.markEmailed).toHaveBeenCalledWith("n-1", RECORD.threadId, true);
  });

  it("is a quiet no-op without a gmail connection", async () => {
    const invoke = vi.fn(async () => ({ accounts: [] }));
    const d = deps({ invoke });
    const summary = await runEmailNotifierOnce(d);
    expect(summary).toEqual({ failed: 0, sent: 0, skipped: 0 });
    expect(invoke).toHaveBeenCalledTimes(1); // only the accounts probe
  });

  it("skips foreign tenants and marks send failures terminal", async () => {
    const d = deps({
      listDue: vi.fn(async () => [
        { ...RECORD, id: "n-2", threadId: "inbox:other-tenant:u9" },
        RECORD,
      ]),
      invoke: vi.fn(async (operationId: string) => {
        if (operationId === "connections_list_accounts") {
          return { accounts: [{ connection_id: "c1" }] };
        }
        throw new Error("connection_approval_pending");
      }),
    });
    const summary = await runEmailNotifierOnce(d);
    expect(summary).toEqual({ failed: 1, sent: 0, skipped: 1 });
    expect(d.markEmailed).toHaveBeenCalledWith("n-1", RECORD.threadId, false);
  });
});
