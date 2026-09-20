import { describe, expect, it } from "vitest";
import type { InboxMessage } from "../schema/types.js";
import {
  applyCategoryMap,
  buildCategoryQuestions,
  categoriesFromAnswers,
  classifyInboxMessages,
} from "./message-classify.js";

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

describe("buildCategoryQuestions", () => {
  it("asks one choice per message with the tenant rules as criteria", () => {
    const { questions, state } = buildCategoryQuestions(
      [stubMessage("a"), stubMessage("b")],
      [
        {
          order: 0,
          rule: "real correspondence",
          slug: "conversation",
          visible: true,
        },
        { order: 1, rule: "vendor pitches", slug: "vendor", visible: true },
      ]
    );
    expect(Object.keys(questions)).toEqual(["m0", "m1"]);
    expect(questions.m1?.type).toBe("choice");
    expect(questions.m1?.criteria).toEqual({
      conversation: "real correspondence",
      vendor: "vendor pitches",
    });
    expect(state.messages.map((m) => m.index)).toEqual([0, 1]);
    expect(state.messages[0]).toMatchObject({
      from_email: "a@example.com",
      subject: "Hello",
    });
  });

  it("fills a fixed slug's rule in when the tenant left it empty", () => {
    const { questions } = buildCategoryQuestions(
      [stubMessage("a")],
      [{ order: 0, slug: "spam", visible: true }]
    );
    expect(String(questions.m0?.criteria.spam)).toMatch(/phishing/);
  });
});

describe("categoriesFromAnswers", () => {
  const allow = ["conversation", "newsletter"];
  it("keeps confident, well-formed answers and drops the rest", () => {
    const out = categoriesFromAnswers(
      {
        m0: {
          choice: "newsletter",
          confidence: 0.9,
          probabilities: { conversation: 0.1, newsletter: 0.9 },
          type: "choice",
        },
        // below the floor
        m1: {
          choice: "newsletter",
          confidence: 0.3,
          probabilities: { conversation: 0.45, newsletter: 0.55 },
          type: "choice",
        },
        // names a slug that was not offered
        m2: {
          choice: "promotion",
          confidence: 0.9,
          probabilities: { promotion: 0.9, newsletter: 0.1 },
          type: "choice",
        },
      },
      4,
      allow
    );
    expect(out).toEqual({ "0": "newsletter" });
  });
});

describe("classifyInboxMessages with Jev", () => {
  it("batches through the client and falls back to conversation on a miss", async () => {
    const calls: unknown[] = [];
    const jev = {
      systemOne: async (request: unknown) => {
        calls.push(request);
        return {
          answers: {
            m0: {
              choice: "newsletter",
              confidence: 0.95,
              probabilities: { conversation: 0.05, newsletter: 0.95 },
              type: "choice",
            },
          },
          model: "jev-test",
        };
      },
    } as unknown as import("@engenty/typesafe-client").TypeSafeClient;
    const result = await classifyInboxMessages(
      [stubMessage("a"), stubMessage("b")],
      jev,
      [
        { order: 0, slug: "conversation", visible: true },
        { order: 1, slug: "newsletter", visible: true },
      ]
    );
    expect(calls).toHaveLength(1);
    expect(result.get("a")).toBe("newsletter");
    expect(result.get("b")).toBe("conversation");
  });

  it("refuses to run without a classifier", async () => {
    await expect(
      classifyInboxMessages([stubMessage("a")], null)
    ).rejects.toThrow("inbox_classifier_unavailable");
  });
});
