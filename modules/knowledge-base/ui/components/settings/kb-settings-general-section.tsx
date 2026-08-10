/**
 * KB module settings: knowledge bases list and tenant-wide configuration.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormRow,
  SettingsFormSection,
  Skeleton,
  Switch,
} from "@engenty/ui-core";
import { RefreshCw } from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import type { KbSettings } from "../../../src/schema/types.js";
import { updateKbSettings } from "../../api.js";
import { kbSettingsQueryOptions } from "../../queries.js";
import { KbSettingsEmbeddingModelField } from "../kb-settings-embedding-model-field.js";
import { runKbArticleReindex } from "./kb-article-reindex.js";
import { KbSearchTestPanel } from "./kb-search-test-panel.js";
import type { KbSettingsToolbarSaveSlot } from "./kb-settings-types.js";

/** Mirrors the `chunk_strategy` enum in `kbSettingsSchema` (all Select options below). */
const CHUNK_STRATEGIES: ReadonlyArray<KbSettings["chunk_strategy"]> = [
  "recursive",
  "markdown",
  "semantic-markdown",
  "sentence",
  "token",
  "character",
  "html",
  "json",
];

export function KbSettingsGeneralSection({
  setToolbarSaveSlot,
}: {
  setToolbarSaveSlot: Dispatch<
    SetStateAction<KbSettingsToolbarSaveSlot | null>
  >;
}) {
  const { t } = useTranslation("kb");
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery(kbSettingsQueryOptions);

  const [embeddingDraft, setEmbeddingDraft] = useState("");
  const [autoSummary, setAutoSummary] = useState(true);
  const [autoQuestions, setAutoQuestions] = useState(true);
  const [vectorMinSimilarity, setVectorMinSimilarity] = useState(0.45);
  const [verifierMinQueryTerms, setVerifierMinQueryTerms] = useState(3);
  const [verifierMaxCandidates, setVerifierMaxCandidates] = useState(6);
  const [chunkStrategy, setChunkStrategy] = useState<
    KbSettings["chunk_strategy"]
  >("recursive");
  const [chunkMaxLength, setChunkMaxLength] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(100);

  // Rebuild index state (shared button in Chunking section)
  const [reindexing, setReindexing] = useState(false);

  const runReindex = useCallback(async () => {
    setReindexing(true);
    try {
      await runKbArticleReindex({
        onProgress: (done, total) =>
          toast.info(`Re-indexing ${done}/${total}…`),
      });
      toast.success(t("settings.embedding_reindex_success"));
      queryClient.invalidateQueries({ queryKey: ["kb"] });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("settings.embedding_reindex_failed")
      );
    } finally {
      setReindexing(false);
    }
  }, [queryClient, t]);

  useEffect(() => {
    if (settings) {
      setEmbeddingDraft(settings.embedding_model);
      setAutoSummary(settings.auto_generate_summary);
      setAutoQuestions(settings.auto_generate_questions);
      setVectorMinSimilarity(settings.search_vector_min_similarity);
      setVerifierMinQueryTerms(settings.search_verifier_min_query_terms);
      setVerifierMaxCandidates(settings.search_verifier_max_candidates);
      setChunkStrategy(settings.chunk_strategy ?? "recursive");
      setChunkMaxLength(settings.chunk_max_length ?? 1000);
      setChunkOverlap(settings.chunk_overlap ?? 100);
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!settings) {
        throw new Error("Settings not loaded");
      }
      return updateKbSettings({
        ...settings,
        embedding_model: embeddingDraft,
        auto_generate_summary: autoSummary,
        auto_generate_questions: autoQuestions,
        search_vector_min_similarity: vectorMinSimilarity,
        search_verifier_min_query_terms: verifierMinQueryTerms,
        search_verifier_max_candidates: verifierMaxCandidates,
        chunk_strategy: chunkStrategy,
        chunk_max_length: chunkMaxLength,
        chunk_overlap: chunkOverlap,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb", "settings"] });
      toast.success(t("settings.saved"));
    },
    onError: (err) => toast.error(err.message),
  });

  const commitEmbeddingModel = async (nextModel: string) => {
    if (!settings) {
      throw new Error("Settings not loaded");
    }
    await updateKbSettings({
      ...settings,
      embedding_model: nextModel,
      auto_generate_summary: autoSummary,
      auto_generate_questions: autoQuestions,
      search_vector_min_similarity: vectorMinSimilarity,
      search_verifier_min_query_terms: verifierMinQueryTerms,
      search_verifier_max_candidates: verifierMaxCandidates,
      chunk_strategy: chunkStrategy,
      chunk_max_length: chunkMaxLength,
      chunk_overlap: chunkOverlap,
    });
    queryClient.invalidateQueries({ queryKey: ["kb", "settings"] });
    setEmbeddingDraft(nextModel);
  };

  const isDirty = useMemo(() => {
    if (!settings) {
      return false;
    }
    return (
      embeddingDraft !== settings.embedding_model ||
      autoSummary !== settings.auto_generate_summary ||
      autoQuestions !== settings.auto_generate_questions ||
      vectorMinSimilarity !== settings.search_vector_min_similarity ||
      verifierMinQueryTerms !== settings.search_verifier_min_query_terms ||
      verifierMaxCandidates !== settings.search_verifier_max_candidates ||
      chunkStrategy !== (settings.chunk_strategy ?? "recursive") ||
      chunkMaxLength !== (settings.chunk_max_length ?? 1000) ||
      chunkOverlap !== (settings.chunk_overlap ?? 100)
    );
  }, [
    settings,
    embeddingDraft,
    autoSummary,
    autoQuestions,
    vectorMinSimilarity,
    verifierMinQueryTerms,
    verifierMaxCandidates,
    chunkStrategy,
    chunkMaxLength,
    chunkOverlap,
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

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!settings) {
    return null;
  }

  return (
    <div className="space-y-6">
      <SettingsFormSection
        description={t("settings.general_description")}
        title={t("settings.general_title")}
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
            toast.success(t("settings.embedding_reindex_success"));
          }}
          savedEmbeddingModel={settings.embedding_model}
          setEmbeddingDraft={setEmbeddingDraft}
        />
      </SettingsFormSection>

      <SettingsFormSection
        cardClassName="space-y-0 divide-y divide-border"
        cardVariant="compact"
        description={t("settings.search_quality_description")}
        title={t("settings.search_quality_title")}
      >
        <SettingsFormRow
          controlSizing="compact"
          hint={t("settings.search_vector_min_similarity_hint")}
          label={t("settings.search_vector_min_similarity")}
          labelFor="kb-search-vector-min-similarity"
        >
          <Input
            className="w-full tabular-nums"
            id="kb-search-vector-min-similarity"
            max={1}
            min={0}
            onChange={(event) =>
              setVectorMinSimilarity(Number.parseFloat(event.target.value) || 0)
            }
            step={0.01}
            type="number"
            value={vectorMinSimilarity}
          />
        </SettingsFormRow>
        <SettingsFormRow
          controlSizing="compact"
          hint={t("settings.search_verifier_min_query_terms_hint")}
          label={t("settings.search_verifier_min_query_terms")}
          labelFor="kb-search-verifier-min-terms"
        >
          <Input
            className="w-full tabular-nums"
            id="kb-search-verifier-min-terms"
            max={20}
            min={1}
            onChange={(event) =>
              setVerifierMinQueryTerms(
                Number.parseInt(event.target.value, 10) || 1
              )
            }
            step={1}
            type="number"
            value={verifierMinQueryTerms}
          />
        </SettingsFormRow>
        <SettingsFormRow
          controlSizing="compact"
          hint={t("settings.search_verifier_max_candidates_hint")}
          label={t("settings.search_verifier_max_candidates")}
          labelFor="kb-search-verifier-max-candidates"
        >
          <Input
            className="w-full tabular-nums"
            id="kb-search-verifier-max-candidates"
            max={20}
            min={1}
            onChange={(event) =>
              setVerifierMaxCandidates(
                Number.parseInt(event.target.value, 10) || 1
              )
            }
            step={1}
            type="number"
            value={verifierMaxCandidates}
          />
        </SettingsFormRow>
      </SettingsFormSection>

      {/* Chunking settings */}
      <SettingsFormSection
        cardClassName="space-y-0 divide-y divide-border"
        cardVariant="compact"
        description="Controls how article text is split into chunks before embedding."
        title="Chunking"
        titleAction={
          <Button
            disabled={reindexing}
            onClick={runReindex}
            size="sm"
            variant="outline"
          >
            <RefreshCw
              className={`size-3.5 ${reindexing ? "animate-spin" : ""}`}
            />
            Rebuild index
          </Button>
        }
      >
        <SettingsFormRow
          controlSizing="compact"
          hint="How article markdown is split before embedding."
          label="Strategy"
          labelFor="kb-chunk-strategy"
        >
          <Select
            onValueChange={(v) => {
              const next = CHUNK_STRATEGIES.find((s) => s === v);
              if (next) {
                setChunkStrategy(next);
              }
            }}
            value={chunkStrategy}
          >
            <SelectTrigger className="w-full" id="kb-chunk-strategy">
              <SelectValue>
                {(value: string | null) => {
                  const labels: Record<string, string> = {
                    recursive: "Recursive",
                    character: "Character",
                    token: "Token",
                    markdown: "Markdown",
                    html: "HTML",
                    json: "JSON",
                    sentence: "Sentence",
                    "semantic-markdown": "Semantic Markdown",
                  };
                  return labels[value ?? ""] ?? value ?? "Recursive";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-fit">
              <SelectItem value="recursive">
                Recursive — splits on headings, paragraphs, sentences
              </SelectItem>
              <SelectItem value="markdown">
                Markdown — respects headers, code blocks, lists
              </SelectItem>
              <SelectItem value="semantic-markdown">
                Semantic Markdown — groups related sections
              </SelectItem>
              <SelectItem value="sentence">
                Sentence — one sentence per chunk
              </SelectItem>
              <SelectItem value="token">
                Token — respects token boundaries
              </SelectItem>
              <SelectItem value="character">
                Character — fixed character window
              </SelectItem>
              <SelectItem value="html">HTML — respects HTML tags</SelectItem>
              <SelectItem value="json">JSON — structure-aware</SelectItem>
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          controlSizing="compact"
          hint="Maximum number of characters per chunk."
          label="Max chunk length"
          labelFor="kb-chunk-max-length"
        >
          <Input
            className="w-full tabular-nums"
            id="kb-chunk-max-length"
            max={8000}
            min={100}
            onChange={(e) =>
              setChunkMaxLength(Number.parseInt(e.target.value, 10) || 1000)
            }
            step={100}
            type="number"
            value={chunkMaxLength}
          />
        </SettingsFormRow>
        <SettingsFormRow
          controlSizing="compact"
          hint="Character overlap between consecutive chunks for context continuity."
          label="Chunk overlap"
          labelFor="kb-chunk-overlap"
        >
          <Input
            className="w-full tabular-nums"
            id="kb-chunk-overlap"
            max={2000}
            min={0}
            onChange={(e) =>
              setChunkOverlap(Number.parseInt(e.target.value, 10) || 0)
            }
            step={10}
            type="number"
            value={chunkOverlap}
          />
        </SettingsFormRow>
      </SettingsFormSection>

      <KbSearchTestPanel vectorMinSimilarity={vectorMinSimilarity} />

      <SettingsFormSection
        cardClassName="space-y-0 divide-y divide-border"
        cardVariant="compact"
        description={t("settings.automation_description")}
        title={t("settings.automation_title")}
      >
        <SettingsFormRow
          className="sm:items-center"
          controlSizing="fit"
          hint={t("settings.auto_summary_hint")}
          label={t("settings.auto_summary")}
          labelFor="kb-auto-summary"
        >
          <Switch
            checked={autoSummary}
            id="kb-auto-summary"
            onCheckedChange={setAutoSummary}
          />
        </SettingsFormRow>
        <SettingsFormRow
          className="sm:items-center"
          controlSizing="fit"
          hint={t("settings.auto_questions_hint")}
          label={t("settings.auto_questions")}
          labelFor="kb-auto-questions"
        >
          <Switch
            checked={autoQuestions}
            id="kb-auto-questions"
            onCheckedChange={setAutoQuestions}
          />
        </SettingsFormRow>
      </SettingsFormSection>
    </div>
  );
}
