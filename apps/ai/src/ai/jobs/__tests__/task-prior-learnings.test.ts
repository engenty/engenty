// Prior-learnings brief section: project memories + the assignee's own
// lessons, deduped, token-capped, and fail-open.

import { describe, expect, it } from "vitest";
import {
  buildPriorLearningsSection,
  entityRefsFromContexts,
} from "../task-prior-learnings.js";

function row(overrides: Record<string, unknown> = {}) {
  return {
    agent_type_key: null,
    body_md: "Body text.",
    kind: "decision",
    scope_kind: "project",
    scope_ref: "proj-1",
    slug: "use-staging-first",
    title: "Deploy to staging first",
    ...overrides,
  };
}

describe("entityRefsFromContexts", () => {
  it("maps dotted context types verbatim and fans out bare contacts", () => {
    expect(
      entityRefsFromContexts([
        { context_id: "c1", context_type: "contact" },
        { context_id: "i1", context_type: "invoices.invoice" },
        { context_id: "p1", context_type: "project" },
        { context_id: "", context_type: "contact" },
      ])
    ).toEqual([
      "contacts.person:c1",
      "contacts.organisation:c1",
      "invoices.invoice:i1",
    ]);
  });
});

describe("buildPriorLearningsSection", () => {
  it("renders project memories and the assignee's lessons", async () => {
    const calls: Array<{ input: unknown; op: string }> = [];
    const section = await buildPriorLearningsSection({
      agentTypeKey: "contacts.manager",
      contexts: [
        { context_id: "proj-1", context_type: "project" },
        { context_id: "c-9", context_type: "contact" },
      ],
      invoke: async (op, input) => {
        calls.push({ input, op });
        const filter = input as { kind?: string; scope_kind?: string };
        if (filter.scope_kind === "project") {
          return { rows: [row()] };
        }
        if (filter.kind === "lesson") {
          return {
            rows: [
              row({
                agent_type_key: "contacts.manager",
                kind: "lesson",
                scope_kind: "user",
                scope_ref: "u-1",
                slug: "linkedin-rate-limits",
                title: "LinkedIn enrichment rate limits",
              }),
              row({
                agent_type_key: "other.agent",
                kind: "lesson",
                slug: "not-mine",
                title: "Someone else's lesson",
              }),
            ],
          };
        }
        return { rows: [] };
      },
    });
    expect(section).toContain("## Prior learnings");
    expect(section).toContain("[decision] Deploy to staging first");
    expect(section).toContain("[lesson] LinkedIn enrichment rate limits");
    expect(section).not.toContain("Someone else's lesson");
    // Only the project context queries a project scope; the contact context
    // is not a project.
    const projectCalls = calls.filter(
      (call) => (call.input as { scope_kind?: string }).scope_kind === "project"
    );
    expect(projectCalls).toHaveLength(1);
  });

  it("dedupes records that show up through multiple paths", async () => {
    const lesson = row({
      agent_type_key: "a1",
      kind: "lesson",
      slug: "same-slug",
    });
    const section = await buildPriorLearningsSection({
      agentTypeKey: "a1",
      contexts: [{ context_id: "proj-1", context_type: "project" }],
      invoke: async (_op, input) => {
        const filter = input as { kind?: string; scope_kind?: string };
        if (filter.scope_kind === "project" || filter.kind === "lesson") {
          return { rows: [lesson] };
        }
        return { rows: [] };
      },
    });
    expect((section.match(/- \[lesson\]/g) ?? []).length).toBe(1);
  });

  it("injects approved org memories, highest-confidence first, capped at 8", async () => {
    const orgRows = [
      row({
        confidence: "low",
        kind: "guideline",
        slug: "g-low",
        title: "Low",
        scope_kind: "org",
        scope_ref: null,
      }),
      row({
        confidence: "high",
        kind: "guideline",
        slug: "g-high",
        title: "High",
        scope_kind: "org",
        scope_ref: null,
      }),
      ...Array.from({ length: 10 }, (_, index) =>
        row({
          confidence: "medium",
          kind: "guideline",
          scope_kind: "org",
          scope_ref: null,
          slug: `g-med-${index}`,
          title: `Med ${index}`,
        })
      ),
    ];
    const section = await buildPriorLearningsSection({
      agentTypeKey: "a1",
      contexts: [],
      invoke: async (_op, input) =>
        (input as { scope_kind?: string }).scope_kind === "org"
          ? { rows: orgRows }
          : { rows: [] },
    });
    const lines = section.split("\n").filter((line) => line.startsWith("- ["));
    expect(lines).toHaveLength(8);
    expect(lines[0]).toContain("High");
    expect(section).not.toContain("Low");
  });

  it("returns empty when there is nothing, and on errors (fail-open)", async () => {
    expect(
      await buildPriorLearningsSection({
        agentTypeKey: "a1",
        contexts: [],
        invoke: async () => ({ rows: [] }),
      })
    ).toBe("");
    expect(
      await buildPriorLearningsSection({
        agentTypeKey: "a1",
        contexts: [{ context_id: "p1", context_type: "project" }],
        invoke: async () => {
          throw new Error("memory module down");
        },
      })
    ).toBe("");
  });

  it("caps the section length", async () => {
    const rows = Array.from({ length: 50 }, (_, index) =>
      row({
        body_md: "x".repeat(500),
        slug: `record-${index}`,
        title: `Record ${index}`,
      })
    );
    const section = await buildPriorLearningsSection({
      agentTypeKey: "a1",
      contexts: [{ context_id: "p1", context_type: "project" }],
      invoke: async (_op, input) =>
        (input as { scope_kind?: string }).scope_kind === "project"
          ? { rows }
          : { rows: [] },
    });
    expect(section.length).toBeLessThanOrEqual(6000);
  });
});
