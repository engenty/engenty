// Overview tab: one card per registered provider across both registries
// (core + apps/ai), each with its own health counts, effective config, and
// rebuild control.

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { RefreshCcw } from "lucide-react";
import { listAllProviders } from "@/lib/search-index-admin-api";
import { SearchIndexProviderCard } from "./search-index-provider-card";

export const SEARCH_INDEX_PROVIDERS_QUERY_KEY = [
  "search-index-admin",
  "providers",
];

export function SearchIndexOverviewTab() {
  const { t } = useTranslation("common");
  const providersQuery = useQuery({
    queryKey: SEARCH_INDEX_PROVIDERS_QUERY_KEY,
    queryFn: () => listAllProviders(),
  });

  const providers = providersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {t("settings.searchIndex.overview.description")}
        </p>
        <Button
          disabled={providersQuery.isFetching}
          onClick={() => void providersQuery.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          {providersQuery.isFetching ? (
            <AnimatedLoaderIcon play="always" size="xs" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          {t("settings.searchIndex.overview.reloadProviders")}
        </Button>
      </div>

      {providersQuery.isError ? (
        <p className="text-destructive text-sm">
          {t("settings.searchIndex.overview.providersFailed")}
        </p>
      ) : null}

      {providersQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">
          {t("settings.searchIndex.overview.loading")}
        </p>
      ) : null}

      {!providersQuery.isLoading && providers.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("settings.searchIndex.overview.empty")}
        </p>
      ) : null}

      {providers.map((provider) => (
        <SearchIndexProviderCard key={provider.id} provider={provider} />
      ))}
    </div>
  );
}
