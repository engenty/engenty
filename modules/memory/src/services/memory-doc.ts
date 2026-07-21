// The memory document projection (Phase 6): each scope reads and edits as
// ONE continuous markdown document while rows in module_memory.records stay
// the source of truth. These are the pure halves of that contract:
//
//   projectRecordsToDoc  — records → deterministic doc model (a ## section
//                          per kind, one block per record)
//   diffMemoryDoc        — edited doc + loaded snapshot → create/update/
//                          archive ops (deleted block = archive, never
//                          hard-delete)
//
// The TipTap layer renders/edits the doc model; identity rides on block
// attrs, invisible to the reader. Round-trip law: an unedited projection
// diffs to zero ops.

import type { MemoryKind, MemoryRecord } from "../schema/zod.js";

/** Section order in the document — mirrors how people scan a notebook. */
export const MEMORY_DOC_KIND_ORDER: MemoryKind[] = [
  "preference",
  "fact",
  "lesson",
  "decision",
  "guideline",
];

export const MEMORY_DOC_SECTION_TITLES: Record<MemoryKind, string> = {
  decision: "Decisions",
  fact: "Facts",
  guideline: "Guidelines",
  lesson: "Lessons",
  preference: "Preferences",
};

/** One record block as the editor sees it. `recordId: null` ⇒ typed as new. */
export interface MemoryDocBlock {
  agentTypeKey: string | null;
  bodyMd: string;
  kind: MemoryKind;
  recordId: string | null;
  slug: string | null;
  sourceKind: string;
  status: string;
  title: string;
  /** Optimistic-concurrency token — the row's updated_at when loaded. */
  updatedAt: string | null;
  updatedBy?: string | null;
}

export interface MemoryDocSection {
  blocks: MemoryDocBlock[];
  kind: MemoryKind;
  title: string;
}

export type MemoryDocOp =
  | {
      op: "create";
      kind: MemoryKind;
      title: string;
      bodyMd: string;
      slug: string;
    }
  | {
      op: "update";
      recordId: string;
      slug: string;
      kind: MemoryKind;
      title: string;
      bodyMd: string;
      /** updated_at token of the loaded snapshot — server 409s on mismatch. */
      updatedAt: string | null;
    }
  | { op: "archive"; recordId: string };

function toBlock(record: MemoryRecord): MemoryDocBlock {
  return {
    agentTypeKey: record.agent_type_key,
    bodyMd: record.body_md,
    kind: record.kind,
    recordId: record.id,
    slug: record.slug,
    sourceKind: record.source_kind,
    status: record.status,
    title: record.title,
    updatedAt: record.updated_at,
    updatedBy: (record as { updated_by?: string | null }).updated_by ?? null,
  };
}

/**
 * Deterministic projection: sections in fixed kind order (empty sections
 * dropped), blocks sorted by slug for stability across reloads. Proposed
 * records render (amber, approval actions); archived ones never do.
 */
export function projectRecordsToDoc(
  records: MemoryRecord[]
): MemoryDocSection[] {
  const sections: MemoryDocSection[] = [];
  for (const kind of MEMORY_DOC_KIND_ORDER) {
    const blocks = records
      .filter((record) => record.kind === kind && record.status !== "archived")
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map(toBlock);
    if (blocks.length > 0) {
      sections.push({
        blocks,
        kind,
        title: MEMORY_DOC_SECTION_TITLES[kind],
      });
    }
  }
  return sections;
}

/** Slug for a record typed as new text: generated from the title. */
export function slugFromTitle(title: string, taken: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 52) || "note";
  const padded = base.length >= 3 ? base : `${base}-note`;
  if (!taken.has(padded)) {
    return padded;
  }
  for (let index = 2; ; index++) {
    const candidate = `${padded}-${index}`.slice(0, 60);
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

function contentChanged(
  block: MemoryDocBlock,
  snapshot: MemoryDocBlock
): boolean {
  return (
    block.title.trim() !== snapshot.title.trim() ||
    block.bodyMd.trim() !== snapshot.bodyMd.trim() ||
    block.kind !== snapshot.kind
  );
}

/**
 * Diff the edited doc against the loaded snapshot into gateway ops.
 * - block without recordId → create (slug from title, kind from its section)
 * - edited block → update under the same slug, carrying the updated_at token
 * - block missing from the doc → archive
 * No edits ⇒ no ops (the round-trip law).
 */
export function diffMemoryDoc(
  doc: MemoryDocBlock[],
  snapshot: MemoryDocBlock[]
): MemoryDocOp[] {
  const ops: MemoryDocOp[] = [];
  const snapshotById = new Map(
    snapshot
      .filter((block) => block.recordId)
      .map((block) => [block.recordId as string, block])
  );
  const taken = new Set(
    [...snapshot, ...doc]
      .map((block) => block.slug)
      .filter((slug): slug is string => Boolean(slug))
  );
  const seenIds = new Set<string>();

  for (const block of doc) {
    const title = block.title.trim();
    const bodyMd = block.bodyMd.trim();
    if (!block.recordId) {
      if (!(title || bodyMd)) {
        continue; // an empty stub block is not a record
      }
      const slug = block.slug ?? slugFromTitle(title || bodyMd, taken);
      taken.add(slug);
      ops.push({
        bodyMd: bodyMd || title,
        kind: block.kind,
        op: "create",
        slug,
        title: title || bodyMd.slice(0, 120),
      });
      continue;
    }
    seenIds.add(block.recordId);
    const loaded = snapshotById.get(block.recordId);
    if (!loaded) {
      continue; // unknown id — refuse to guess, let a reload reconcile
    }
    if (contentChanged(block, loaded)) {
      ops.push({
        bodyMd,
        kind: block.kind,
        op: "update",
        recordId: block.recordId,
        slug: loaded.slug ?? "",
        title,
        updatedAt: loaded.updatedAt,
      });
    }
  }

  for (const loaded of snapshot) {
    if (loaded.recordId && !seenIds.has(loaded.recordId)) {
      ops.push({ op: "archive", recordId: loaded.recordId });
    }
  }
  return ops;
}
