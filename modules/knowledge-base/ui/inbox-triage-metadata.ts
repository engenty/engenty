/**
 * Parsed triage_metadata for inbox detail (v1 + v2). Read-only UI contract.
 */

export interface KbTriageDuplicateRef {
  id: string;
  rationale?: string;
  title: string;
}

export interface KbTriageSuggestedTag {
  id: string;
  label: string;
}

export interface KbTriageMetadataV1 {
  duplicate_article_ids?: KbTriageDuplicateRef[];
  notes?: string;
  suggested_parent_article_id?: string | null;
  suggested_tags?: KbTriageSuggestedTag[];
  version: 1;
}

export interface KbTriagePromoteStepDraft {
  content_markdown?: string;
  parent_article_id?: string | null;
  parent_step_index?: number;
  role?: "parent" | "child";
  title: string;
  update_article_id?: string | null;
}

export interface KbTriagePlacementV2 {
  parent_article_id?: string | null;
}

export interface KbTriageMetadataV2 {
  duplicate_article_ids?: KbTriageDuplicateRef[];
  notes?: string;
  placement?: KbTriagePlacementV2;
  /** Which planned step becomes `inbox.promoted_article_id` (default 0). */
  primary_step_index?: number;
  promote_steps?: KbTriagePromoteStepDraft[];
  suggested_parent_article_id?: string | null;
  suggested_tags?: KbTriageSuggestedTag[];
  version: 2;
}

export type ParsedKbTriageMetadata = KbTriageMetadataV1 | KbTriageMetadataV2;

export function parseKbTriageMetadata(
  raw: unknown
): ParsedKbTriageMetadata | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (o.version === 2) {
    return o as KbTriageMetadataV2;
  }
  if (o.version === 1) {
    return o as KbTriageMetadataV1;
  }
  return null;
}

export function buildPromoteBatchBodyFromTriageV2(
  meta: KbTriageMetadataV2
): { primary_index: number; steps: Record<string, unknown>[] } | null {
  const rawSteps = (meta.promote_steps ?? []).filter((s) => s.title?.trim());
  if (rawSteps.length === 0) {
    return null;
  }
  const placement = meta.placement ?? {};
  const steps = rawSteps.map((s) => {
    const row: Record<string, unknown> = {
      title: s.title,
      content_markdown: s.content_markdown ?? null,
      status: "draft",
    };
    if (s.update_article_id) {
      row.update_article_id = s.update_article_id;
    }
    if (s.parent_step_index !== undefined) {
      row.parent_step_index = s.parent_step_index;
    } else if (s.parent_article_id != null && s.parent_article_id !== "") {
      row.parent_article_id = s.parent_article_id;
    } else if (
      placement.parent_article_id != null &&
      placement.parent_article_id !== ""
    ) {
      row.parent_article_id = placement.parent_article_id;
    }
    return row;
  });
  const primary_index = Math.min(
    Math.max(0, meta.primary_step_index ?? 0),
    steps.length - 1
  );
  return { primary_index, steps };
}
