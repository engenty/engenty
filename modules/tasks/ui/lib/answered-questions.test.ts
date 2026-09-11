import { describe, expect, it } from "vitest";
import type { TaskComment } from "../../src/schema/types.js";
import {
  quoteQuestion,
  resolveAnsweredQuestions,
} from "./answered-questions.js";

function comment(input: {
  agent?: string;
  at: string;
  content?: string;
  id: string;
  kind?: TaskComment["kind"];
  user?: string;
}): TaskComment {
  return {
    content: input.content ?? input.id,
    created_at: input.at,
    created_by_agent_type_key: input.agent ?? null,
    created_by_user_id: input.user ?? null,
    id: input.id,
    kind: input.kind ?? "note",
    metadata: {},
    scope_id: "scope-1",
    task_id: "task-1",
    tenant_id: "tenant-1",
  };
}

describe("resolveAnsweredQuestions", () => {
  it("pairs a question with the next comment from somebody else", () => {
    const q = comment({
      agent: "engenty.coordinator",
      at: "2026-08-17T10:00:00Z",
      id: "q1",
      kind: "question",
    });
    const a = comment({ at: "2026-08-17T10:05:00Z", id: "a1", user: "u1" });
    const pairs = resolveAnsweredQuestions([q, a]);
    expect(pairs.get("a1")).toBe(q);
  });

  it("does not pair the agent's own follow-up with its own question", () => {
    const pairs = resolveAnsweredQuestions([
      comment({
        agent: "engenty.coordinator",
        at: "2026-08-17T10:00:00Z",
        id: "q1",
        kind: "question",
      }),
      comment({
        agent: "engenty.coordinator",
        at: "2026-08-17T10:01:00Z",
        id: "p1",
        kind: "progress",
      }),
      comment({ at: "2026-08-17T10:05:00Z", id: "a1", user: "u1" }),
    ]);
    expect(pairs.has("p1")).toBe(false);
    expect(pairs.get("a1")?.id).toBe("q1");
  });

  it("lets a second question SUPERSEDE the first rather than answer it", () => {
    const pairs = resolveAnsweredQuestions([
      comment({
        agent: "engenty.coordinator",
        at: "2026-08-17T10:00:00Z",
        id: "q1",
        kind: "question",
      }),
      comment({
        agent: "engenty.coordinator",
        at: "2026-08-17T10:01:00Z",
        id: "q2",
        kind: "question",
      }),
      comment({ at: "2026-08-17T10:05:00Z", id: "a1", user: "u1" }),
    ]);
    expect(pairs.size).toBe(1);
    expect(pairs.get("a1")?.id).toBe("q2");
  });

  it("only the FIRST reply answers — later comments are their own", () => {
    const pairs = resolveAnsweredQuestions([
      comment({
        agent: "engenty.coordinator",
        at: "2026-08-17T10:00:00Z",
        id: "q1",
        kind: "question",
      }),
      comment({ at: "2026-08-17T10:05:00Z", id: "a1", user: "u1" }),
      comment({ at: "2026-08-17T10:06:00Z", id: "a2", user: "u1" }),
    ]);
    expect(pairs.has("a2")).toBe(false);
  });

  it("leaves an unanswered question unpaired", () => {
    const pairs = resolveAnsweredQuestions([
      comment({
        agent: "engenty.coordinator",
        at: "2026-08-17T10:00:00Z",
        id: "q1",
        kind: "question",
      }),
    ]);
    expect(pairs.size).toBe(0);
  });

  it("orders by created_at rather than trusting list order", () => {
    const q = comment({
      agent: "engenty.coordinator",
      at: "2026-08-17T10:00:00Z",
      id: "q1",
      kind: "question",
    });
    const a = comment({ at: "2026-08-17T10:05:00Z", id: "a1", user: "u1" });
    expect(resolveAnsweredQuestions([a, q]).get("a1")).toBe(q);
  });
});

describe("quoteQuestion", () => {
  it("keeps the first line only — the rest is the agent's context", () => {
    expect(
      quoteQuestion("Wie heißt du?\n\nDamit ich dich begrüßen kann.")
    ).toBe("Wie heißt du?");
  });

  it("truncates a long line", () => {
    expect(quoteQuestion("x".repeat(200), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
