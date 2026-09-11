/**
 * The "what goes into each article" switches, shared by both authored
 * ingestion scopes.
 *
 * These are checkboxes rather than a mode radio because the axes are genuinely
 * independent: a page can carry a summary and the full text, and questions or
 * the original attach to either. Options that cannot apply to the current
 * scope are hidden rather than disabled — an unreachable control is noise.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Check } from "lucide-react";

export interface KbIngestContentOptions {
  attachOriginal: boolean;
  includeFullContent: boolean;
  includeQuestions: boolean;
  includeSummary: boolean;
  splitLongArticles: boolean;
}

export function OptionCheckbox({
  checked,
  description,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
        checked ? "border-primary bg-primary/5" : "border-border bg-card",
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-muted/40"
      )}
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
          checked && "border-primary bg-primary text-primary-foreground"
        )}
      >
        {checked ? <Check className="h-3 w-3" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-snug">{label}</span>
        <span className="block text-muted-foreground text-xs leading-snug">
          {description}
        </span>
      </span>
    </button>
  );
}

export function SourceIngestOptions({
  onChange,
  perSource,
  templateHasStructure,
  value,
}: {
  onChange: (next: KbIngestContentOptions) => void;
  /** True for the "one article for the whole source" scope. */
  perSource: boolean;
  /** A structured template can carry the body on its own. */
  templateHasStructure: boolean;
  value: KbIngestContentOptions;
}) {
  const { t } = useTranslation("kb");
  const set = (patch: Partial<KbIngestContentOptions>) =>
    onChange({ ...value, ...patch });

  // An article needs a body. With no template structure to fall back on, the
  // last remaining content source cannot be switched off.
  const onlyBodySource =
    !templateHasStructure &&
    [value.includeFullContent, value.includeSummary].filter(Boolean).length ===
      1;

  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">{t("sources.ingest_content_title")}</p>
      <div className="grid gap-2">
        <OptionCheckbox
          checked={value.includeFullContent}
          description={
            perSource
              ? t("sources.ingest_opt_full_content_desc_source")
              : t("sources.ingest_opt_full_content_desc_entry")
          }
          disabled={value.includeFullContent && onlyBodySource}
          label={t("sources.ingest_opt_full_content")}
          onToggle={() =>
            set({
              includeFullContent: !value.includeFullContent,
              // Splitting only ever applies to the full text.
              splitLongArticles: value.includeFullContent
                ? false
                : value.splitLongArticles,
            })
          }
        />
        <OptionCheckbox
          checked={value.includeSummary}
          description={t("sources.ingest_opt_summary_desc")}
          disabled={value.includeSummary && onlyBodySource}
          label={t("sources.ingest_opt_summary")}
          onToggle={() => set({ includeSummary: !value.includeSummary })}
        />
        {value.includeFullContent ? (
          <OptionCheckbox
            checked={value.splitLongArticles}
            description={
              perSource
                ? t("sources.ingest_opt_split_desc_source")
                : t("sources.ingest_opt_split_desc_entry")
            }
            label={t("sources.ingest_opt_split")}
            onToggle={() =>
              set({ splitLongArticles: !value.splitLongArticles })
            }
          />
        ) : null}
        <OptionCheckbox
          checked={value.includeQuestions}
          description={t("sources.ingest_opt_questions_desc")}
          label={t("sources.ingest_opt_questions")}
          onToggle={() => set({ includeQuestions: !value.includeQuestions })}
        />
        <OptionCheckbox
          checked={value.attachOriginal}
          description={
            perSource
              ? t("sources.ingest_opt_original_desc_source")
              : t("sources.ingest_opt_original_desc_entry")
          }
          label={t("sources.ingest_opt_original")}
          onToggle={() => set({ attachOriginal: !value.attachOriginal })}
        />
      </div>
    </div>
  );
}
