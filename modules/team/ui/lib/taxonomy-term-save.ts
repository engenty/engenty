import type { TaxonomyTermDraft } from "../components/team-taxonomy-terms-section.js";

/** Slug from display label — same rules as KB category names. */
export function slugifyTaxonomyTermLabel(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/** Manual slug edits — used outside settings (e.g. quick-create role). */
export function sanitizeTaxonomyTermSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64);
}

export function resolveTaxonomyTermSlug(draft: {
  label: string;
  term_slug?: string;
}): string {
  const manual = draft.term_slug?.trim()
    ? sanitizeTaxonomyTermSlug(draft.term_slug)
    : "";
  if (manual) {
    return manual;
  }
  return slugifyTaxonomyTermLabel(draft.label);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | null | undefined): v is string =>
  typeof v === "string" && UUID_RE.test(v);

/**
 * Convert UI drafts to the PUT /terms upsert body.
 *
 * Every draft._key is a UUID (persisted terms use their server UUID; new terms
 * get a fresh crypto.randomUUID()). We always send id: _key so the backend can
 * UPDATE existing rows and INSERT new ones with the client-chosen UUID.
 *
 * parent_term_id is the parent's _key — also always a UUID — so the backend
 * correctly links children to parents even when both parent and child are new
 * in the same save batch.
 */
export function draftsToTaxonomyTermsForSave(
  drafts: Array<
    TaxonomyTermDraft & { _key: string; parent_term_id?: string | null }
  >
) {
  const terms: Array<{
    id: string;
    term_slug: string;
    label: string;
    parent_term_id: string | null;
    sort_order: number;
  }> = [];

  for (const draft of drafts) {
    const label = draft.label.trim();
    if (!label) {
      continue;
    }
    const term_slug = slugifyTaxonomyTermLabel(label);
    if (!term_slug) {
      continue;
    }

    // _key is always a UUID; use it as id so the backend can upsert by UUID.
    const id = draft._key ?? draft.id;
    // parent_term_id is also a _key → always a UUID or null.
    const parent_term_id = isUuid(draft.parent_term_id)
      ? draft.parent_term_id
      : null;

    terms.push({
      id,
      term_slug,
      label,
      parent_term_id,
      sort_order: terms.length,
    });
  }

  return terms;
}
