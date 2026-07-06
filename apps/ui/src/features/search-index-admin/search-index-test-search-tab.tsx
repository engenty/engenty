// Test-search tab: run a query against any provider with tunable knobs
// (strategy, limit, min_score) and inspect the ranked matches — combined score,
// per-signal breakdown (fts/trigram/vector), matched fields — plus the
// client-measured round-trip latency.

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery } from "@engenty/query-client";
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
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  listAllProviders,
  runProviderTestSearch,
  type SearchIndexMatch,
  type SearchIndexProviderSummary,
  type SearchIndexTestSearchResult,
} from "@/lib/search-index-admin-api";
import { SEARCH_INDEX_PROVIDERS_QUERY_KEY } from "./search-index-overview-tab";

const STRATEGIES = ["hybrid", "lexical", "semantic"] as const;

function previewText(item: unknown): string {
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    const nested = (record.message ?? record.contact ?? record.article) as
      | Record<string, unknown>
      | undefined;
    const candidate =
      record.text ??
      record.title ??
      record.name ??
      record.subject ??
      nested?.subject ??
      nested?.title ??
      nested?.name ??
      record.session_id;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return JSON.stringify(item);
}

function formatSourceScores(match: SearchIndexMatch): string {
  return Object.entries(match.source_scores)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => `${key} ${(value as number).toFixed(3)}`)
    .join(" · ");
}

export function SearchIndexTestSearchTab() {
  const { t } = useTranslation("common");
  const [providerId, setProviderId] = useState<string>();
  const [query, setQuery] = useState("");
  const [strategy, setStrategy] =
    useState<(typeof STRATEGIES)[number]>("hybrid");
  const [limit, setLimit] = useState(25);
  const [minScore, setMinScore] = useState<number | "">("");

  const providersQuery = useQuery({
    queryKey: SEARCH_INDEX_PROVIDERS_QUERY_KEY,
    queryFn: () => listAllProviders(),
  });

  const searchableProviders = useMemo(
    () =>
      (providersQuery.data ?? []).filter(
        (provider) => provider.supports.search !== false
      ),
    [providersQuery.data]
  );

  const selectedProvider: SearchIndexProviderSummary | undefined = useMemo(
    () =>
      searchableProviders.find((provider) => provider.id === providerId) ??
      searchableProviders[0],
    [searchableProviders, providerId]
  );

  const searchMutation = useMutation<SearchIndexTestSearchResult>({
    mutationFn: () => {
      if (!selectedProvider) {
        throw new Error("No provider selected");
      }
      return runProviderTestSearch(selectedProvider, {
        limit,
        query: query.trim(),
        strategy,
        ...(minScore === "" ? {} : { min_score: minScore }),
      });
    },
  });

  const canRun = Boolean(selectedProvider) && query.trim().length > 0;
  const result = searchMutation.data;

  return (
    <SettingsFormSection
      description={t("settings.searchIndex.test.description")}
      title={t("settings.searchIndex.test.title")}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canRun) {
            searchMutation.mutate();
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="test-search-provider">
              {t("settings.searchIndex.test.provider")}
            </Label>
            <Select
              onValueChange={setProviderId}
              value={selectedProvider?.id ?? ""}
            >
              <SelectTrigger id="test-search-provider">
                <SelectValue>{selectedProvider?.id ?? "—"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {searchableProviders.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="test-search-strategy">
              {t("settings.searchIndex.test.strategy")}
            </Label>
            <Select
              onValueChange={(value) =>
                setStrategy(value as (typeof STRATEGIES)[number])
              }
              value={strategy}
            >
              <SelectTrigger id="test-search-strategy">
                <SelectValue>
                  {t(`settings.searchIndex.test.strategy_${strategy}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`settings.searchIndex.test.strategy_${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="test-search-limit">
              {t("settings.searchIndex.test.limit")}
            </Label>
            <Input
              id="test-search-limit"
              max={100}
              min={1}
              onChange={(event) =>
                setLimit(Math.max(1, Math.min(100, Number(event.target.value))))
              }
              type="number"
              value={limit}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="test-search-min-score">
              {t("settings.searchIndex.test.minScore")}
            </Label>
            <Input
              id="test-search-min-score"
              max={1}
              min={0}
              onChange={(event) =>
                setMinScore(
                  event.target.value === "" ? "" : Number(event.target.value)
                )
              }
              placeholder={t("settings.searchIndex.test.minScorePlaceholder")}
              step={0.01}
              type="number"
              value={minScore}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label={t("settings.searchIndex.test.query")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("settings.searchIndex.test.queryPlaceholder")}
            value={query}
          />
          <Button className="sm:w-auto" disabled={!canRun} type="submit">
            {searchMutation.isPending ? (
              <AnimatedLoaderIcon play="always" size="xs" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            {t("settings.searchIndex.test.run")}
          </Button>
        </div>
      </form>

      {searchMutation.isError ? (
        <p className="text-destructive text-sm">
          {t("settings.searchIndex.test.failed")}
          {searchMutation.error instanceof Error
            ? `: ${searchMutation.error.message}`
            : null}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-2">
          <div className="text-muted-foreground text-sm">
            {t("settings.searchIndex.test.summary", {
              count: result.total,
              ms: result.elapsed_ms,
            })}
          </div>
          {result.matches.length > 0 ? (
            <div className="divide-y rounded-md border">
              {result.matches.map((match, index) => (
                <div
                  className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-start"
                  key={`${index}-${match.score}`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="line-clamp-3 text-sm">
                      {previewText(match.item)}
                    </div>
                    <div className="font-mono text-muted-foreground text-xs">
                      {formatSourceScores(match) || "—"}
                    </div>
                    {match.matched_fields.length > 0 ? (
                      <div className="text-muted-foreground text-xs">
                        {t("settings.searchIndex.test.fields")}:{" "}
                        {match.matched_fields.join(", ")}
                      </div>
                    ) : null}
                  </div>
                  <div className="font-semibold text-sm tabular-nums sm:text-right">
                    {match.score.toFixed(3)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("settings.searchIndex.test.empty")}
            </p>
          )}
        </div>
      ) : null}
    </SettingsFormSection>
  );
}
