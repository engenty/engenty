import type { StreamPullCtx } from "@engenty/connections-sdk";
import { describe, expect, it } from "vitest";
import { gmailConnector } from "./connectors/gmail.js";

const pull = gmailConnector.stream?.pull;
if (!pull) {
  throw new Error("gmail connector must declare a messages stream");
}

function b64url(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64url");
}

function rawMessage(id: string, labelIds: string[] = ["INBOX"]) {
  return {
    id,
    internalDate: "1751600000000",
    labelIds,
    payload: {
      headers: [
        { name: "From", value: "Alice <alice@x.com>" },
        { name: "To", value: "office@x.com" },
        { name: "Cc", value: "bob@x.com" },
        { name: "Subject", value: `Hello ${id}` },
      ],
      mimeType: "multipart/mixed",
      parts: [
        { body: { data: b64url(`text ${id}`) }, mimeType: "text/plain" },
        {
          body: { data: b64url(`<p>html ${id}</p>`) },
          mimeType: "text/html",
        },
        {
          body: { attachmentId: "att-1", size: 123 },
          filename: "a.pdf",
          headers: [{ name: "Content-ID", value: "<cid-1>" }],
          mimeType: "application/pdf",
        },
      ],
    },
    threadId: `t-${id}`,
  };
}

type Route = (url: URL) => { body: unknown; status?: number } | null;

function makeCtx(
  route: Route,
  extras: Partial<StreamPullCtx> = {}
): { ctx: StreamPullCtx; requests: URL[] } {
  const requests: URL[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    const match = route(url);
    if (!match) {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify(match.body), {
      headers: { "Content-Type": "application/json" },
      status: match.status ?? 200,
    });
  }) as typeof fetch;
  return {
    ctx: {
      accessToken: "tok",
      connection: { id: "c-1" } as StreamPullCtx["connection"],
      fetchImpl,
      log: () => undefined,
      ...extras,
    },
    requests,
  };
}

const PROFILE = "/gmail/v1/users/me/profile";
const MESSAGES = "/gmail/v1/users/me/messages";
const HISTORY = "/gmail/v1/users/me/history";

describe("gmail stream pull", () => {
  it("backfills on a null cursor and hands over an incremental cursor", async () => {
    const { ctx, requests } = makeCtx((url) => {
      if (url.pathname === PROFILE) {
        return { body: { historyId: "1000" } };
      }
      if (url.pathname === MESSAGES) {
        return { body: { messages: [{ id: "m-1" }, { id: "m-2" }] } };
      }
      if (url.pathname.startsWith(`${MESSAGES}/`)) {
        const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
        return { body: rawMessage(id) };
      }
      return null;
    });
    const result = await pull(ctx, null);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBe("1000");
    expect(result.items.map((i) => i.provider_message_id)).toEqual([
      "m-1",
      "m-2",
    ]);
    const first = result.items[0];
    expect(first).toMatchObject({
      body_html: "<p>html m-1</p>",
      body_text: "text m-1",
      cc: ["bob@x.com"],
      from_email: "alice@x.com",
      from_name: "Alice",
      provider_thread_id: "t-m-1",
      subject: "Hello m-1",
      to: ["office@x.com"],
    });
    expect(first.attachments).toEqual([
      {
        attachment_id: "att-1",
        content_id: "<cid-1>",
        filename: "a.pdf",
        mime_type: "application/pdf",
        size: 123,
      },
    ]);
    const listUrl = requests.find((u) => u.pathname === MESSAGES);
    expect(listUrl?.searchParams.get("q")).toBe(
      "newer_than:30d -in:chats -in:draft"
    );
  });

  it("continues a paginated backfill through the cursor", async () => {
    const { ctx } = makeCtx((url) => {
      if (url.pathname === PROFILE) {
        return { body: { historyId: "1000" } };
      }
      if (url.pathname === MESSAGES) {
        return url.searchParams.get("pageToken") === "pt-2"
          ? { body: { messages: [{ id: "m-2" }] } }
          : {
              body: { messages: [{ id: "m-1" }], nextPageToken: "pt-2" },
            };
      }
      if (url.pathname.startsWith(`${MESSAGES}/`)) {
        const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
        return { body: rawMessage(id) };
      }
      return null;
    });
    const page1 = await pull(ctx, null);
    expect(page1.hasMore).toBe(true);
    expect(page1.items.map((i) => i.provider_message_id)).toEqual(["m-1"]);
    expect(page1.nextCursor).toContain("backfill");

    const page2 = await pull(ctx, page1.nextCursor);
    expect(page2.hasMore).toBe(false);
    expect(page2.items.map((i) => i.provider_message_id)).toEqual(["m-2"]);
    expect(page2.nextCursor).toBe("1000");
  });

  it("uses the since window for the backfill query", async () => {
    const { ctx, requests } = makeCtx(
      (url) => {
        if (url.pathname === PROFILE) {
          return { body: { historyId: "1000" } };
        }
        if (url.pathname === MESSAGES) {
          return { body: {} };
        }
        return null;
      },
      { since: "2026-07-01T00:00:00.000Z" }
    );
    await pull(ctx, null);
    const listUrl = requests.find((u) => u.pathname === MESSAGES);
    expect(listUrl?.searchParams.get("q")).toBe(
      `after:${Math.floor(Date.parse("2026-07-01T00:00:00.000Z") / 1000)} -in:chats -in:draft`
    );
  });

  it("pulls incrementally from a historyId cursor, skipping drafts", async () => {
    const { ctx, requests } = makeCtx((url) => {
      if (url.pathname === HISTORY) {
        return {
          body: {
            history: [
              {
                id: "1100",
                messagesAdded: [
                  { message: rawMessage("m-3") },
                  { message: rawMessage("m-draft", ["DRAFT"]) },
                ],
              },
            ],
            historyId: "1200",
          },
        };
      }
      if (url.pathname.startsWith(`${MESSAGES}/`)) {
        const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
        return { body: rawMessage(id) };
      }
      return null;
    });
    const result = await pull(ctx, "1000");
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBe("1200");
    expect(result.items.map((i) => i.provider_message_id)).toEqual(["m-3"]);
    const historyUrl = requests.find((u) => u.pathname === HISTORY);
    expect(historyUrl?.searchParams.get("startHistoryId")).toBe("1000");
    expect(historyUrl?.searchParams.get("historyTypes")).toBe("messageAdded");
  });

  it("stops at the limit on a record boundary so no history is skipped", async () => {
    const { ctx } = makeCtx((url) => {
      if (url.pathname === HISTORY) {
        return {
          body: {
            history: [
              { id: "1100", messagesAdded: [{ message: rawMessage("m-1") }] },
              { id: "1150", messagesAdded: [{ message: rawMessage("m-2") }] },
            ],
            historyId: "1200",
          },
        };
      }
      if (url.pathname.startsWith(`${MESSAGES}/`)) {
        const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
        return { body: rawMessage(id) };
      }
      return null;
    });
    const result = await pull({ ...ctx, limit: 1 }, "1000");
    expect(result.items.map((i) => i.provider_message_id)).toEqual(["m-1"]);
    expect(result.hasMore).toBe(true);
    // resumes AFTER the consumed record, not at the mailbox head
    expect(result.nextCursor).toBe("1100");
  });

  it("falls back to Delivered-To when the To header is empty", async () => {
    const { ctx } = makeCtx((url) => {
      if (url.pathname === PROFILE) {
        return { body: { historyId: "1000" } };
      }
      if (url.pathname === MESSAGES) {
        return { body: { messages: [{ id: "m-groups" }] } };
      }
      if (url.pathname.startsWith(`${MESSAGES}/`)) {
        return {
          body: {
            ...rawMessage("m-groups"),
            payload: {
              headers: [
                {
                  name: "From",
                  value: "'GitHub' via support <support@engrd.at>",
                },
                { name: "Delivered-To", value: "matthias@engrd.at" },
                { name: "Subject", value: "GitHub notification" },
              ],
              mimeType: "text/plain",
              body: { data: b64url("body") },
            },
          },
        };
      }
      return null;
    });
    const result = await pull(ctx, null);
    expect(result.items[0]?.to).toEqual(["matthias@engrd.at"]);
  });

  it("reports an expired cursor as a typed error message", async () => {
    const { ctx } = makeCtx((url) =>
      url.pathname === HISTORY ? { body: { error: "gone" }, status: 404 } : null
    );
    await expect(pull(ctx, "999")).rejects.toThrow(
      /gmail_stream_cursor_expired/
    );
  });
});
