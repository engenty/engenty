// Parameters tab: KB is the one source with persisted, per-tenant search
// parameters (via PUT /api/kb/settings). Inbox/contacts/chat thresholds are
// compile-time constants — surfaced read-only on the Overview cards, noted here.

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormSection,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { useEffect, useState } from "react";
import {
  getKbSearchSettings,
  type KbSearchSettings,
  updateKbSearchSettings,
} from "@/lib/search-index-admin-api";

const CHUNK_STRATEGIES = [
  "recursive",
  "character",
  "token",
  "markdown",
  "html",
  "json",
  "sentence",
  "semantic-markdown",
];

const KB_SETTINGS_QUERY_KEY = ["search-index-admin", "kb-settings"];

function NumberField({
  hint,
  id,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  hint?: string;
  id: string;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export function SearchIndexParametersTab() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [form, setForm] = useState<KbSearchSettings>();

  const settingsQuery = useQuery({
    queryKey: KB_SETTINGS_QUERY_KEY,
    queryFn: ({ signal }) => getKbSearchSettings(signal),
  });

  useEffect(() => {
    if (settingsQuery.data && !form) {
      setForm(settingsQuery.data);
    }
  }, [settingsQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (patch: KbSearchSettings) =>
      updateKbSearchSettings({
        chunk_max_length: patch.chunk_max_length,
        chunk_overlap: patch.chunk_overlap,
        chunk_strategy: patch.chunk_strategy,
        embedding_model: patch.embedding_model,
        search_verifier_max_candidates: patch.search_verifier_max_candidates,
        search_verifier_min_query_terms: patch.search_verifier_min_query_terms,
        search_vector_min_similarity: patch.search_vector_min_similarity,
      }),
    onSuccess: async (saved) => {
      setForm(saved);
      queryClient.setQueryData(KB_SETTINGS_QUERY_KEY, saved);
      await queryClient.invalidateQueries({ queryKey: KB_SETTINGS_QUERY_KEY });
    },
  });

  const patch = <K extends keyof KbSearchSettings>(
    key: K,
    value: KbSearchSettings[K]
  ) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <SettingsFormSection
      description={t("settings.searchIndex.params.description")}
      title={t("settings.searchIndex.params.kbTitle")}
    >
      {settingsQuery.isLoading || !form ? (
        <p className="text-muted-foreground text-sm">
          {t("settings.searchIndex.params.loading")}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              hint={t("settings.searchIndex.params.vectorMinSimilarityHint")}
              id="kb-vector-min-similarity"
              label={t("settings.searchIndex.params.vectorMinSimilarity")}
              max={1}
              min={0}
              onChange={(value) => patch("search_vector_min_similarity", value)}
              step={0.01}
              value={form.search_vector_min_similarity}
            />
            <div className="space-y-1">
              <Label htmlFor="kb-chunk-strategy">
                {t("settings.searchIndex.params.chunkStrategy")}
              </Label>
              <Select
                onValueChange={(value) =>
                  patch(
                    "chunk_strategy",
                    value as KbSearchSettings["chunk_strategy"]
                  )
                }
                value={form.chunk_strategy}
              >
                <SelectTrigger id="kb-chunk-strategy">
                  <SelectValue>{form.chunk_strategy}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CHUNK_STRATEGIES.map((strategy) => (
                    <SelectItem key={strategy} value={strategy}>
                      {strategy}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NumberField
              id="kb-chunk-max-length"
              label={t("settings.searchIndex.params.chunkMaxLength")}
              max={8000}
              min={100}
              onChange={(value) => patch("chunk_max_length", value)}
              value={form.chunk_max_length}
            />
            <NumberField
              id="kb-chunk-overlap"
              label={t("settings.searchIndex.params.chunkOverlap")}
              max={2000}
              min={0}
              onChange={(value) => patch("chunk_overlap", value)}
              value={form.chunk_overlap}
            />
            <NumberField
              hint={t("settings.searchIndex.params.verifierMinTermsHint")}
              id="kb-verifier-min-terms"
              label={t("settings.searchIndex.params.verifierMinTerms")}
              max={20}
              min={1}
              onChange={(value) =>
                patch("search_verifier_min_query_terms", value)
              }
              value={form.search_verifier_min_query_terms}
            />
            <NumberField
              id="kb-verifier-max-candidates"
              label={t("settings.searchIndex.params.verifierMaxCandidates")}
              max={20}
              min={1}
              onChange={(value) =>
                patch("search_verifier_max_candidates", value)
              }
              value={form.search_verifier_max_candidates}
            />
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="kb-embedding-model">
                {t("settings.searchIndex.params.embeddingModel")}
              </Label>
              <Input
                id="kb-embedding-model"
                onChange={(event) =>
                  patch("embedding_model", event.target.value)
                }
                value={form.embedding_model}
              />
              <p className="text-muted-foreground text-xs">
                {t("settings.searchIndex.params.embeddingModelHint")}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t pt-3">
            {saveMutation.isSuccess ? (
              <span className="mr-auto text-muted-foreground text-sm">
                {t("settings.searchIndex.params.saved")}
              </span>
            ) : null}
            <Button
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(form)}
              size="sm"
              type="button"
            >
              {saveMutation.isPending ? (
                <AnimatedLoaderIcon play="always" size="xs" />
              ) : null}
              {t("settings.searchIndex.params.save")}
            </Button>
          </div>

          {saveMutation.isError ? (
            <p className="text-destructive text-sm">
              {t("settings.searchIndex.params.saveFailed")}
              {saveMutation.error instanceof Error
                ? `: ${saveMutation.error.message}`
                : null}
            </p>
          ) : null}
        </>
      )}

      {settingsQuery.isError ? (
        <p className="text-destructive text-sm">
          {t("settings.searchIndex.params.loadFailed")}
        </p>
      ) : null}

      <p className="border-t pt-3 text-muted-foreground text-xs">
        {t("settings.searchIndex.params.constantsNote")}
      </p>
    </SettingsFormSection>
  );
}
