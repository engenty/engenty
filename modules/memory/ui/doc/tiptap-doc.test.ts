// @vitest-environment happy-dom
// TipTap doc-model round trip: blocks → editor JSON → blocks keeps record
// identity and content, loose typed text becomes new blocks under the
// enclosing section, and the full projection round trip diffs to zero ops.

import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "../../src/schema/zod.js";
import {
  diffMemoryDoc,
  projectRecordsToDoc,
} from "../../src/services/memory-doc.js";
import { blocksToDocJson, docJsonToBlocks } from "./tiptap-doc.js";

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
    body_md: "A plain body line.",
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

describe("tiptap doc round trip", () => {
  it("blocks → doc json → blocks keeps identity and diffs to zero ops", () => {
    const records = [
      record({ kind: "preference", slug: "short-emails", title: "Short emails" }),
      record({ kind: "lesson", slug: "rate-limits", title: "Rate limits" }),
      record({
        kind: "guideline",
        scope_kind: "org",
        scope_ref: null,
        slug: "org-tone",
        status: "proposed",
        title: "Org tone",
      }),
    ];
    const sections = projectRecordsToDoc(records);
    const docJson = blocksToDocJson(sections);
    const roundTripped = docJsonToBlocks(docJson);
    const snapshot = sections.flatMap((section) => section.blocks);
    expect(roundTripped.map((block) => block.recordId)).toEqual(
      snapshot.map((block) => block.recordId)
    );
    expect(roundTripped.map((block) => block.title)).toEqual(
      snapshot.map((block) => block.title)
    );
    expect(diffMemoryDoc(roundTripped, snapshot)).toEqual([]);
  });

  it("loose text under a section heading becomes a new block of that kind", () => {
    const sections = projectRecordsToDoc([
      record({ kind: "lesson", slug: "existing", title: "Existing lesson" }),
    ]);
    const docJson = blocksToDocJson(sections);
    docJson.content = [
      ...(docJson.content ?? []),
      {
        content: [{ text: "Always check the audit log first.", type: "text" }],
        type: "paragraph",
      },
    ];
    const blocks = docJsonToBlocks(docJson);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({
      kind: "lesson",
      recordId: null,
      title: "Always check the audit log first.",
    });
    const ops = diffMemoryDoc(
      blocks,
      sections.flatMap((section) => section.blocks)
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "lesson", op: "create" });
  });

  it("renders every section heading for an empty scope", () => {
    const docJson = blocksToDocJson([]);
    const headings = (docJson.content ?? []).filter(
      (node) => node.type === "heading"
    );
    expect(headings).toHaveLength(5);
    expect(docJsonToBlocks(docJson)).toEqual([]);
  });
});
