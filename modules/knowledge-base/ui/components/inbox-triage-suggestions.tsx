/**
 * Read-only inbox triage suggestions (metadata v1 fields + v2 promote checklist).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Label } from "@engenty/ui-core";
import type { ParsedKbTriageMetadata } from "../inbox-triage-metadata.js";
import {
  buildPromoteBatchBodyFromTriageV2,
  parseKbTriageMetadata,
} from "../inbox-triage-metadata.js";
import { articleDetailQueryOptions } from "../queries.js";

function SuggestedParentArticleLabel(props: { articleId: string }) {
  const q = useQuery({
    ...articleDetailQueryOptions(props.articleId),
    retry: false,
  });
  if (q.isLoading) {
    return <span className="text-muted-foreground text-xs">…</span>;
  }
  if (q.isError || !q.data) {
    return <span className="font-mono text-xs">{props.articleId}</span>;
  }
  return (
    <span className="text-muted-foreground">
      {(q.data as { title?: string }).title ?? props.articleId}
    </span>
  );
}

function hasV1SuggestionContent(meta: ParsedKbTriageMetadata): boolean {
  const dup = meta.duplicate_article_ids ?? [];
  const tags = meta.suggested_tags ?? [];
  const notes = "notes" in meta && meta.notes?.trim();
  const par =
    "suggested_parent_article_id" in meta &&
    meta.suggested_parent_article_id != null &&
    meta.suggested_parent_article_id !== "";
  return Boolean(dup.length || tags.length || notes || par);
}

export function inboxTriageHasRenderableSuggestions(
  triage_metadata: Record<string, unknown> | null
): boolean {
  const meta = parseKbTriageMetadata(triage_metadata);
  if (!meta) {
    return false;
  }
  if (meta.version === 2 && (meta.promote_steps?.length ?? 0) > 0) {
    return true;
  }
  return hasV1SuggestionContent(meta);
}

export function getPromoteBatchDraftFromItem(
  triage_metadata: Record<string, unknown> | null
): ReturnType<typeof buildPromoteBatchBodyFromTriageV2> | null {
  const meta = parseKbTriageMetadata(triage_metadata);
  if (meta?.version !== 2) {
    return null;
  }
  return buildPromoteBatchBodyFromTriageV2(meta);
}

export function InboxTriageSuggestions(props: {
  triage_metadata: Record<string, unknown> | null;
}) {
  const { t } = useTranslation("kb");
  const meta = parseKbTriageMetadata(props.triage_metadata);
  if (!meta) {
    return null;
  }

  const v2Steps = meta.version === 2 ? (meta.promote_steps ?? []) : [];
  const showV2Plan = meta.version === 2 && v2Steps.length > 0;
  const showV1Block = hasV1SuggestionContent(meta);

  if (!(showV2Plan || showV1Block)) {
    return null;
  }

  const suggestedParentArticleId =
    "suggested_parent_article_id" in meta &&
    meta.suggested_parent_article_id &&
    meta.suggested_parent_article_id.trim()
      ? meta.suggested_parent_article_id
      : null;

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
      <p className="font-medium">{t("inbox.triage_suggestions")}</p>

      {showV2Plan ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {t("inbox.triage_v2_plan_intro")}
          </p>
          <ol className="list-decimal space-y-2 pl-4">
            {v2Steps.map((step, idx) => (
              <li key={`${step.title}-${idx}`}>
                <span className="font-medium">{step.title}</span>
                {step.role ? (
                  <span className="text-muted-foreground"> ({step.role})</span>
                ) : null}
                {step.parent_step_index === undefined ? null : (
                  <div className="text-muted-foreground text-xs">
                    {t("inbox.triage_step_parent_step", {
                      index: step.parent_step_index + 1,
                    })}
                  </div>
                )}
                {step.parent_article_id ? (
                  <div className="text-muted-foreground text-xs">
                    {t("inbox.suggested_parent_article_id")}:{" "}
                    <SuggestedParentArticleLabel
                      articleId={step.parent_article_id}
                    />
                  </div>
                ) : null}
                {step.update_article_id ? (
                  <div className="font-mono text-muted-foreground text-xs">
                    {t("inbox.triage_step_update_article")}:{" "}
                    {step.update_article_id}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {showV1Block ? (
        <div
          className={
            showV2Plan ? "space-y-2 border-border border-t pt-2" : "space-y-2"
          }
        >
          {meta.notes?.trim() ? (
            <p className="text-muted-foreground">{meta.notes}</p>
          ) : null}
          {(meta.suggested_tags ?? []).length > 0 ? (
            <ul className="list-inside list-disc text-muted-foreground">
              {(meta.suggested_tags ?? []).map((tag) => (
                <li key={tag.id}>{tag.label}</li>
              ))}
            </ul>
          ) : null}
          {(meta.duplicate_article_ids ?? []).length > 0 ? (
            <ul className="list-inside list-disc text-muted-foreground">
              {(meta.duplicate_article_ids ?? []).map((d) => (
                <li key={d.id}>
                  {d.title}
                  {d.rationale ? ` — ${d.rationale}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {suggestedParentArticleId ? (
            <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
              <Label className="text-muted-foreground text-xs">
                {t("inbox.suggested_parent_article_id")}
              </Label>
              <SuggestedParentArticleLabel
                articleId={suggestedParentArticleId}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
