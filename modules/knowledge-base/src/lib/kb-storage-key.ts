/**
 * The ONE place a knowledge-base object key is rooted (PLAN-spaces.md §1b).
 *
 * KB bytes used to key at `tenants/<t>/knowledge-base/<slug>/…` — above the
 * space boundary — while `module_kb.knowledge_bases` carried a `space_id`. The
 * row said space, the bytes said tenant, and `scripts/check-space-storage-scope.mjs`
 * recorded the split as debt across four files. Four files meant four chances
 * to root a new writer wrong, so the root now lives here and the call sites ask
 * for a key rather than building one.
 *
 * A space is a PATH SEGMENT, not merely a foreign key: a space-scoped engenty
 * cannot address another space's KB media because no path leads there.
 *
 * The `<slug>` segment is kept for continuity with existing keys and readable
 * storage browsing. It is a rename hazard — renaming a KB changes its slug and
 * orphans its bytes — but that hazard predates spaces and is not this change's
 * to fix; note it here so the next person sees it.
 */
import { fileStorageSpaceObjectKey } from "@engenty/file-storage";

export const KB_STORAGE_MODULE_FOLDER = "knowledge-base" as const;

/** The identifying fields every KB key needs. `space_id` is `not null`. */
export interface KbStorageOwner {
  id: string;
  slug?: string | null;
  space_id: string;
  tenant_id: string;
}

function kbSegment(kb: KbStorageOwner): string {
  return kb.slug?.trim() || kb.id;
}

/**
 * `tenants/<t>/spaces/<s>/knowledge-base/<slug>/…`
 *
 * @example kbStorageKey(kb, "covers", "cover.png")
 * @example kbStorageKey(kb, "sources", sourceId, "items", itemId, "media", name)
 */
export function kbStorageKey(
  kb: KbStorageOwner,
  ...pathSegments: string[]
): string {
  return fileStorageSpaceObjectKey(
    kb.tenant_id,
    kb.space_id,
    KB_STORAGE_MODULE_FOLDER,
    kbSegment(kb),
    ...pathSegments
  );
}

/**
 * The prefix every one of a KB's objects starts with — the ownership test
 * behind "is this key mine?" checks. Built from {@link kbStorageKey} rather
 * than assembled separately, so the two can never disagree about the root.
 */
export function kbStoragePrefix(kb: KbStorageOwner): string {
  return kbStorageKey(kb);
}

/** True when `key` addresses bytes belonging to this knowledge base. */
export function isKbStorageKey(kb: KbStorageOwner, key: string): boolean {
  return key.startsWith(`${kbStoragePrefix(kb)}/`);
}
