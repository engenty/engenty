// @vitest-environment happy-dom
// The RichEditor serializes the WHOLE doc to markdown on every onUpdate
// (getEditorMarkdown). The memoryRecord node must survive that — via the
// markdown extension's fallback renderers — or typing in the document would
// throw on the first keystroke.

import { getBaseExtensions } from "@engenty/tiptap-editor";
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "../../src/schema/zod.js";
import { projectRecordsToDoc } from "../../src/services/memory-doc.js";
import { MemoryRecordNode } from "./memory-record-node.js";
import { blocksToDocJson } from "./tiptap-doc.js";

function record(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "m1",
    tenant_id: "t",
    scope_id: "default",
    scope_kind: "user",
    scope_ref: "u",
    kind: "preference",
    slug: "s-one",
    title: "Title one",
    body_md: "Body line one.\n\n- bullet a\n- bullet b",
    source_kind: "agent",
    agent_type_key: "engenty.copilot",
    confidence: "high",
    status: "active",
    supersedes: null,
    created_by: "u",
    updated_by: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-20T00:00:00Z",
    ...overrides,
  };
}

describe("memoryRecord node in a live editor", () => {
  it("loads the projected doc and serializes markdown without throwing", () => {
    const doc = blocksToDocJson(projectRecordsToDoc([record()]));
    const editor = new Editor({
      content: doc,
      element: null as never,
      extensions: [...getBaseExtensions(), MemoryRecordNode],
    });
    try {
      const json = editor.getJSON();
      const recordNodes = (json.content ?? []).filter(
        (node) => node.type === "memoryRecord"
      );
      expect(recordNodes).toHaveLength(1);
      expect(recordNodes[0]?.attrs?.recordId).toBe("m1");
      // The onUpdate path: markdown serialization of the whole doc.
      const markdownCapable = editor as unknown as {
        getMarkdown?: () => string;
        markdown?: { serialize: (json: unknown) => string };
      };
      const markdown =
        typeof markdownCapable.getMarkdown === "function"
          ? markdownCapable.getMarkdown()
          : (markdownCapable.markdown?.serialize(editor.getJSON()) ?? "");
      expect(typeof markdown).toBe("string");
      expect(markdown).toContain("Title one");
    } finally {
      editor.destroy();
    }
  });
});
