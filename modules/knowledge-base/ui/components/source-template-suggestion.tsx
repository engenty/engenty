/**
 * "Suggest a template" — the answer to a blank template picker.
 *
 * Picking a template before reading the crawl asks the user to describe a
 * shape they have not seen yet. This reads a sample of the entries, proposes
 * the skeleton and the typed fields they share, and creates it on request.
 * Nothing is written until the user says so, so re-running is free.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQueryClient } from "@engenty/query-client";
import { Button, Input } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { LayoutTemplate } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { normalizeSuggestedTemplateProperties } from "../../src/sources/source-template-suggestion.js";
import {
  createKbTemplate,
  type KbSourceTemplateSuggestion,
  suggestKbSourceTemplate,
} from "../api.js";
import { kbTemplateKeys } from "../queries.js";

/** Headings only — the sections are filled per article at ingest time. */
function headingsOf(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

export function SourceTemplateSuggestion({
  disabled,
  kbId,
  onCreated,
  sourceId,
}: {
  disabled?: boolean;
  kbId: string;
  /** Hands the new template's id to the picker that asked for it. */
  onCreated: (templateId: string) => void;
  sourceId: string;
}) {
  const { t } = useTranslation("kb");
  const queryClient = useQueryClient();
  const [hint, setHint] = useState("");
  const [suggestion, setSuggestion] =
    useState<KbSourceTemplateSuggestion | null>(null);

  const suggestMutation = useMutation({
    mutationFn: () =>
      suggestKbSourceTemplate(sourceId, { hint: hint.trim() || undefined }),
    onError: (err) =>
      toast.error(
        err instanceof Error
          ? err.message
          : t("templates.suggest_failed", "Could not suggest a template")
      ),
    onSuccess: (result) => setSuggestion(result),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!suggestion) {
        throw new Error("no_suggestion");
      }
      return await createKbTemplate({
        content_json: null,
        content_markdown: suggestion.content_markdown,
        description: suggestion.description,
        kb_id: kbId,
        name: suggestion.name,
        property_definitions: normalizeSuggestedTemplateProperties(
          suggestion.properties,
          () => crypto.randomUUID()
        ),
      });
    },
    onError: (err) =>
      toast.error(
        err instanceof Error
          ? err.message
          : t("templates.save_failed", "Failed")
      ),
    onSuccess: async (template) => {
      await queryClient.invalidateQueries({ queryKey: kbTemplateKeys.all });
      onCreated(template.id);
      setSuggestion(null);
      toast.success(t("templates.suggest_created", { name: template.name }));
    },
  });

  const headings = suggestion ? headingsOf(suggestion.content_markdown) : [];

  return (
    <div className="space-y-3 rounded-lg border border-dashed bg-background p-3">
      <div className="space-y-1">
        <p className="font-medium text-sm">{t("templates.suggest_title")}</p>
        <p className="text-muted-foreground text-xs">
          {t("templates.suggest_desc")}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          className="h-8 text-sm"
          disabled={disabled || suggestMutation.isPending}
          onChange={(event) => setHint(event.target.value)}
          placeholder={t("templates.suggest_hint_placeholder")}
          value={hint}
        />
        <Button
          className="shrink-0"
          disabled={disabled || suggestMutation.isPending}
          onClick={() => suggestMutation.mutate()}
          size="sm"
          type="button"
          variant="outline"
        >
          {suggestMutation.isPending ? (
            <AnimatedLoaderIcon className="mr-1.5" play="always" size="xs" />
          ) : (
            <LayoutTemplate aria-hidden className="mr-1.5 h-4 w-4" />
          )}
          {suggestMutation.isPending
            ? t("templates.suggest_running")
            : t("templates.suggest_run")}
        </Button>
      </div>

      {suggestion ? (
        <div className="space-y-3 border-t pt-3">
          <div className="space-y-1">
            <p className="font-medium text-sm">{suggestion.name}</p>
            <p className="text-muted-foreground text-xs">
              {suggestion.description}
            </p>
            <p className="text-muted-foreground text-xs italic">
              {suggestion.rationale}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("sources.analyze_sampled", {
                sampled: suggestion.sampled_items,
                total: suggestion.total_items,
              })}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="font-medium text-xs">
                {t("templates.suggest_sections")}
              </p>
              {headings.length > 0 ? (
                <ol className="space-y-0.5 text-muted-foreground text-xs">
                  {headings.map((heading, index) => (
                    <li key={heading}>
                      {index + 1}. {heading}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-xs italic">
                  {t("templates.suggest_no_sections")}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="font-medium text-xs">
                {t("templates.suggest_properties")}
              </p>
              {suggestion.properties.length > 0 ? (
                <ul className="space-y-0.5 text-muted-foreground text-xs">
                  {suggestion.properties.map((property) => (
                    <li key={property.label}>
                      <span className="text-foreground">{property.label}</span>{" "}
                      · {property.type}
                      {property.options.length > 0
                        ? ` (${property.options.join(", ")})`
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-xs italic">
                  {t("templates.suggest_no_properties")}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              size="sm"
              type="button"
            >
              {createMutation.isPending
                ? t("templates.suggest_creating")
                : t("templates.suggest_create")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
