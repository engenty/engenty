/**
 * KB module settings: knowledge bases list and tenant-wide configuration.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery, useQueryClient } from "@engenty/query-client";
import {
  Badge,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormSection,
} from "@engenty/ui-core";
import { Loader2, Search } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { KbSearchResult } from "../../../src/schema/types.js";
import { searchKb } from "../../api.js";
import { kbDisplayName } from "../../kb-display-name.js";
import { kbsQueryOptions } from "../../queries.js";
import { runKbArticleReindex } from "./kb-article-reindex.js";

/* ── Test search panel ── */

interface KbSearchTestResult {
  article_id: string;
  chunk_text: string;
  rejected?: boolean;
  score: number;
  title: string;
}

const ALL_KBS = "__all__";

export function KbSearchTestPanel({
  vectorMinSimilarity,
}: {
  vectorMinSimilarity: number;
}) {
  const { t } = useTranslation("kb");
  const { data: kbs = [] } = useQuery(kbsQueryOptions);
  const [selectedKb, setSelectedKb] = useState(ALL_KBS);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KbSearchTestResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<
    "bm25" | "hybrid" | "hybrid_verifier"
  >("hybrid_verifier");
  const [searchDurationMs, setSearchDurationMs] = useState<number | null>(null);
  const [searchTimings, setSearchTimings] = useState<Record<
    string,
    number
  > | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  // Reindex state
  const [reindexing, setReindexing] = useState(false);
  const [reindexProgress, setReindexProgress] = useState<string | null>(null);

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
      setReindexProgress(t("settings.embedding_reindex_done"));
      toast.success(t("settings.embedding_reindex_success"));
      queryClient.invalidateQueries({ queryKey: ["kb"] });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t("settings.embedding_reindex_failed");
      setReindexProgress(msg);
      toast.error(msg);
    } finally {
      setReindexing(false);
    }
  }, [queryClient, t]);

  const runSearch = useCallback(
    async (q: string, kbId: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setResults(null);
        setError(null);
        setSearchDurationMs(null);
        setSearchTimings(null);
        return;
      }
      setLoading(true);
      setError(null);
      const t0 = performance.now();
      try {
        const useLexical = searchMode === "bm25";
        const useVerifier = searchMode === "hybrid_verifier";

        const accumulatedTimings: Record<string, number> = {};

        const searchOne = async (
          id: string,
          lim: number,
          verifier: boolean
        ) => {
          const res = await searchKb(id, trimmed, {
            limit: lim,
            match_threshold: null,
            use_vector: !useLexical,
            verifier,
          });

          let resArray: KbSearchResult[] = [];
          if (Array.isArray(res)) {
            // Fallback for legacy backend shape
            resArray = res;
          } else if (res && typeof res === "object") {
            if (res.timings) {
              Object.assign(accumulatedTimings, res.timings);
            }
            resArray = res.results || [];
          }
          return resArray;
        };

        let raw: KbSearchTestResult[] = [];
        let verified: KbSearchTestResult[] | null = null;

        if (kbId === ALL_KBS) {
          for (const kb of kbs) {
            const hits = await searchOne(kb.id, 5, false);
            raw.push(...hits);
          }
          raw.sort((a, b) => b.score - a.score);
          raw = raw.slice(0, 15);
          if (useVerifier) {
            const verifiedAll: KbSearchTestResult[] = [];
            for (const kb of kbs) {
              const hits = await searchOne(kb.id, 5, true);
              verifiedAll.push(...hits);
            }
            verified = verifiedAll;
          }
        } else {
          raw = await searchOne(kbId, 10, false);
          if (useVerifier) {
            verified = await searchOne(kbId, 10, true);
          }
        }

        // Mark items that the verifier rejected
        if (verified) {
          const verifiedIds = new Set(
            verified.map((v) => `${v.article_id}:${v.chunk_text.slice(0, 50)}`)
          );
          for (const r of raw) {
            if (
              !verifiedIds.has(`${r.article_id}:${r.chunk_text.slice(0, 50)}`)
            ) {
              r.rejected = true;
            }
          }
        }

        setSearchDurationMs(Math.round(performance.now() - t0));
        setSearchTimings(accumulatedTimings);
        setResults(raw);
      } catch (err) {
        setSearchDurationMs(Math.round(performance.now() - t0));
        setSearchTimings(null);
        setError(
          err instanceof Error
            ? err.message
            : t("development.kbIndex.testSearchFailed")
        );
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    [kbs, t, searchMode]
  );

  const onQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        void runSearch(value, selectedKb);
      }, 400);
    },
    [runSearch, selectedKb]
  );

  const onKbChange = useCallback(
    (value: string) => {
      setSelectedKb(value);
      if (query.trim().length >= 2) {
        void runSearch(query, value);
      }
    },
    [query, runSearch]
  );

  return (
    <SettingsFormSection
      description="Hybrid vector + keyword search with optional LLM verifier."
      title={t("development.kbIndex.testSearchTitle")}
    >
      <div className="space-y-3">
        {/* Controls row */}
        <div className="flex items-center gap-2">
          <Select onValueChange={onKbChange} value={selectedKb}>
            <SelectTrigger
              className="w-40 shrink-0"
              id="kb-test-search-kb-select"
            >
              <SelectValue>
                {(value: string | null) => {
                  if (!value || value === ALL_KBS) {
                    return "All KBs";
                  }
                  const kb = kbs.find((k) => k.id === value);
                  return kb ? kbDisplayName(kb, t) : value;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-fit">
              <SelectItem value={ALL_KBS}>All KBs</SelectItem>
              {kbs.map((kb) => (
                <SelectItem key={kb.id} value={kb.id}>
                  {kbDisplayName(kb, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-8"
              id="kb-test-search-query"
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t("development.kbIndex.testSearchPlaceholder")}
              type="search"
              value={query}
            />
          </div>

          <Select
            onValueChange={(v) => setSearchMode(v as typeof searchMode)}
            value={searchMode}
          >
            <SelectTrigger
              className="w-auto shrink-0"
              id="kb-test-search-mode"
              size="sm"
            >
              <SelectValue>
                {(value: string | null) =>
                  value === "bm25"
                    ? "BM25"
                    : value === "hybrid"
                      ? "Hybrid"
                      : "Hybrid + Verifier"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-fit">
              <SelectItem value="bm25">BM25</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
              <SelectItem value="hybrid_verifier">Hybrid + Verifier</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Searching…</span>
          </div>
        )}

        {/* Error */}
        {error && <p className="py-2 text-destructive text-sm">{error}</p>}

        {/* Results */}
        {!loading && results != null && (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">
              {results.length === 0
                ? t("development.kbIndex.testSearchEmpty")
                : (() => {
                    const accepted = results.filter((r) => !r.rejected).length;
                    const parts = [`${results.length} results`];
                    if (searchMode === "hybrid_verifier") {
                      parts.push(`${accepted} accepted`);
                    }
                    if (searchDurationMs != null) {
                      parts.push(`in ${searchDurationMs}ms`);
                    }
                    return parts.join(", ");
                  })()}
              {searchTimings && Object.keys(searchTimings).length > 0 && (
                <span className="ml-2 text-xs opacity-70">
                  (
                  {Object.entries(searchTimings)
                    .map(([k, v]) => `${k} ${v}ms`)
                    .join(", ")}
                  )
                </span>
              )}
            </p>

            {results.length > 0 && (
              <>
                {/* Cutoff separator label */}
                {results.some((r) => r.score < vectorMinSimilarity) && (
                  <p className="pt-0.5 text-[10px] text-muted-foreground/60">
                    {t("development.kbIndex.testSearchCutoffSeparator")} (
                    {vectorMinSimilarity.toFixed(2)})
                  </p>
                )}

                <ul className="divide-y divide-border rounded-md border">
                  {results.map((r, i) => {
                    const belowCutoff = r.score < vectorMinSimilarity;
                    const rejected = r.rejected === true;
                    return (
                      <li
                        className={`flex items-center gap-3 px-3 py-2 text-sm ${
                          rejected
                            ? "bg-destructive/5 text-muted-foreground/50"
                            : belowCutoff
                              ? "bg-muted/30 text-muted-foreground/50"
                              : ""
                        }`}
                        key={`${r.article_id}-${i}`}
                      >
                        {/* Score badge */}
                        <Badge
                          className={`shrink-0 font-mono text-[11px] tabular-nums ${
                            belowCutoff
                              ? "border-muted-foreground/20 bg-transparent text-muted-foreground/40"
                              : r.score >= 0.6
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : r.score >= 0.4
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                  : "border-muted-foreground/30 bg-muted/50 text-muted-foreground"
                          }`}
                          variant="outline"
                        >
                          {r.score.toFixed(2)}
                        </Badge>

                        {/* Title + chunk preview */}
                        <div className="min-w-0 flex-1">
                          <span
                            className={`font-medium ${
                              rejected
                                ? "text-muted-foreground/50 line-through"
                                : belowCutoff
                                  ? "text-muted-foreground/50"
                                  : "text-foreground"
                            }`}
                          >
                            {r.title}
                          </span>
                          <p
                            className={`mt-0.5 truncate text-xs ${
                              rejected
                                ? "text-muted-foreground/30 line-through"
                                : belowCutoff
                                  ? "text-muted-foreground/30"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {r.chunk_text.slice(0, 120)}
                            {r.chunk_text.length > 120 ? "…" : ""}
                          </p>
                        </div>

                        {/* Muted indicator for below-cutoff */}
                        {rejected ? (
                          <span className="shrink-0 text-[10px] text-destructive/50">
                            rejected
                          </span>
                        ) : belowCutoff ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground/40">
                            filtered
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </SettingsFormSection>
  );
}
