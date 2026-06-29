import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Button, Input, SettingsFormSection } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { RefreshCcw, Search } from "lucide-react";
import { useState } from "react";
import {
  getChatSearchIndexStatus,
  reindexChatSearchIndex,
  searchChatIndex,
} from "@/lib/ai-chat-session-search-index-api";
import { formatRelativeTime } from "./derive-session-stats";
import { DevelopmentIndexStat } from "./development-index-stat";

const CHAT_SEARCH_INDEX_QUERY_KEY = ["development", "chat-search-index"];

export function DevelopmentSessionSearchSection() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [testSearchQuery, setTestSearchQuery] = useState(
    "deployment checklist"
  );

  const statusQuery = useQuery({
    queryKey: CHAT_SEARCH_INDEX_QUERY_KEY,
    queryFn: ({ signal }) => getChatSearchIndexStatus(signal),
  });

  const rebuildMutation = useMutation({
    mutationFn: () => reindexChatSearchIndex({ limit: 200 }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: CHAT_SEARCH_INDEX_QUERY_KEY,
      });
    },
  });

  const testSearchMutation = useMutation({
    mutationFn: (query: string) => searchChatIndex(query),
  });

  const status = statusQuery.data;
  const missing = status?.missing_count ?? 0;
  const isRebuilding = rebuildMutation.isPending;
  const isTestingSearch = testSearchMutation.isPending;
  const trimmedTestSearchQuery = testSearchQuery.trim();

  const runTestSearch = () => {
    if (!trimmedTestSearchQuery) {
      return;
    }
    testSearchMutation.mutate(trimmedTestSearchQuery);
  };

  return (
    <SettingsFormSection
      description={t("settings.development.sessionIndex.description")}
      title={t("settings.development.sessionIndex.title")}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DevelopmentIndexStat
          label={t("settings.development.sessionIndex.totalSessions")}
          value={statusQuery.isLoading ? "—" : String(status?.total_count ?? 0)}
        />
        <DevelopmentIndexStat
          label={t("settings.development.sessionIndex.indexedSessions")}
          value={
            statusQuery.isLoading ? "—" : String(status?.indexed_count ?? 0)
          }
        />
        <DevelopmentIndexStat
          emphasis={missing > 0 ? "destructive" : "default"}
          label={t("settings.development.sessionIndex.indexMissing")}
          value={statusQuery.isLoading ? "—" : String(missing)}
        />
        <DevelopmentIndexStat
          hint={t("settings.development.sessionIndex.lastIndexedHint")}
          label={t("settings.development.sessionIndex.lastIndexed")}
          value={
            statusQuery.isLoading
              ? "—"
              : formatRelativeTime(status?.last_indexed_at ?? null)
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
        <Button
          disabled={statusQuery.isFetching}
          onClick={() => void statusQuery.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          {statusQuery.isFetching ? (
            <AnimatedLoaderIcon play="always" size="xs" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          {t("settings.development.refresh")}
        </Button>
        <Button
          disabled={isRebuilding || (status?.total_count ?? 0) === 0}
          onClick={() => rebuildMutation.mutate()}
          size="sm"
          type="button"
        >
          {isRebuilding ? (
            <AnimatedLoaderIcon play="always" size="xs" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          {t("settings.development.sessionIndex.rebuildIndex")}
        </Button>
      </div>

      {rebuildMutation.data &&
      typeof rebuildMutation.data.processed === "number" ? (
        <p className="text-muted-foreground text-sm">
          {t("settings.development.sessionIndex.rebuildSummary", {
            failed: rebuildMutation.data.failed ?? 0,
            processed: rebuildMutation.data.processed,
          })}
        </p>
      ) : null}

      {statusQuery.isError ? (
        <p className="text-destructive text-sm">
          {t("settings.development.sessionIndex.loadFailed")}
        </p>
      ) : null}

      {rebuildMutation.isError ? (
        <p className="text-destructive text-sm">
          {t("settings.development.sessionIndex.rebuildFailed")}
          {rebuildMutation.error instanceof Error
            ? `: ${rebuildMutation.error.message}`
            : null}
        </p>
      ) : null}

      <form
        className="space-y-3 border-t pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          runTestSearch();
        }}
      >
        <div className="space-y-1">
          <label
            className="font-medium text-sm"
            htmlFor="session-search-index-test-search"
          >
            {t("settings.development.sessionIndex.testSearchTitle")}
          </label>
          <p className="text-muted-foreground text-sm">
            {t("settings.development.sessionIndex.testSearchDescription")}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="session-search-index-test-search"
            onChange={(event) => setTestSearchQuery(event.target.value)}
            placeholder={t(
              "settings.development.sessionIndex.testSearchPlaceholder"
            )}
            value={testSearchQuery}
          />
          <Button
            className="sm:w-auto"
            disabled={isTestingSearch || !trimmedTestSearchQuery}
            type="submit"
          >
            {isTestingSearch ? (
              <AnimatedLoaderIcon play="always" size="xs" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            {t("settings.development.sessionIndex.testSearch")}
          </Button>
        </div>

        {testSearchMutation.isError ? (
          <p className="text-destructive text-sm">
            {t("settings.development.sessionIndex.testSearchFailed")}
            {testSearchMutation.error instanceof Error
              ? `: ${testSearchMutation.error.message}`
              : null}
          </p>
        ) : null}

        {testSearchMutation.data ? (
          <div className="space-y-2">
            <div className="text-muted-foreground text-sm">
              {t("settings.development.sessionIndex.testSearchSummary", {
                count: testSearchMutation.data.total,
              })}
            </div>
            {testSearchMutation.data.matches.length > 0 ? (
              <div className="divide-y rounded-md border">
                {testSearchMutation.data.matches.map((match, index) => (
                  <div
                    className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-start"
                    key={`${match.doc_id}-${index}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-muted-foreground text-xs">
                        {match.item.session_id}
                      </div>
                      <div className="line-clamp-3 text-muted-foreground text-xs">
                        {match.item.text}
                      </div>
                    </div>
                    <div className="text-muted-foreground text-xs sm:text-right">
                      {t("settings.development.sessionIndex.score")}:{" "}
                      {match.score.toFixed(3)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("settings.development.sessionIndex.testSearchEmpty")}
              </p>
            )}
          </div>
        ) : null}
      </form>
    </SettingsFormSection>
  );
}
