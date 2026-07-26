import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  AdminListCardsView,
  AdminListTableView,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Checkbox,
  type ColumnConfig,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuTrigger,
  Input,
  ListDisplayConfigurator,
  ListSearchInput,
  ListToolbarIconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectionCell,
  TableSelectionHeader,
  TableSortableHeader,
  useListDisplayState,
  useTableSelection,
} from "@engenty/ui-core";
import {
  Bot,
  Calendar,
  DollarSign,
  Download,
  Gauge,
  History,
  Layers,
  Power,
  RefreshCw,
  RotateCcw,
  Route,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import {
  AI_MODEL_PRICE_TIERS,
  AI_MODEL_USE_CASES,
  type AiGatewayModel,
  type AiModelPriceTier,
  type AiModelUseCase,
  restoreModelPricingDefaults,
  syncGatewayModels,
  updateGatewayModelAvailability,
} from "@/lib/api/ai-models";
import {
  AI_MODELS_QUERY_KEY,
  gatewayModelSyncRunsQuery,
  gatewayModelsQuery,
} from "@/lib/queries/ai-models";
import {
  ACTIVATION_FILTERS,
  type ActivationFilter,
  activationBadgeClassName,
  activationFlagsForModel,
  activationStatus,
  CATALOG_DISPLAY_DEFAULTS,
  CATALOG_SORT_COLUMNS,
  type CatalogColumnKey,
  type CatalogSortColumn,
  dollarsToMicros,
  formatMicros,
  formatTokens,
  isModelActivated,
  isWithinReleaseAge,
  priceTierBadgeClassName,
  pricingSeedsFromModels,
  RELEASE_AGE_FILTERS,
  type ReleaseAgeFilter,
  sortGatewayModels,
  syncStatusBadgeClassName,
} from "./model-catalog";

const ALL = "all";

/** Sortable catalog columns keyed by the display column they render under. */
const SORT_COLUMN_BY_KEY: Partial<Record<CatalogColumnKey, CatalogSortColumn>> =
  {
    activated: "activated",
    model: "model",
    outputPrice: "output_price",
    priceTier: "price_tier",
    releaseDate: "released_at",
  };

export function AiModelsPage() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [gateway, setGateway] = useState<string>(ALL);
  const [provider, setProvider] = useState<string>(ALL);
  const [useCase, setUseCase] = useState<AiModelUseCase | typeof ALL>(ALL);
  const [maxPriceTier, setMaxPriceTier] = useState<
    AiModelPriceTier | typeof ALL
  >(ALL);
  const [maxOutputDollars, setMaxOutputDollars] = useState("");
  const [webSearchOnly, setWebSearchOnly] = useState(false);
  const [activationFilter, setActivationFilter] =
    useState<ActivationFilter>(ALL);
  const [releaseAgeFilter, setReleaseAgeFilter] =
    useState<ReleaseAgeFilter>(ALL);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [syncRunsOpen, setSyncRunsOpen] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const display = useListDisplayState<CatalogColumnKey, CatalogSortColumn>({
    storageKey: "manage.ai-models.catalog",
    defaults: CATALOG_DISPLAY_DEFAULTS,
    validSortColumns: CATALOG_SORT_COLUMNS,
  });
  const {
    columnOrder,
    columnVisibility,
    sortBy,
    sortOrder,
    tableSize,
    viewMode,
  } = display;
  const compact = tableSize === "compact";

  // Server-side filters; the activation and release-age filters below are
  // client-side because the catalog endpoint does not model them.
  const filters = useMemo(
    () => ({
      ...(gateway === ALL ? {} : { gateway }),
      ...(provider === ALL ? {} : { provider }),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(useCase === ALL ? {} : { use_case: useCase }),
      ...(maxPriceTier === ALL ? {} : { max_price_tier: maxPriceTier }),
      ...(dollarsToMicros(maxOutputDollars) == null
        ? {}
        : { max_output_per_mtok_micros: dollarsToMicros(maxOutputDollars) }),
      ...(webSearchOnly ? { web_search: true } : {}),
    }),
    [
      gateway,
      maxOutputDollars,
      maxPriceTier,
      provider,
      search,
      useCase,
      webSearchOnly,
    ]
  );

  const models = useQuery(gatewayModelsQuery(filters));
  const syncRuns = useQuery(gatewayModelSyncRunsQuery());
  const latestRun = syncRuns.data?.[0];

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: AI_MODELS_QUERY_KEY }),
    [queryClient]
  );

  const sync = useMutation({
    mutationFn: () => syncGatewayModels({ update_pricing: true }),
    onSuccess: async () => {
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const restore = useMutation({
    mutationFn: restoreModelPricingDefaults,
    onSuccess: async (data) => {
      setRestoreMessage(
        t("aiModels.restoreDefaultsSuccess", {
          count: data.restored,
          availability: data.availability_restored,
        })
      );
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const availability = useMutation({
    mutationFn: updateGatewayModelAvailability,
    onSuccess: async () => {
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const allModels = models.data ?? [];
  const providers = useMemo(
    () => [...new Set(allModels.map((model) => model.provider))].sort(),
    [allModels]
  );
  // Derived from the loaded page, so a gateway with no rows left never offers a
  // filter that would return nothing.
  const gateways = useMemo(
    () => [...new Set(allModels.map((model) => model.gateway))].sort(),
    [allModels]
  );

  const rows = useMemo(() => {
    const nowMs = Date.now();
    const filtered = allModels.filter((model) => {
      const activated = isModelActivated(model);
      const matchesActivation =
        activationFilter === ALL ||
        (activationFilter === "active" ? activated : !activated);
      return (
        matchesActivation && isWithinReleaseAge(model, releaseAgeFilter, nowMs)
      );
    });
    // `id` mirrors `model_id` so the shared selection hook can key on it.
    return sortGatewayModels(filtered, sortBy, sortOrder).map((model) => ({
      ...model,
      id: model.model_id,
    }));
  }, [activationFilter, allModels, releaseAgeFilter, sortBy, sortOrder]);

  const selection = useTableSelection({ items: rows });
  const { clearSelection, handleSelectAll, handleSelectOne, selectedIds } =
    selection;

  const setActivation = useCallback(
    (model: AiGatewayModel, activated: boolean) => {
      availability.mutate({
        gateway: model.gateway,
        model_id: model.model_id,
        ...activationFlagsForModel(model, activated),
      });
    },
    [availability]
  );

  const setBulkActivation = useCallback(
    async (activated: boolean) => {
      const selected = rows.filter((model) => selectedIds.has(model.id));
      await Promise.all(
        selected.map((model) =>
          availability.mutateAsync({
            gateway: model.gateway,
            model_id: model.model_id,
            ...activationFlagsForModel(model, activated),
          })
        )
      );
      clearSelection();
    },
    [availability, clearSelection, rows, selectedIds]
  );

  const downloadPricing = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify(pricingSeedsFromModels(allModels), null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "default-pricing.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [allModels]);

  const handleSortChange = useCallback(
    (column: CatalogSortColumn) => {
      if (sortBy === column) {
        display.setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        display.setSortBy(column);
      }
    },
    [display, sortBy, sortOrder]
  );

  const columnLabels = useMemo<Record<CatalogColumnKey, string>>(
    () => ({
      activated: t("aiModels.columns.activated"),
      cachedPrice: t("aiModels.columns.cachedPerMtok"),
      capabilities: t("aiModels.columns.capabilities"),
      context: t("aiModels.columns.context"),
      gateway: t("aiModels.columns.gateway"),
      inputPrice: t("aiModels.columns.inputPerMtok"),
      model: t("aiModels.columns.model"),
      outputPrice: t("aiModels.columns.outputPerMtok"),
      priceTier: t("aiModels.columns.priceTier"),
      releaseDate: t("aiModels.columns.releaseDate"),
      useCase: t("aiModels.columns.useCase"),
    }),
    [t]
  );

  const columns = useMemo<ColumnConfig<CatalogColumnKey>[]>(
    () => [
      { key: "activated", label: columnLabels.activated, icon: Power },
      { key: "model", label: columnLabels.model, icon: Bot },
      { key: "gateway", label: columnLabels.gateway, icon: Route },
      { key: "useCase", label: columnLabels.useCase, icon: Layers },
      { key: "priceTier", label: columnLabels.priceTier, icon: DollarSign },
      { key: "context", label: columnLabels.context, icon: Gauge },
      { key: "releaseDate", label: columnLabels.releaseDate, icon: Calendar },
      { key: "capabilities", label: columnLabels.capabilities, icon: Layers },
      { key: "inputPrice", label: columnLabels.inputPrice, icon: DollarSign },
      { key: "outputPrice", label: columnLabels.outputPrice, icon: DollarSign },
      { key: "cachedPrice", label: columnLabels.cachedPrice, icon: DollarSign },
    ],
    [columnLabels]
  );

  const pageActions = useMemo(
    () => (
      <div className="flex shrink-0 items-center gap-1">
        <Button
          disabled={sync.isPending}
          onClick={() => {
            setRestoreMessage(null);
            sync.mutate();
          }}
          size="sm"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 shrink-0 ${sync.isPending ? "animate-spin" : ""}`}
          />
          <span className="hidden sm:inline">{t("aiModels.sync")}</span>
        </Button>
        <Button
          disabled={allModels.length === 0}
          onClick={downloadPricing}
          size="sm"
          variant="outline"
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">{t("aiModels.download")}</span>
        </Button>
        <Button
          disabled={restore.isPending}
          onClick={() => {
            setRestoreMessage(null);
            setRestoreOpen(true);
          }}
          size="sm"
          variant="outline"
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">
            {t("aiModels.restoreDefaults")}
          </span>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/ai-models/pricing-history">
            <History className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline">{t("aiModels.history")}</span>
          </Link>
        </Button>
      </div>
    ),
    [allModels.length, downloadPricing, restore.isPending, sync, t]
  );

  const breadcrumbs = useMemo(() => [{ label: t("aiModels.title") }], [t]);

  return (
    <PageShell actions={pageActions} breadcrumbs={breadcrumbs}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        <p className="text-muted-foreground text-sm">
          {t("aiModels.description")}
        </p>

        {sync.isSuccess ? (
          <p className="text-muted-foreground text-sm">
            {t("aiModels.syncSuccess", {
              count: sync.data.model_count,
              pricing: sync.data.inserted_pricing_count,
            })}
          </p>
        ) : null}
        {restoreMessage ? (
          <p className="text-muted-foreground text-sm">{restoreMessage}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <ListSearchInput
            className="w-full sm:max-w-md"
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("aiModels.list.searchPlaceholder")}
            value={search}
            wrapperClassName="w-full sm:w-auto"
          />
          <p className="shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
            {t("aiModels.list.paginationSummary", {
              count: rows.length,
              total: allModels.length,
            })}
          </p>
          {selectedIds.size > 0 ? (
            <>
              <Button
                disabled={availability.isPending}
                onClick={() => void setBulkActivation(true)}
                size="sm"
                variant="outline"
              >
                {t("aiModels.activateSelected", { count: selectedIds.size })}
              </Button>
              <Button
                disabled={availability.isPending}
                onClick={() => void setBulkActivation(false)}
                size="sm"
                variant="outline"
              >
                {t("aiModels.deactivateSelected", { count: selectedIds.size })}
              </Button>
              <Button onClick={clearSelection} size="sm" variant="ghost">
                <X className="h-3.5 w-3.5" />
                {t("aiModels.clearSelection")}
              </Button>
            </>
          ) : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <ListToolbarIconButton
                aria-label={t("aiModels.list.display")}
                className="ml-auto"
                type="button"
              >
                <SlidersHorizontal />
              </ListToolbarIconButton>
            </DropdownMenuTrigger>
            <ListDisplayConfigurator<CatalogColumnKey, CatalogSortColumn>
              columnOrder={columnOrder}
              columns={columns}
              columnVisibility={columnVisibility}
              labels={{
                table: t("aiModels.list.tableView"),
                cards: t("aiModels.list.cardsView"),
                compactView: t("aiModels.list.compactView"),
                sortBy: t("aiModels.list.sortBy"),
                ascending: t("aiModels.list.ascending"),
                descending: t("aiModels.list.descending"),
                displayedInTable: t("aiModels.list.displayedColumns"),
                hiddenInTable: t("aiModels.list.hiddenInTable"),
                showAll: t("aiModels.list.showAll"),
                hideAll: t("aiModels.list.hideAll"),
                noColumnsDisplayed: t("aiModels.list.noColumnsDisplayed"),
              }}
              setColumnOrder={display.setColumnOrder}
              setColumnVisibility={display.setColumnVisibility}
              setSortBy={display.setSortBy}
              setSortOrder={display.setSortOrder}
              setTableSize={display.setTableSize}
              setViewMode={display.setViewMode}
              sortBy={sortBy}
              sortOptions={[
                { value: "activated", label: columnLabels.activated },
                { value: "model", label: columnLabels.model },
                { value: "provider", label: t("aiModels.columns.provider") },
                { value: "price_tier", label: columnLabels.priceTier },
                { value: "output_price", label: columnLabels.outputPrice },
                { value: "released_at", label: columnLabels.releaseDate },
              ]}
              sortOrder={sortOrder}
              tableSize={tableSize}
              viewMode={viewMode}
            />
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label={t("aiModels.columns.useCase")}
            onChange={(value) =>
              setUseCase(value as AiModelUseCase | typeof ALL)
            }
            options={[
              { value: ALL, label: t("aiModels.useCase.all") },
              ...AI_MODEL_USE_CASES.map((value) => ({
                value,
                label: t(`aiModels.useCase.${value}`),
              })),
            ]}
            value={useCase}
          />
          <FilterSelect
            label={t("aiModels.columns.gateway")}
            onChange={setGateway}
            options={[
              { value: ALL, label: t("aiModels.filters.allGateways") },
              ...gateways.map((value) => ({ value, label: value })),
            ]}
            value={gateway}
          />
          <FilterSelect
            label={t("aiModels.columns.provider")}
            onChange={setProvider}
            options={[
              { value: ALL, label: t("aiModels.filters.allProviders") },
              ...providers.map((value) => ({ value, label: value })),
            ]}
            value={provider}
          />
          <FilterSelect
            label={t("aiModels.columns.activated")}
            onChange={(value) => setActivationFilter(value as ActivationFilter)}
            options={ACTIVATION_FILTERS.map((value) => ({
              value,
              label: t(`aiModels.activationFilter.${value}`),
            }))}
            value={activationFilter}
          />
          <FilterSelect
            label={t("aiModels.filters.age")}
            onChange={(value) => setReleaseAgeFilter(value as ReleaseAgeFilter)}
            options={RELEASE_AGE_FILTERS.map((value) => ({
              value,
              label: t(`aiModels.age.${value}`),
            }))}
            value={releaseAgeFilter}
          />
          <FilterSelect
            label={t("aiModels.filters.maxPriceTier")}
            onChange={(value) =>
              setMaxPriceTier(value as AiModelPriceTier | typeof ALL)
            }
            options={[
              { value: ALL, label: t("aiModels.priceTier.all") },
              ...AI_MODEL_PRICE_TIERS.map((value) => ({
                value,
                label: t(`aiModels.priceTier.${value}`),
              })),
            ]}
            value={maxPriceTier}
          />
          <Input
            aria-label={t("aiModels.filters.maxOutputPrice")}
            className="h-8 w-40"
            inputMode="decimal"
            onChange={(e) => setMaxOutputDollars(e.target.value)}
            placeholder={t("aiModels.filters.maxOutputPrice")}
            value={maxOutputDollars}
          />
          <div className="flex h-8 items-center gap-2 text-sm">
            <Checkbox
              checked={webSearchOnly}
              id="ai-models-web-search"
              onCheckedChange={(checked) => setWebSearchOnly(checked === true)}
            />
            <label htmlFor="ai-models-web-search">
              {t("aiModels.filters.webSearchOnly")}
            </label>
          </div>
          {latestRun ? (
            <button
              className="ml-auto flex items-center gap-2 text-muted-foreground text-xs hover:text-foreground"
              onClick={() => setSyncRunsOpen(true)}
              type="button"
            >
              <span>{t("aiModels.lastSync")}</span>
              <Badge
                className={syncStatusBadgeClassName(latestRun.status)}
                variant="outline"
              >
                {t(`aiModels.syncStatus.${latestRun.status}`)}
              </Badge>
              <span>{new Date(latestRun.started_at).toLocaleString()}</span>
            </button>
          ) : null}
        </div>

        <PageState
          error={models.error}
          isEmpty={rows.length === 0}
          isLoading={models.isLoading}
          onRetry={() => void models.refetch()}
        >
          {viewMode === "cards" ? (
            <AdminListCardsView bottomFade>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((model) => (
                  <ModelCard
                    key={model.model_id}
                    model={model}
                    onActivationChange={setActivation}
                    onSelectChange={handleSelectOne}
                    pending={availability.isPending}
                    selected={selectedIds.has(model.id)}
                    t={t}
                  />
                ))}
              </div>
            </AdminListCardsView>
          ) : (
            <AdminListTableView bottomFade stickyHeaderShadow transparent>
              <Table noWrapper>
                <TableHeader className={STICKY_HEADER_CLASS}>
                  <TableRow
                    className={`group border-b-0 hover:bg-transparent ${compact ? "[&>th]:py-1.5!" : "[&>th]:py-3!"}`}
                  >
                    <TableSelectionHeader
                      aria-label={t("aiModels.selectAll")}
                      checked={
                        selection.someSelected && !selection.allSelected
                          ? "indeterminate"
                          : selection.allSelected
                      }
                      compact={compact}
                      onCheckedChange={handleSelectAll}
                    />
                    {columnOrder
                      .filter((key) => columnVisibility[key])
                      .map((key) => {
                        const sortColumn = SORT_COLUMN_BY_KEY[key];
                        return sortColumn ? (
                          <TableSortableHeader<CatalogSortColumn>
                            className={
                              key === "outputPrice" ? "text-right" : undefined
                            }
                            column={sortColumn}
                            compact={compact}
                            key={key}
                            onSort={handleSortChange}
                            sortBy={sortBy}
                            sortOrder={sortOrder}
                          >
                            {columnLabels[key]}
                          </TableSortableHeader>
                        ) : (
                          <TableHead
                            className={`${compact ? "h-8 py-1.5!" : ""} ${
                              key === "capabilities"
                                ? "wrap-break-word w-64 max-w-64 whitespace-normal"
                                : ""
                            }`}
                            key={key}
                          >
                            {columnLabels[key]}
                          </TableHead>
                        );
                      })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((model) => (
                    <TableRow
                      className={`group ${compact ? "[&>td]:py-1.5!" : "[&>td]:py-3!"}`}
                      data-state={
                        selectedIds.has(model.id) ? "selected" : undefined
                      }
                      key={model.model_id}
                    >
                      <TableSelectionCell
                        checked={selectedIds.has(model.id)}
                        compact={compact}
                        hoverReveal
                        id={model.id}
                        onCheckedChange={handleSelectOne}
                      />
                      {columnOrder
                        .filter((key) => columnVisibility[key])
                        .map((key) => (
                          <ModelCell
                            column={key}
                            key={key}
                            model={model}
                            onActivationChange={setActivation}
                            pending={availability.isPending}
                            t={t}
                          />
                        ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminListTableView>
          )}
        </PageState>
      </div>

      <AlertDialog onOpenChange={setRestoreOpen} open={restoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("aiModels.restoreDefaults")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("aiModels.restoreDefaultsConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRestoreOpen(false);
                restore.mutate();
              }}
            >
              {t("aiModels.restoreDefaults")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog onOpenChange={setSyncRunsOpen} open={syncRunsOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("aiModels.syncRuns.title")}</DialogTitle>
          </DialogHeader>
          {(syncRuns.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("aiModels.syncRuns.empty")}
            </p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("aiModels.syncRuns.startedAt")}</TableHead>
                    <TableHead>{t("aiModels.syncRuns.status")}</TableHead>
                    <TableHead>{t("aiModels.syncRuns.trigger")}</TableHead>
                    <TableHead className="text-right">
                      {t("aiModels.syncRuns.models")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("aiModels.syncRuns.updated")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("aiModels.syncRuns.pricingRows")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(syncRuns.data ?? []).map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="text-xs">
                        {new Date(run.started_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={syncStatusBadgeClassName(run.status)}
                          variant="outline"
                        >
                          {t(`aiModels.syncStatus.${run.status}`)}
                        </Badge>
                        {run.error_text ? (
                          <p className="mt-1 text-destructive text-xs">
                            {run.error_text}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        {t(`aiModels.syncTrigger.${run.trigger}`)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {run.model_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {run.updated_model_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {run.inserted_pricing_count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger aria-label={label} className="h-8 w-auto min-w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type Translate = (key: string, params?: Record<string, unknown>) => string;

function ActivationToggle({
  model,
  onActivationChange,
  pending,
  t,
}: {
  model: AiGatewayModel;
  onActivationChange: (model: AiGatewayModel, activated: boolean) => void;
  pending: boolean;
  t: Translate;
}) {
  return (
    <Checkbox
      aria-label={t("aiModels.toggleActivation", { model: model.model_id })}
      checked={isModelActivated(model)}
      disabled={pending}
      onCheckedChange={(checked) => onActivationChange(model, checked === true)}
    />
  );
}

function ActivationBadge({
  model,
  t,
}: {
  model: AiGatewayModel;
  t: Translate;
}) {
  const status = activationStatus(model);
  return (
    <Badge className={activationBadgeClassName(status)} variant="outline">
      {t(`aiModels.activation.${status}`)}
    </Badge>
  );
}

function ModelCell({
  column,
  model,
  onActivationChange,
  pending,
  t,
}: {
  column: CatalogColumnKey;
  model: AiGatewayModel;
  onActivationChange: (model: AiGatewayModel, activated: boolean) => void;
  pending: boolean;
  t: Translate;
}) {
  switch (column) {
    case "activated":
      return (
        <TableCell>
          <div className="flex items-center gap-2">
            <ActivationToggle
              model={model}
              onActivationChange={onActivationChange}
              pending={pending}
              t={t}
            />
            <ActivationBadge model={model} t={t} />
          </div>
        </TableCell>
      );
    case "model":
      return (
        <TableCell>
          <div className="space-y-0.5">
            <div className="font-medium">
              {model.display_name ?? model.model_id}
            </div>
            <div className="font-mono text-muted-foreground text-xs">
              {model.model_id}
            </div>
            <div className="text-muted-foreground text-xs">
              {model.providers.join(", ")}
            </div>
          </div>
        </TableCell>
      );
    case "gateway":
      return <TableCell className="text-xs">{model.gateway}</TableCell>;
    case "useCase":
      return (
        <TableCell className="text-xs">{model.use_cases.join(", ")}</TableCell>
      );
    case "priceTier":
      return (
        <TableCell className="text-xs">
          <Badge
            className={priceTierBadgeClassName(model.price_tier)}
            variant="outline"
          >
            {t(`aiModels.priceTier.${model.price_tier ?? "unknown"}`)}
          </Badge>
        </TableCell>
      );
    case "context":
      return (
        <TableCell className="text-xs">
          {formatTokens(model.context_tokens)}
        </TableCell>
      );
    case "releaseDate":
      return (
        <TableCell className="text-xs">
          {model.released_at
            ? new Date(model.released_at).toLocaleDateString()
            : "—"}
        </TableCell>
      );
    case "capabilities":
      return (
        <TableCell className="wrap-break-word w-64 max-w-64 whitespace-normal text-xs">
          {model.tags.length > 0 ? model.tags.join(", ") : "—"}
        </TableCell>
      );
    case "inputPrice":
      return (
        <TableCell className="text-right">
          {formatMicros(model.input_per_mtok_micros)}
        </TableCell>
      );
    case "outputPrice":
      return (
        <TableCell className="text-right">
          {formatMicros(model.output_per_mtok_micros)}
        </TableCell>
      );
    default:
      return (
        <TableCell className="text-right">
          {formatMicros(model.cached_input_per_mtok_micros)}
        </TableCell>
      );
  }
}

function ModelCard({
  model,
  onActivationChange,
  onSelectChange,
  pending,
  selected,
  t,
}: {
  model: AiGatewayModel & { id: string };
  onActivationChange: (model: AiGatewayModel, activated: boolean) => void;
  onSelectChange: (id: string, checked: boolean) => void;
  pending: boolean;
  selected: boolean;
  t: Translate;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <Checkbox
          aria-label={t("aiModels.selectRow")}
          checked={selected}
          onCheckedChange={(checked) =>
            onSelectChange(model.id, checked === true)
          }
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="truncate font-medium text-sm">
              {model.display_name ?? model.model_id}
            </p>
            <p className="truncate font-mono text-muted-foreground text-xs">
              {model.model_id}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ActivationBadge model={model} t={t} />
            <Badge
              className={priceTierBadgeClassName(model.price_tier)}
              variant="outline"
            >
              {t(`aiModels.priceTier.${model.price_tier ?? "unknown"}`)}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            {model.gateway} · {model.use_cases.join(", ")} ·{" "}
            {formatMicros(model.output_per_mtok_micros)}
          </p>
        </div>
        <ActivationToggle
          model={model}
          onActivationChange={onActivationChange}
          pending={pending}
          t={t}
        />
      </div>
    </div>
  );
}
