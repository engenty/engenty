import type { MastraDBMessage } from "@mastra/core/memory";
import { describe, expect, it } from "vitest";
import {
  expandIncludeWindows,
  filterMessagesForRecall,
  paginateRecallMessages,
  sqlDateBoundsFromFilter,
  unionRecallPageWithIncludes,
} from "../list-messages-recall.js";

const threadId = "00000000-0000-4000-8000-000000000003";

function makeMessage(input: {
  createdAt: string;
  id: string;
  metadata?: Record<string, unknown>;
  resourceId?: string;
}): MastraDBMessage {
  return {
    content: {
      format: 2,
      metadata: input.metadata ?? {},
      parts: [{ text: input.id, type: "text" }],
    },
    createdAt: new Date(input.createdAt),
    id: input.id,
    role: "user",
    threadId,
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
  };
}

describe("listMessages recall helpers", () => {
  it("maps inclusive dateRange to SQL gte/lte bounds", () => {
    const start = new Date("2025-01-01T00:00:00.000Z");
    const end = new Date("2025-06-01T00:00:00.000Z");
    expect(sqlDateBoundsFromFilter({ end, start })).toEqual({
      after: start,
      before: end,
    });
  });

  it("passes exclusive date flags through to SQL", () => {
    const start = new Date("2025-01-01T00:00:00.000Z");
    expect(
      sqlDateBoundsFromFilter({
        end: new Date("2025-06-01T00:00:00.000Z"),
        endExclusive: true,
        start,
        startExclusive: true,
      })
    ).toMatchObject({
      after: start,
      afterExclusive: true,
      beforeExclusive: true,
    });
  });

  it("filters by date range inclusively", () => {
    const messages = [
      makeMessage({ createdAt: "2024-12-31T00:00:00.000Z", id: "a" }),
      makeMessage({ createdAt: "2025-01-01T00:00:00.000Z", id: "b" }),
      makeMessage({ createdAt: "2025-06-01T00:00:00.000Z", id: "c" }),
      makeMessage({ createdAt: "2025-06-02T00:00:00.000Z", id: "d" }),
    ];
    const filtered = filterMessagesForRecall(messages, {
      conversationResourceIds: [threadId],
      dateRange: {
        end: new Date("2025-06-01T00:00:00.000Z"),
        start: new Date("2025-01-01T00:00:00.000Z"),
      },
    });
    expect(filtered.map((message) => message.id)).toEqual(["b", "c"]);
  });

  it("matches shallow metadata with AND semantics", () => {
    const billing = makeMessage({
      createdAt: "2025-02-01T00:00:00.000Z",
      id: "billing",
      metadata: {
        archivedAt: null,
        category: "billing",
        escalated: true,
        priority: 2,
      },
    });
    const other = makeMessage({
      createdAt: "2025-02-02T00:00:00.000Z",
      id: "other",
      metadata: { category: "billing", escalated: false, priority: 2 },
    });
    const filtered = filterMessagesForRecall([billing, other], {
      conversationResourceIds: [threadId],
      metadata: {
        archivedAt: null,
        category: "billing",
        escalated: true,
        priority: 2,
      },
    });
    expect(filtered.map((message) => message.id)).toEqual(["billing"]);
  });

  it("does not treat a missing metadata key as null", () => {
    const missing = makeMessage({
      createdAt: "2025-02-01T00:00:00.000Z",
      id: "missing",
      metadata: { category: "billing" },
    });
    const explicit = makeMessage({
      createdAt: "2025-02-02T00:00:00.000Z",
      id: "explicit",
      metadata: { archivedAt: null, category: "billing" },
    });
    const filtered = filterMessagesForRecall([missing, explicit], {
      conversationResourceIds: [threadId],
      metadata: { archivedAt: null },
    });
    expect(filtered.map((message) => message.id)).toEqual(["explicit"]);
  });

  it("does not drop turns when resourceId is the space, not the speaker", () => {
    const spaceId = "00000000-0000-4000-8000-0000000000aa";
    const speakerId = "00000000-0000-4000-8000-0000000000bb";
    const userTurn = makeMessage({
      createdAt: "2025-02-01T00:00:00.000Z",
      id: "user",
      resourceId: speakerId,
    });
    const assistantTurn = makeMessage({
      createdAt: "2025-02-01T00:00:01.000Z",
      id: "assistant",
    });
    const filtered = filterMessagesForRecall([userTurn, assistantTurn], {
      conversationResourceIds: [threadId, spaceId],
      resourceId: spaceId,
    });
    expect(filtered.map((message) => message.id)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("rejects invalid metadata filter keys", () => {
    expect(() =>
      filterMessagesForRecall([], {
        conversationResourceIds: [threadId],
        metadata: { "category-billing": "x" },
      })
    ).toThrow(TypeError);
    expect(() =>
      filterMessagesForRecall([], {
        conversationResourceIds: [threadId],
        metadata: { constructor: "x" },
      })
    ).toThrow(TypeError);
  });

  it("paginates with Mastra's default of 40 and perPage false", () => {
    const messages = Array.from({ length: 5 }, (_, index) =>
      makeMessage({
        createdAt: `2025-01-0${index + 1}T00:00:00.000Z`,
        id: `m${index}`,
      })
    );
    const page0 = paginateRecallMessages({
      messages,
      orderBy: { direction: "ASC", field: "createdAt" },
      page: 0,
      perPage: 2,
    });
    expect(page0.paginated.map((message) => message.id)).toEqual(["m0", "m1"]);
    expect(page0.total).toBe(5);
    expect(page0.hasMore).toBe(true);

    const all = paginateRecallMessages({
      messages,
      orderBy: { direction: "ASC", field: "createdAt" },
      perPage: false,
    });
    expect(all.paginated).toHaveLength(5);
    expect(all.hasMore).toBe(false);
    expect(all.perPage).toBe(false);
  });

  it("unions include neighbor windows after the page", () => {
    const messages = [0, 1, 2, 3, 4].map((index) =>
      makeMessage({
        createdAt: `2025-01-0${index + 1}T00:00:00.000Z`,
        id: `m${index}`,
      })
    );
    const page = paginateRecallMessages({
      include: [{ id: "m3", withNextMessages: 1, withPreviousMessages: 1 }],
      messages,
      orderBy: { direction: "ASC", field: "createdAt" },
      page: 0,
      perPage: 2,
    });
    const included = expandIncludeWindows({
      conversationResourceIds: [threadId],
      include: [{ id: "m3", withNextMessages: 1, withPreviousMessages: 1 }],
      messagesById: new Map(messages.map((message) => [message.id, message])),
      orderedByThread: new Map([[threadId, messages]]),
    });
    const merged = unionRecallPageWithIncludes({
      included,
      orderBy: { direction: "ASC", field: "createdAt" },
      paginated: page.paginated,
    });
    expect(page.paginated.map((message) => message.id)).toEqual(["m0", "m1"]);
    expect(merged.map((message) => message.id)).toEqual([
      "m0",
      "m1",
      "m2",
      "m3",
      "m4",
    ]);
    expect(page.total).toBe(5);
  });
});
