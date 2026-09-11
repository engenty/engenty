/**
 * "Analyze" — the answer to a blank instructions box.
 *
 * Writing an agentic authoring brief asks the user to describe a structure
 * before they have read what the crawl actually returned. So the analyzer
 * reads a sample and drafts the brief; the user edits a proposal instead of
 * inventing one. Nothing is written to the KB, so re-running is free.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation } from "@engenty/query-client";
import { Button, Input } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { analyzeKbSource, type KbSourceAnalysis } from "../api.js";

export function SourceAnalyzeProposal({
  disabled,
  onApply,
  sourceId,
}: {
  disabled?: boolean;
  /** Hands the drafted brief to the instructions field. */
  onApply: (instructions: string) => void;
  sourceId: string;
}) {
  const { t } = useTranslation("kb");
  const [hint, setHint] = useState("");
  const [analysis, setAnalysis] = useState<KbSourceAnalysis | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: () =>
      analyzeKbSource(sourceId, { hint: hint.trim() || undefined }),
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("sources.analyze_failed")
      );
    },
    onSuccess: (result) => setAnalysis(result),
  });

  return (
    <div className="space-y-3 rounded-lg border border-dashed bg-background p-3">
      <div className="space-y-1">
        <p className="font-medium text-sm">{t("sources.analyze_title")}</p>
        <p className="text-muted-foreground text-xs">
          {t("sources.analyze_desc")}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          className="h-8 text-sm"
          disabled={disabled || analyzeMutation.isPending}
          onChange={(event) => setHint(event.target.value)}
          placeholder={t("sources.analyze_hint_placeholder")}
          value={hint}
        />
        <Button
          className="shrink-0"
          disabled={disabled || analyzeMutation.isPending}
          onClick={() => analyzeMutation.mutate()}
          size="sm"
          type="button"
          variant="outline"
        >
          {analyzeMutation.isPending ? (
            <>
              <AnimatedLoaderIcon className="mr-1" play="always" size="sm" />
              {t("sources.analyze_running")}
            </>
          ) : (
            <>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {t("sources.analyze_run")}
            </>
          )}
        </Button>
      </div>

      {analysis ? (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm leading-snug">{analysis.overview}</p>
          <p className="text-muted-foreground text-xs">
            {t("sources.analyze_sampled", {
              sampled: analysis.sampled_items,
              total: analysis.total_items,
            })}
          </p>
          {analysis.concepts.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium text-xs">
                {t("sources.analyze_concepts")}
              </p>
              <p className="text-muted-foreground text-xs leading-snug">
                {t("sources.analyze_concepts_desc")}
              </p>
              <ul className="space-y-1">
                {analysis.concepts.map((concept) => (
                  <li className="text-xs leading-snug" key={concept.name}>
                    <span className="font-medium">{concept.name}</span>
                    <span className="text-muted-foreground">
                      {" — "}
                      {concept.claim}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {analysis.pages.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium text-xs">
                {t("sources.analyze_pages")}
              </p>
              <ul className="space-y-1">
                {analysis.pages.map((page) => (
                  <li
                    className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs"
                    key={`${page.category}-${page.title}`}
                  >
                    <span className="font-medium">{page.title}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {page.category}
                    </span>
                    <span className="block text-muted-foreground leading-snug">
                      {page.rationale}
                    </span>
                    {page.covers.length > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {page.covers.map((name) => (
                          <span
                            className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                            key={name}
                          >
                            {name}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {/* No pages means the analyzer found nothing to build from — its
              "brief" would just say so, and offering it as one is a trap. */}
          {analysis.pages.length > 0 ? (
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  onApply(analysis.suggested_instructions);
                  toast.success(t("sources.analyze_applied"));
                }}
                size="sm"
                type="button"
              >
                {t("sources.analyze_apply")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
