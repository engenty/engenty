import { describe, expect, it } from "vitest";
import type { InboxMessage } from "../schema/types.js";
import { applyCategoryMap, coerceCategoryMap } from "./message-classify.js";

function stubMessage(id: string): InboxMessage {
  return {
    ai_category: null,
    attachments_json: [],
    body_html: null,
    body_text: null,
    cc_emails: [],
    classification: null,
    classification_reason: null,
    connection_id: "conn",
    created_at: "2026-01-01T00:00:00.000Z",
    from_email: "a@example.com",
    from_name: "A",
    has_attachments: false,
    id,
    owner_user_id: null,
    provider_message_id: id,
    provider_thread_id: null,
    received_at: "2026-01-01T00:00:00.000Z",
    scope_id: "default",
    snippet: "hi",
    status: "new",
    status_set_by: null,
    subject: "Hello",
    tenant_id: "tenant",
    thread_id: "thread",
    to_emails: [],
    updated_at: "2026-01-01T00:00:00.000Z",
    user_classification: null,
  };
}

describe("coerceCategoryMap", () => {
  it("accepts the bare index map small models emit", () => {
    expect(
      coerceCategoryMap({
        "0": "conversation",
        "1": "newsletter",
      })
    ).toEqual({ "0": "conversation", "1": "newsletter" });
  });

  it("accepts { categories: map }", () => {
    expect(
      coerceCategoryMap({
        categories: { "0": "spam", "1": "promotion" },
      })
    ).toEqual({ "0": "spam", "1": "promotion" });
  });

  it("accepts { categories: [{ index, category }] }", () => {
    expect(
      coerceCategoryMap({
        categories: [
          { index: 1, category: "newsletter" },
          { index: 0, category: "conversation" },
        ],
      })
    ).toEqual({ "0": "conversation", "1": "newsletter" });
  });

  it("accepts { categories: string[] } in index order", () => {
    expect(
      coerceCategoryMap({
        categories: ["notification", "spam"],
      })
    ).toEqual({ "0": "notification", "1": "spam" });
  });

  it("returns null for unusable payloads", () => {
    expect(coerceCategoryMap(null)).toBeNull();
    expect(coerceCategoryMap({ categories: [] })).toBeNull();
    expect(coerceCategoryMap({ foo: "bar" })).toBeNull();
  });
});

describe("applyCategoryMap", () => {
  it("maps index keys onto message ids and defaults missing to conversation", () => {
    const batch = [stubMessage("a"), stubMessage("b"), stubMessage("c")];
    const mapped = applyCategoryMap(batch, {
      "0": "spam",
      "2": "newsletter",
    });
    expect(mapped.get("a")).toBe("spam");
    expect(mapped.get("b")).toBe("conversation");
    expect(mapped.get("c")).toBe("newsletter");
  });
});
