// TipTap JSON ↔ memory doc-model conversions (memory Phase 6).
//
//   blocksToDocJson  — sections/blocks → one editor document: a plain h2 per
//                      kind section, one memoryRecord node per record
//                      (h3 title + body content from markdown)
//   docJsonToBlocks  — editor JSON → MemoryDocBlock[]: memoryRecord nodes map
//                      back via their attrs; loose content typed between
//                      blocks becomes NEW records under the enclosing section
//
// diffMemoryDoc (src/services/memory-doc.ts) then turns blocks vs snapshot
// into gateway ops — the document stays a view, rows stay the truth.

import type { JSONContent } from "@engenty/tiptap-editor";
import { jsonToMarkdown, markdownToJson } from "@engenty/tiptap-editor";
import type { MemoryKind } from "../../src/schema/zod.js";
import type {
  MemoryDocBlock,
  MemoryDocSection,
} from "../../src/services/memory-doc.js";
import {
  MEMORY_DOC_KIND_ORDER,
  MEMORY_DOC_SECTION_TITLES,
} from "../../src/services/memory-doc.js";

const TITLE_BY_KIND = MEMORY_DOC_SECTION_TITLES;
const KIND_BY_TITLE = new Map<string, MemoryKind>(
  Object.entries(TITLE_BY_KIND).map(([kind, title]) => [
    title.toLowerCase(),
    kind as MemoryKind,
  ])
);

function textOf(node: JSONContent | undefined): string {
  if (!node) {
    return "";
  }
  if (node.type === "text") {
    return node.text ?? "";
  }
  return (node.content ?? []).map(textOf).join("");
}

function chipFor(block: MemoryDocBlock): string {
  const who =
    block.sourceKind === "human"
      ? "you"
      : (block.agentTypeKey ?? block.sourceKind);
  const day = block.updatedAt
    ? new Date(block.updatedAt).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
      })
    : "";
  const parts = [who, day];
  if (block.updatedBy && block.sourceKind !== "human") {
    parts.push("edited");
  }
  if (block.status === "proposed") {
    parts.push("awaiting approval");
  }
  return parts.filter(Boolean).join(" · ");
}

function bodyContent(bodyMd: string): JSONContent[] {
  const parsed = markdownToJson(bodyMd);
  const content = parsed.content ?? [];
  return content.length > 0
    ? content
    : [{ type: "paragraph" }];
}

function recordNode(block: MemoryDocBlock): JSONContent {
  return {
    attrs: {
      agentTypeKey: block.agentTypeKey,
      chip: chipFor(block),
      kind: block.kind,
      recordId: block.recordId,
      slug: block.slug,
      sourceKind: block.sourceKind,
      status: block.status,
      updatedAt: block.updatedAt,
      updatedBy: block.updatedBy ?? null,
    },
    content: [
      {
        attrs: { level: 3 },
        content: block.title
          ? [{ text: block.title, type: "text" }]
          : [],
        type: "heading",
      },
      ...bodyContent(block.bodyMd),
    ],
    type: "memoryRecord",
  };
}

export function blocksToDocJson(sections: MemoryDocSection[]): JSONContent {
  const content: JSONContent[] = [];
  for (const section of sections) {
    content.push({
      attrs: { level: 2 },
      content: [{ text: section.title, type: "text" }],
      type: "heading",
    });
    for (const block of section.blocks) {
      content.push(recordNode(block));
    }
  }
  if (content.length === 0) {
    // An empty scope still renders every section heading so there is a
    // place to type the first record of each kind.
    for (const kind of MEMORY_DOC_KIND_ORDER) {
      content.push({
        attrs: { level: 2 },
        content: [{ text: TITLE_BY_KIND[kind], type: "text" }],
        type: "heading",
      });
      content.push({ type: "paragraph" });
    }
  }
  return { content, type: "doc" };
}

function looseRunToBlock(
  run: JSONContent[],
  kind: MemoryKind
): MemoryDocBlock | null {
  const markdown = jsonToMarkdown({ content: run, type: "doc" }).trim();
  if (!markdown) {
    return null;
  }
  const firstLine = markdown.split("\n")[0]?.replace(/^#+\s*/, "") ?? "";
  return {
    agentTypeKey: null,
    bodyMd: markdown,
    kind,
    recordId: null,
    slug: null,
    sourceKind: "human",
    status: "active",
    title: firstLine.slice(0, 120),
    updatedAt: null,
    updatedBy: null,
  };
}

export function docJsonToBlocks(doc: JSONContent): MemoryDocBlock[] {
  const blocks: MemoryDocBlock[] = [];
  let currentKind: MemoryKind = MEMORY_DOC_KIND_ORDER[0] ?? "fact";
  let looseRun: JSONContent[] = [];

  const flushLoose = () => {
    if (looseRun.length === 0) {
      return;
    }
    const block = looseRunToBlock(looseRun, currentKind);
    if (block) {
      blocks.push(block);
    }
    looseRun = [];
  };

  for (const node of doc.content ?? []) {
    if (node.type === "heading" && (node.attrs?.level ?? 0) <= 2) {
      flushLoose();
      const mapped = KIND_BY_TITLE.get(textOf(node).trim().toLowerCase());
      if (mapped) {
        currentKind = mapped;
      }
      continue;
    }
    if (node.type === "memoryRecord") {
      flushLoose();
      const attrs = (node.attrs ?? {}) as Record<string, unknown>;
      const [titleNode, ...rest] = node.content ?? [];
      blocks.push({
        agentTypeKey: (attrs.agentTypeKey as string | null) ?? null,
        bodyMd: jsonToMarkdown({ content: rest, type: "doc" }).trim(),
        kind: (attrs.kind as MemoryKind) ?? currentKind,
        recordId: (attrs.recordId as string | null) ?? null,
        slug: (attrs.slug as string | null) ?? null,
        sourceKind: (attrs.sourceKind as string) ?? "human",
        status: (attrs.status as string) ?? "active",
        title: textOf(titleNode).trim(),
        updatedAt: (attrs.updatedAt as string | null) ?? null,
        updatedBy: (attrs.updatedBy as string | null) ?? null,
      });
      continue;
    }
    looseRun.push(node);
  }
  flushLoose();
  return blocks;
}
