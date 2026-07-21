// The document projection contract (Phase 6):
//   - deterministic sections (kind order, slug-sorted blocks, archived out)
//   - the round-trip law: an unedited projection diffs to ZERO ops
//   - edits map to create / update (with concurrency token) / archive

import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "../schema/zod.js";
import {
  diffMemoryDoc,
  type MemoryDocBlock,
  projectRecordsToDoc,
  slugFromTitle,
} from "./memory-doc.js";

function record(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: `id-${overrides.slug ?? "x"}`,
    tenant_id: "t1",
    scope_id: "default",
    scope_kind: "user",
    scope_ref: "u1",
    kind: "fact",
    slug: "some-fact",
    title: "Some fact",
    body_md: "Body.",
    source_kind: "agent",
    agent_type_key: "engenty.copilot",
    confidence: "medium",
    status: "active",
    supersedes: null,
    created_by: "u1",
    updated_by: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-20T00:00:00Z",
    ...overrides,
  };
}

function flatten(records: MemoryRecord[]): MemoryDocBlock[] {
  return projectRecordsToDoc(records).flatMap((section) => section.blocks);
}

describe("projectRecordsToDoc", () => {
  it("groups by kind in fixed order, sorts by slug, drops archived", () => {
    const sections = projectRecordsToDoc([
      record({ kind: "decision", slug: "b-decision" }),
      record({ kind: "preference", slug: "z-pref" }),
      record({ kind: "preference", slug: "a-pref" }),
      record({ kind: "fact", slug: "gone", status: "archived" }),
      record({ kind: "guideline", slug: "org-rule", status: "proposed" }),
    ]);
    expect(sections.map((section) => section.kind)).toEqual([
      "preference",
      "decision",
      "guideline",
    ]);
    expect(sections[0]?.blocks.map((block) => block.slug)).toEqual([
      "a-pref",
      "z-pref",
    ]);
    // Proposed blocks render (the approval queue lives in the doc).
    expect(sections[2]?.blocks[0]?.status).toBe("proposed");
  });
});

describe("diffMemoryDoc — the round-trip law", () => {
  it("an unedited projection produces zero ops", () => {
    const records = [
      record({ kind: "preference", slug: "short-emails" }),
      record({ kind: "lesson", slug: "rate-limits" }),
      record({ kind: "guideline", slug: "org-tone", status: "proposed" }),
    ];
    const doc = flatten(records);
    expect(diffMemoryDoc(doc, flatten(records))).toEqual([]);
  });

  it("maps edits to update ops carrying the loaded updated_at token", () => {
    const snapshot = flatten([record({ slug: "short-emails" })]);
    const doc = snapshot.map((block) => ({
      ...block,
      bodyMd: "New truth.",
    }));
    expect(diffMemoryDoc(doc, snapshot)).toEqual([
      {
        bodyMd: "New truth.",
        kind: "fact",
        op: "update",
        recordId: "id-short-emails",
        slug: "short-emails",
        title: "Some fact",
        updatedAt: "2026-07-20T00:00:00Z",
      },
    ]);
  });

  it("maps new blocks to create ops with a generated slug", () => {
    const snapshot = flatten([record({ kind: "lesson", slug: "existing" })]);
    const doc: MemoryDocBlock[] = [
      ...snapshot,
      {
        agentTypeKey: null,
        bodyMd: "Always check the rate limit header.",
        kind: "lesson",
        recordId: null,
        slug: null,
        sourceKind: "human",
        status: "active",
        title: "Watch the rate limit",
        updatedAt: null,
      },
    ];
    const ops = diffMemoryDoc(doc, snapshot);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: "lesson",
      op: "create",
      slug: "watch-the-rate-limit",
      title: "Watch the rate limit",
    });
  });

  it("maps deleted blocks to archive ops and ignores empty stubs", () => {
    const snapshot = flatten([
      record({ slug: "keep-me" }),
      record({ slug: "delete-me" }),
    ]);
    const doc: MemoryDocBlock[] = [
      ...snapshot.filter((block) => block.slug !== "delete-me"),
      {
        agentTypeKey: null,
        bodyMd: "",
        kind: "fact",
        recordId: null,
        slug: null,
        sourceKind: "human",
        status: "active",
        title: "  ",
        updatedAt: null,
      },
    ];
    expect(diffMemoryDoc(doc, snapshot)).toEqual([
      { op: "archive", recordId: "id-delete-me" },
    ]);
  });
});

describe("slugFromTitle", () => {
  it("kebab-cases and de-duplicates", () => {
    const taken = new Set<string>(["prefers-brief-emails"]);
    expect(slugFromTitle("Prefers brief emails!", taken)).toBe(
      "prefers-brief-emails-2"
    );
    expect(slugFromTitle("Ünïcode Ärger", new Set())).toBe("unicode-arger");
    expect(slugFromTitle("", new Set())).toBe("note");
  });
});
