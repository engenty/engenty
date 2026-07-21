// The memoryRecord TipTap block node (memory Phase 6). One record = one
// block: a title line (heading) + free markdown body. The reader sees a
// bordered, titled paragraph group with a provenance chip; the node attrs
// carry everything needed to sync back to the row — invisible in the text.
//
// isolating: true — backspace at a block edge can never merge two records
// into one; a block is deleted whole (which the diff maps to archive).

import { mergeAttributes, Node } from "@tiptap/core";

export interface MemoryRecordAttrs {
  agentTypeKey: string | null;
  chip: string;
  kind: string;
  recordId: string | null;
  slug: string | null;
  sourceKind: string;
  status: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const MemoryRecordNode = Node.create({
  name: "memoryRecord",
  group: "block",
  // Title line + body — enforced shape; body allows paragraphs and lists.
  content: "heading block*",
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      recordId: { default: null },
      slug: { default: null },
      kind: { default: "fact" },
      status: { default: "active" },
      sourceKind: { default: "human" },
      agentTypeKey: { default: null },
      updatedAt: { default: null },
      updatedBy: { default: null },
      // Pre-rendered provenance label ("copilot · 12 Jul · edited by you"),
      // shown via CSS ::after on the wrapper.
      chip: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-memory-record]" }];
  },

  // The RichEditor serializes the whole doc to markdown on every update; a
  // record block renders as its children (title heading + body) so the
  // markdown view of the document stays readable instead of dropping blocks.
  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node.content ?? [], "\n\n");
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "memory-record-block",
        "data-memory-record": "true",
        "data-chip": String(node.attrs.chip ?? ""),
        "data-status": String(node.attrs.status ?? "active"),
        "data-source": String(node.attrs.sourceKind ?? "human"),
      }),
      0,
    ];
  },
});
