import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, Input } from "@engenty/ui-core";
import { ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { MarketplaceSpecialCards } from "./marketplace-executor.js";
import { MarketplaceImport } from "./marketplace-import.js";
import {
  isRecommendedPlugin,
  type MarketplacePlugin,
  pluginMatchesQuery,
} from "./marketplace-model.js";
import { MarketplacePluginRow, RegistryLogo } from "./marketplace-row.js";

type MarketplaceFilter =
  | "all"
  | "installed"
  | "marketplace"
  | "mcp"
  | "recommended";

const FEATURED_DOMAINS = [
  { domain: "figma.com", name: "Figma" },
  { domain: "github.com", name: "GitHub" },
  { domain: "stripe.com", name: "Stripe" },
  { domain: "slack.com", name: "Slack" },
  { domain: "linear.app", name: "Linear" },
  { domain: "makenotion.com", name: "Notion" },
] as const;

export function MarketplaceBrowse({
  canImport,
  installedIds,
  needsAuthIds,
  onAdd,
  onImported,
  onOpenCatalog,
  onOpenExecutor,
  onOpen,
  plugins,
  query,
  saving,
  setQuery,
}: {
  canImport: boolean;
  installedIds: ReadonlySet<string>;
  needsAuthIds: ReadonlySet<string>;
  onAdd: (plugin: MarketplacePlugin) => void;
  onImported: (connectorId: string) => void;
  onOpen: (plugin: MarketplacePlugin) => void;
  onOpenCatalog: (domain: string) => void;
  onOpenExecutor: () => void;
  plugins: MarketplacePlugin[];
  query: string;
  saving: boolean;
  setQuery: (query: string) => void;
}) {
  const { t } = useTranslation("connections");
  const [filter, setFilter] = useState<MarketplaceFilter>("all");
  const searching = query.trim().length > 0;
  const visible = searching
    ? plugins.filter((plugin) => pluginMatchesQuery(plugin, query))
    : plugins;
  const installed = visible.filter((plugin) => installedIds.has(plugin.id));
  const recommended = visible.filter(
    (plugin) => isRecommendedPlugin(plugin) && !installedIds.has(plugin.id)
  );
  const other = visible.filter(
    (plugin) => !(installedIds.has(plugin.id) || isRecommendedPlugin(plugin))
  );
  const shown =
    filter === "installed"
      ? installed
      : filter === "recommended"
        ? recommended
        : filter === "all"
          ? searching
            ? [...installed, ...recommended, ...other]
            : recommended
          : [];
  const showRegistry =
    canImport &&
    searching &&
    (filter === "all" || filter === "marketplace");
  const showGrid = filter !== "mcp" && filter !== "marketplace";
  const showFeatured = filter === "marketplace" && !searching;

  const renderCard = (plugin: MarketplacePlugin) => (
    <MarketplacePluginRow
      installed={installedIds.has(plugin.id)}
      key={plugin.id}
      needsAuth={needsAuthIds.has(plugin.id)}
      onAdd={() => onAdd(plugin)}
      onOpen={() => onOpen(plugin)}
      plugin={plugin}
      saving={saving}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", t("marketplace.filterAll")],
            ["recommended", t("marketplace.recommended")],
            ["installed", t("marketplace.filterInstalled")],
            ...(canImport
              ? ([["mcp", t("marketplace.filterMcp")]] as const)
              : []),
            ...(canImport
              ? ([["marketplace", t("marketplace.filterMarketplace")]] as const)
              : []),
          ] as const
        ).map(([id, label]) => (
          <Button
            className={cn(
              "h-7 rounded-full px-3 text-xs",
              filter === id &&
                "bg-foreground text-background hover:bg-foreground/90"
            )}
            key={id}
            onClick={() => setFilter(id)}
            size="sm"
            type="button"
            variant={filter === id ? "default" : "outline"}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t("marketplace.search")}
          className="pl-8"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            filter === "marketplace"
              ? t("marketplace.searchCatalog")
              : t("marketplace.search")
          }
          type="search"
          value={query}
        />
      </div>
      {filter === "all" && installed.length > 0 && !searching ? (
        <button
          className="flex items-center gap-1 text-left text-sm"
          onClick={() => setFilter("installed")}
          type="button"
        >
          <span className="font-medium">
            {t("marketplace.installedCount", { count: installed.length })}
          </span>
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </button>
      ) : null}
      {showFeatured ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            {t("marketplace.marketplaceIntro")}
          </p>
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-sm">
              {t("marketplace.marketplaceFeatured")}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {FEATURED_DOMAINS.map((item) => (
                <button
                  className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 text-left hover:bg-accent/40"
                  key={item.domain}
                  onClick={() => onOpenCatalog(item.domain)}
                  type="button"
                >
                  <RegistryLogo domain={item.domain} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-sm">
                      {item.name}
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {item.domain}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {filter === "mcp" && canImport ? (
        <MarketplaceImport
          onImported={onImported}
          onOpen={onOpenCatalog}
          query=""
          showPaste
        />
      ) : null}
      {showGrid ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {canImport && filter !== "installed" && !searching ? (
            <MarketplaceSpecialCards
              onOpenExecutor={onOpenExecutor}
              onOpenMcp={() => setFilter("mcp")}
            />
          ) : null}
          {shown.map(renderCard)}
        </div>
      ) : null}
      {showRegistry ? (
        <MarketplaceImport
          onImported={onImported}
          onOpen={onOpenCatalog}
          query={query}
          showPaste={false}
        />
      ) : null}
      {showGrid &&
      shown.length === 0 &&
      !(searching && (filter === "all" || filter === "marketplace")) ? (
        <div className="flex flex-col items-center gap-2 px-2 py-6">
          <p className="text-center text-muted-foreground text-sm">
            {searching
              ? t("marketplace.noMatches")
              : t("marketplace.searchPrompt")}
          </p>
          {searching && canImport && filter !== "marketplace" ? (
            <button
              className="text-sm underline"
              onClick={() => setFilter("marketplace")}
              type="button"
            >
              {t("marketplace.searchInMarketplace", {
                defaultValue: "Search in Marketplace",
              })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
