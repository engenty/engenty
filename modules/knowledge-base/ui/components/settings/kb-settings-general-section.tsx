/**
 * KB module settings body: Embedding (model + index), Retrieval quality, and
 * the test search. Everything here is tenant-wide index infrastructure.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Input,
  SettingsFormRow,
  SettingsFormSection,
  Skeleton,
} from "@engenty/ui-core";
import { RefreshCw, RotateCcw } from "lucide-react";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { updateKbSettings } from "../../api.js";
import { kbSettingsQueryOptions } from "../../queries.js";
import {
  fetchKbSearchIndexStatus,
  KbSettingsEmbeddingModelField,
} from "../kb-settings-embedding-model-field.js";
import { runKbArticleReindex } from "./kb-article-reindex.js";
import { KbSearchTestPanel } from "./kb-search-test-panel.js";
import type { KbSettingsToolbarSaveSlot } from "./kb-settings-types.js";

/** Mirrors the zod defaults in `kbSettingsSchema`; shown as the reset target. */
const RETRIEVAL_DEFAULTS = {
  search_vector_min_similarity: 0.45,
  search_verifier_max_candidates: 6,
  search_verifier_min_query_terms: 3,
} as const;

const KB_INDEX_STATUS_KEY = ["kb", "search-index", "status"] as const;

function formatRelative(iso: string | null, locale: string): string | null {
  if (!iso) {
    return null;
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(at);
}

/** A numeric row with its default shown and a one-click reset to it. */
function NumberRow({
  hint,
  id,
  label,
  max,
  min,
  onChange,
  resetLabel,
  step,
  value,
  defaultValue,
}: {
  defaultValue: number;
  hint: ReactNode;
  id: string;
  label: ReactNode;
  max: number;
  min: number;
  onChange: (next: number) => void;
  resetLabel: string;
  step: number;
  value: number;
}) {
  const isDefault = value === defaultValue;
  return (
    <SettingsFormRow
      controlSizing="compact"
      hint={hint}
      label={label}
      labelFor={id}
    >
      <div className="flex items-center gap-1">
        <Input
          className="w-full tabular-nums"
          id={id}
          max={max}
          min={min}
          onChange={(event) => {
            const parsed = Number.parseFloat(event.target.value);
            onChange(Number.isFinite(parsed) ? parsed : defaultValue);
          }}
          step={step}
          type="number"
          value={value}
        />
        <Button
          aria-label={resetLabel}
          className={isDefault ? "invisible" : "text-muted-foreground"}
          onClick={() => onChange(defaultValue)}
          size="icon"
          tabIndex={isDefault ? -1 : 0}
          title={`${resetLabel} (${defaultValue})`}
          type="button"
          variant="ghost"
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>
    </SettingsFormRow>
  );
}

export function KbSettingsGeneralSection({
  setToolbarSaveSlot,
}: {
  setToolbarSaveSlot: Dispatch<
    SetStateAction<KbSettingsToolbarSaveSlot | null>
  >;
}) {
  const { t, i18n } = useTranslation("kb");
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery(kbSettingsQueryOptions);
  const { data: indexStatus } = useQuery({
    queryFn: fetchKbSearchIndexStatus,
    queryKey: KB_INDEX_STATUS_KEY,
    staleTime: 15_000,
  });

  const [embeddingDraft, setEmbeddingDraft] = useState("");
  const [vectorMinSimilarity, setVectorMinSimilarity] = useState<number>(
    RETRIEVAL_DEFAULTS.search_vector_min_similarity
  );
  const [verifierMinQueryTerms, setVerifierMinQueryTerms] = useState<number>(
    RETRIEVAL_DEFAULTS.search_verifier_min_query_terms
  );
  const [verifierMaxCandidates, setVerifierMaxCandidates] = useState<number>(
    RETRIEVAL_DEFAULTS.search_verifier_max_candidates
  );

  const [reindexing, setReindexing] = useState(false);
  const [reindexProgress, setReindexProgress] = useState<string | null>(null);

  const invalidateIndex = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: KB_INDEX_STATUS_KEY });
  }, [queryClient]);

  const runReindex = useCallback(async () => {
    setReindexing(true);
    setReindexProgress(t("settings.embedding_reindex_preparing"));
    try {
      await runKbArticleReindex({
        onProgress: (done, total) =>
          setReindexProgress(
            `${t("settings.embedding_reindex_batch")} ${done}/${total}`
          ),
      });
      setReindexProgress(null);
      toast.success(t("settings.embedding_reindex_success"));
      queryClient.invalidateQueries({ queryKey: ["kb"] });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : t("settings.embedding_reindex_failed");
      setReindexProgress(message);
      toast.error(message);
    } finally {
      setReindexing(false);
      invalidateIndex();
    }
  }, [invalidateIndex, queryClient, t]);

  useEffect(() => {
    if (settings) {
      setEmbeddingDraft(settings.embedding_model);
      setVectorMinSimilarity(settings.search_vector_min_similarity);
      setVerifierMinQueryTerms(settings.search_verifier_min_query_terms);
      setVerifierMaxCandidates(settings.search_verifier_max_candidates);
    }
  }, [settings]);

  const draft = useCallback(
    (embeddingModel: string) => {
      if (!settings) {
        throw new Error("Settings not loaded");
      }
      return {
        ...settings,
        embedding_model: embeddingModel,
        search_vector_min_similarity: vectorMinSimilarity,
        search_verifier_min_query_terms: verifierMinQueryTerms,
        search_verifier_max_candidates: verifierMaxCandidates,
      };
    },
    [
      settings,
      vectorMinSimilarity,
      verifierMinQueryTerms,
      verifierMaxCandidates,
    ]
  );

  const saveMut = useMutation({
    mutationFn: () => updateKbSettings(draft(embeddingDraft)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb", "settings"] });
      toast.success(t("settings.saved"));
    },
    onError: (err) => toast.error(err.message),
  });

  const commitEmbeddingModel = async (nextModel: string) => {
    await updateKbSettings(draft(nextModel));
    queryClient.invalidateQueries({ queryKey: ["kb", "settings"] });
    setEmbeddingDraft(nextModel);
  };

  const isDirty = useMemo(() => {
    if (!settings) {
      return false;
    }
    return (
      embeddingDraft !== settings.embedding_model ||
      vectorMinSimilarity !== settings.search_vector_min_similarity ||
      verifierMinQueryTerms !== settings.search_verifier_min_query_terms ||
      verifierMaxCandidates !== settings.search_verifier_max_candidates
    );
  }, [
    settings,
    embeddingDraft,
    vectorMinSimilarity,
    verifierMinQueryTerms,
    verifierMaxCandidates,
  ]);

  useEffect(() => {
    if (isLoading || !settings) {
      setToolbarSaveSlot(null);
      return;
    }
    setToolbarSaveSlot({
      disabled: !isDirty || saveMut.isPending,
      pending: saveMut.isPending,
      onSave: () => saveMut.mutate(),
    });
    return () => setToolbarSaveSlot(null);
  }, [
    isDirty,
    isLoading,
    saveMut.isPending,
    saveMut.mutate,
    setToolbarSaveSlot,
    settings,
  ]);

  const indexSummary = useMemo(() => {
    if (!indexStatus) {
      return null;
    }
    const behind = indexStatus.stale_count + indexStatus.missing_count;
    const when = formatRelative(indexStatus.last_indexed_at, i18n.language);
    const parts = [
      t("settings.index_status_indexed", {
        count: indexStatus.indexed_count,
        total: indexStatus.total_count,
      }),
    ];
    if (behind > 0) {
      parts.push(t("settings.index_status_behind", { count: behind }));
    }
    if (when) {
      parts.push(t("settings.index_status_last", { when }));
    }
    return { behind, text: parts.join(" · ") };
  }, [i18n.language, indexStatus, t]);

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!settings) {
    return null;
  }

  return (
    <div className="space-y-8">
      <SettingsFormSection
        cardClassName="space-y-0 divide-y divide-border"
        cardVariant="compact"
        description={t("settings.embedding_section_description")}
        title={t("settings.embedding_section_title")}
      >
        <KbSettingsEmbeddingModelField
          embeddingDraft={embeddingDraft}
          onCommitEmbeddingModel={commitEmbeddingModel}
          onReindexComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["kb", "settings"] });
            queryClient.invalidateQueries({
              queryKey: ["kb", "knowledge-bases"],
            });
            queryClient.invalidateQueries({ queryKey: ["kb", "articles"] });
            invalidateIndex();
            toast.success(t("settings.embedding_reindex_success"));
          }}
          savedEmbeddingModel={settings.embedding_model}
          setEmbeddingDraft={setEmbeddingDraft}
        />
        <SettingsFormRow
          controlSizing="fit"
          hint={
            reindexProgress ??
            indexSummary?.text ??
            t("settings.index_status_loading")
          }
          label={t("settings.index_title")}
        >
          <Button
            disabled={reindexing}
            onClick={runReindex}
            size="sm"
            type="button"
            variant={
              indexSummary && indexSummary.behind > 0 ? "default" : "outline"
            }
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${reindexing ? "animate-spin" : ""}`}
            />
            {t("settings.index_rebuild")}
          </Button>
        </SettingsFormRow>
      </SettingsFormSection>

      <SettingsFormSection
        cardClassName="space-y-0 divide-y divide-border"
        cardVariant="compact"
        description={t("settings.search_quality_description")}
        title={t("settings.search_quality_title")}
      >
        <NumberRow
          defaultValue={RETRIEVAL_DEFAULTS.search_vector_min_similarity}
          hint={t("settings.search_vector_min_similarity_hint")}
          id="kb-search-vector-min-similarity"
          label={t("settings.search_vector_min_similarity")}
          max={1}
          min={0}
          onChange={setVectorMinSimilarity}
          resetLabel={t("settings.reset_default")}
          step={0.01}
          value={vectorMinSimilarity}
        />
        <NumberRow
          defaultValue={RETRIEVAL_DEFAULTS.search_verifier_min_query_terms}
          hint={t("settings.search_verifier_min_query_terms_hint")}
          id="kb-search-verifier-min-terms"
          label={t("settings.search_verifier_min_query_terms")}
          max={20}
          min={1}
          onChange={(next) => setVerifierMinQueryTerms(Math.round(next))}
          resetLabel={t("settings.reset_default")}
          step={1}
          value={verifierMinQueryTerms}
        />
        <NumberRow
          defaultValue={RETRIEVAL_DEFAULTS.search_verifier_max_candidates}
          hint={t("settings.search_verifier_max_candidates_hint")}
          id="kb-search-verifier-max-candidates"
          label={t("settings.search_verifier_max_candidates")}
          max={20}
          min={1}
          onChange={(next) => setVerifierMaxCandidates(Math.round(next))}
          resetLabel={t("settings.reset_default")}
          step={1}
          value={verifierMaxCandidates}
        />
      </SettingsFormSection>

      <KbSearchTestPanel vectorMinSimilarity={vectorMinSimilarity} />
    </div>
  );
}
