import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  AdminListCardsView,
  AdminListPagination,
  AdminListTableView,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useListDisplayState,
  useListToolbarHotkeys,
} from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PackageSummary } from "@/features/packages/PackageSummary";
import { TenantsCards } from "@/features/tenants/TenantsCards";
import { TenantsTable } from "@/features/tenants/TenantsTable";
import { TenantsTableToolbar } from "@/features/tenants/TenantsTableToolbar";
import {
  TENANTS_LIST_DISPLAY_DEFAULTS,
  type TenantsColumnVisibility,
  type TenantsSortColumn,
} from "@/features/tenants/tenants-list-display";
import type { ManageTenant, TenantTier } from "@/lib/api/tenants";
import { createTenant } from "@/lib/api/tenants";
import { packagesQuery } from "@/lib/queries/entitlements";
import { tenantsQuery } from "@/lib/queries/tenants";

const NO_PACKAGE = "__none__";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function filterAndSort(
  tenants: ManageTenant[],
  search: string,
  sortBy: TenantsSortColumn,
  sortOrder: "asc" | "desc"
): ManageTenant[] {
  let result = tenants;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (tenant) =>
        tenant.name.toLowerCase().includes(q) ||
        tenant.slug.toLowerCase().includes(q)
    );
  }
  return [...result].sort((a, b) => {
    const aVal = sortBy === "name" ? a.name : a.created_at;
    const bVal = sortBy === "name" ? b.name : b.created_at;
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder === "asc" ? cmp : -cmp;
  });
}

export function TenantsListPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(tenantsQuery);
  const packages = useQuery(packagesQuery);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [tier, setTier] = useState<TenantTier>("platform");
  const [packageId, setPackageId] = useState<string>(NO_PACKAGE);

  const display = useListDisplayState<
    keyof TenantsColumnVisibility,
    TenantsSortColumn
  >({
    storageKey: "manage.tenants",
    defaults: TENANTS_LIST_DISPLAY_DEFAULTS,
    validSortColumns: ["name", "created_at"],
  });

  const {
    sortBy,
    sortOrder,
    viewMode,
    tableSize,
    pageSize,
    columnVisibility,
    columnOrder,
    setSortBy,
    setSortOrder,
  } = display;

  const resetCreateForm = () => {
    setName("");
    setSlug("");
    setSlugEdited(false);
    setTier("platform");
    setPackageId(NO_PACKAGE);
  };

  const create = useMutation({
    mutationFn: () =>
      createTenant({
        slug: slug.trim(),
        name: name.trim(),
        tier,
        package_id: packageId === NO_PACKAGE ? null : packageId,
      }),
    onSuccess: async (tenant) => {
      toast.success(t("tenants.create.success"));
      await queryClient.invalidateQueries({ queryKey: ["manage", "tenants"] });
      setCreateOpen(false);
      resetCreateForm();
      navigate(`/tenants/${tenant.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  useListToolbarHotkeys({
    onNewItem: () => setCreateOpen(true),
  });

  const filtered = useMemo(
    () => filterAndSort(data ?? [], search, sortBy, sortOrder),
    [data, search, sortBy, sortOrder]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, sortBy, sortOrder]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const handleSortChange = useCallback(
    (column: TenantsSortColumn) => {
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [sortBy, sortOrder, setSortBy, setSortOrder]
  );

  const openTenant = useCallback(
    (tenant: ManageTenant) => {
      navigate(`/tenants/${tenant.id}`);
    },
    [navigate]
  );

  const packageLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const pkg of packages.data ?? []) {
      map.set(pkg.id, pkg.label);
    }
    return map;
  }, [packages.data]);

  const packageLabel = useCallback(
    (packageId: string | null) => {
      if (!packageId) {
        return t("entitlements.noPackage");
      }
      return packageLabelById.get(packageId) ?? packageId;
    },
    [packageLabelById, t]
  );

  const selectedPackage = useMemo(
    () =>
      packageId === NO_PACKAGE
        ? null
        : ((packages.data ?? []).find((pkg) => pkg.id === packageId) ?? null),
    [packageId, packages.data]
  );

  const pagination = {
    nextLabel: t("common.next"),
    onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
    onPrevious: () => setPage((p) => Math.max(1, p - 1)),
    page,
    pageOfLabel: t("tenants.list.pageOf", { page, totalPages }),
    previousLabel: t("common.previous"),
    totalPages,
  };

  const errorMessage =
    error instanceof Error ? error.message : error ? t("common.error") : null;

  const tenantsTitle = t("tenants.title");

  const pageActions = useMemo(
    () => (
      <Button onClick={() => setCreateOpen(true)} size="sm">
        {t("tenants.new")}
      </Button>
    ),
    [t]
  );

  const breadcrumbs = useMemo(
    () => [
      {
        // Non-primitive label so the shell keeps the text next to the nav icon
        // (string labels are replaced by the icon alone on the root segment).
        label: (
          <span className="font-medium text-foreground text-sm">
            {tenantsTitle}
          </span>
        ),
        menuLabel: tenantsTitle,
        to: "/tenants",
      },
    ],
    [tenantsTitle]
  );

  return (
    <PageShell actions={pageActions} breadcrumbs={breadcrumbs}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        <TenantsTableToolbar
          columnOrder={columnOrder}
          columnVisibility={columnVisibility}
          labels={{
            searchPlaceholder: t("tenants.list.searchPlaceholder"),
            display: t("tenants.list.display"),
            viewModeGroup: t("tenants.list.viewModeGroup"),
            paginationSummary: t("tenants.list.paginationSummary", {
              total: filtered.length,
            }),
            sortByName: t("common.name"),
            sortByCreatedAt: t("common.created"),
            ascending: t("tenants.list.ascending"),
            descending: t("tenants.list.descending"),
            compactView: t("tenants.list.compactView"),
            tableView: t("tenants.list.tableView"),
            cardsView: t("tenants.list.cardsView"),
            sortBy: t("tenants.list.sortBy"),
            displayedColumns: t("tenants.list.displayedColumns"),
            hiddenInTable: t("tenants.list.hiddenInTable"),
            showAll: t("tenants.list.showAll"),
            hideAll: t("tenants.list.hideAll"),
            noColumnsDisplayed: t("tenants.list.noColumnsDisplayed"),
            itemsPerPage: t("tenants.list.itemsPerPage"),
            name: t("common.name"),
            slug: t("tenants.fields.slug"),
            tier: t("tenants.fields.tier"),
            status: t("tenants.fields.status"),
            package: t("tenants.fields.package"),
            createdAt: t("common.created"),
          }}
          onPageSizeChange={(size) => {
            display.setPageSize(size);
            setPage(1);
          }}
          onSearchChange={setSearch}
          onSortByChange={display.setSortBy}
          onSortOrderChange={display.setSortOrder}
          pageSize={pageSize}
          searchQuery={search}
          setColumnOrder={display.setColumnOrder}
          setColumnVisibility={display.setColumnVisibility}
          setTableSize={display.setTableSize}
          setViewMode={display.setViewMode}
          sortBy={sortBy}
          sortOrder={sortOrder}
          tableSize={tableSize}
          viewMode={viewMode}
        />

        {errorMessage ? (
          <div className="space-y-3">
            <p className="text-destructive text-sm">{errorMessage}</p>
            <Button onClick={() => void refetch()} size="sm" variant="outline">
              {t("common.retry")}
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <AdminListTableView stickyHeaderShadow transparent>
            <Table noWrapper>
              <TableHeader>
                <TableRow>
                  {columnOrder
                    .filter((k) => columnVisibility[k])
                    .map((key) => (
                      <TableHead key={key}>
                        <Skeleton className="h-4 w-20" />
                      </TableHead>
                    ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map(
                  (rowKey) => (
                    <TableRow key={rowKey}>
                      {columnOrder
                        .filter((k) => columnVisibility[k])
                        .map((key) => (
                          <TableCell key={key}>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                        ))}
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </AdminListTableView>
        ) : null}

        {!(isLoading || error) && filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("common.empty")}</p>
        ) : null}

        {!(isLoading || error) &&
          filtered.length > 0 &&
          viewMode === "table" && (
            <AdminListTableView
              bottomFade
              pagination={pagination}
              stickyHeaderShadow
              transparent
            >
              <TenantsTable
                columnOrder={columnOrder}
                columnVisibility={columnVisibility}
                onRowClick={openTenant}
                onSortChange={handleSortChange}
                packageLabel={packageLabel}
                sortBy={sortBy}
                sortOrder={sortOrder}
                tableSize={tableSize}
                tenants={pageRows}
              />
            </AdminListTableView>
          )}

        {!(isLoading || error) &&
          filtered.length > 0 &&
          viewMode === "cards" && (
            <>
              <AdminListCardsView bottomFade>
                <TenantsCards
                  columnOrder={columnOrder}
                  columnVisibility={columnVisibility}
                  onCardClick={openTenant}
                  packageLabel={packageLabel}
                  tableSize={tableSize}
                  tenants={pageRows}
                />
              </AdminListCardsView>
              <AdminListPagination {...pagination} />
            </>
          )}
      </div>

      <Dialog
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            resetCreateForm();
          }
        }}
        open={createOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tenants.create.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm" htmlFor="tenant-name">
                {t("tenants.create.nameLabel")}
              </label>
              <Input
                id="tenant-name"
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugEdited) {
                    setSlug(slugify(e.target.value));
                  }
                }}
                value={name}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm" htmlFor="tenant-slug">
                {t("tenants.create.slugLabel")}
              </label>
              <Input
                id="tenant-slug"
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value);
                }}
                value={slug}
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm" id="tenant-tier-label">
                {t("tenants.fields.tier")}
              </span>
              <Select
                onValueChange={(value) => setTier(value as TenantTier)}
                value={tier}
              >
                <SelectTrigger aria-labelledby="tenant-tier-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform">
                    {t("tenants.tier.platform")}
                  </SelectItem>
                  <SelectItem value="satellite">
                    {t("tenants.tier.satellite")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-sm" id="tenant-package-label">
                {t("tenants.fields.package")}
              </span>
              <Select onValueChange={setPackageId} value={packageId}>
                <SelectTrigger aria-labelledby="tenant-package-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PACKAGE}>
                    {t("entitlements.noPackage")}
                  </SelectItem>
                  {(packages.data ?? []).map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPackage ? (
                <PackageSummary pkg={selectedPackage} />
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} variant="outline">
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!(name.trim() && slug.trim()) || create.isPending}
              onClick={() => create.mutate()}
            >
              {t("tenants.create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
