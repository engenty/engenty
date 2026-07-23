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
  Switch,
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
import { UsersCards } from "@/features/users/UsersCards";
import { UsersTable } from "@/features/users/UsersTable";
import { UsersTableToolbar } from "@/features/users/UsersTableToolbar";
import {
  USERS_LIST_DISPLAY_DEFAULTS,
  type UsersColumnVisibility,
  type UsersSortColumn,
} from "@/features/users/users-list-display";
import type { TenantRole } from "@/lib/api/tenants";
import type { ManageUser } from "@/lib/api/users";
import { createUser } from "@/lib/api/users";
import { tenantsQuery } from "@/lib/queries/tenants";
import { usersQuery } from "@/lib/queries/users";

function sortValue(user: ManageUser, sortBy: UsersSortColumn): string {
  if (sortBy === "email") {
    return user.email.toLowerCase();
  }
  if (sortBy === "display_name") {
    return (user.display_name ?? user.email).toLowerCase();
  }
  return user.created_at;
}

function filterAndSort(
  users: ManageUser[],
  search: string,
  sortBy: UsersSortColumn,
  sortOrder: "asc" | "desc"
): ManageUser[] {
  let result = users;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (user) =>
        user.email.toLowerCase().includes(q) ||
        (user.display_name ?? "").toLowerCase().includes(q)
    );
  }
  return [...result].sort((a, b) => {
    const aVal = sortValue(a, sortBy);
    const bVal = sortValue(b, sortBy);
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder === "asc" ? cmp : -cmp;
  });
}

export function UsersListPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(usersQuery);
  const tenants = useQuery(tenantsQuery);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [role, setRole] = useState<TenantRole>("member");
  const [password, setPassword] = useState("");
  const [superAdmin, setSuperAdmin] = useState(false);

  const display = useListDisplayState<
    keyof UsersColumnVisibility,
    UsersSortColumn
  >({
    storageKey: "manage.users",
    defaults: USERS_LIST_DISPLAY_DEFAULTS,
    validSortColumns: ["email", "display_name", "created_at"],
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

  const create = useMutation({
    mutationFn: () =>
      createUser({
        email: email.trim(),
        tenant_id: tenantId,
        display_name: displayName.trim() || undefined,
        password: password.trim() || undefined,
        role,
        is_super_admin: superAdmin,
      }),
    onSuccess: async (user) => {
      toast.success(t("users.create.success"));
      await queryClient.invalidateQueries({ queryKey: ["manage", "users"] });
      setOpen(false);
      setEmail("");
      setDisplayName("");
      setTenantId("");
      setRole("member");
      setPassword("");
      setSuperAdmin(false);
      navigate(`/users/${user.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  useListToolbarHotkeys({
    onNewItem: () => setOpen(true),
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

  const tenantMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const tenant of tenants.data ?? []) {
      map.set(tenant.id, tenant.name);
    }
    return map;
  }, [tenants.data]);

  const tenantName = useCallback(
    (id: string) => tenantMap.get(id) ?? id,
    [tenantMap]
  );

  const handleSortChange = useCallback(
    (column: UsersSortColumn) => {
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [sortBy, sortOrder, setSortBy, setSortOrder]
  );

  const openUser = useCallback(
    (user: ManageUser) => {
      navigate(`/users/${user.id}`);
    },
    [navigate]
  );

  const pagination = {
    nextLabel: t("common.next"),
    onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
    onPrevious: () => setPage((p) => Math.max(1, p - 1)),
    page,
    pageOfLabel: t("users.list.pageOf", { page, totalPages }),
    previousLabel: t("common.previous"),
    totalPages,
  };

  const errorMessage =
    error instanceof Error ? error.message : error ? t("common.error") : null;

  const usersTitle = t("users.title");

  const pageActions = useMemo(
    () => (
      <Button onClick={() => setOpen(true)} size="sm">
        {t("users.new")}
      </Button>
    ),
    [t]
  );

  const breadcrumbs = useMemo(
    () => [
      {
        label: (
          <span className="font-medium text-foreground text-sm">
            {usersTitle}
          </span>
        ),
        menuLabel: usersTitle,
        to: "/users",
      },
    ],
    [usersTitle]
  );

  return (
    <PageShell actions={pageActions} breadcrumbs={breadcrumbs}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        <UsersTableToolbar
          columnOrder={columnOrder}
          columnVisibility={columnVisibility}
          labels={{
            searchPlaceholder: t("users.list.searchPlaceholder"),
            display: t("users.list.display"),
            viewModeGroup: t("users.list.viewModeGroup"),
            paginationSummary: t("users.list.paginationSummary", {
              total: filtered.length,
            }),
            sortByName: t("users.create.nameLabel"),
            sortByEmail: t("common.email"),
            sortByCreatedAt: t("common.created"),
            ascending: t("users.list.ascending"),
            descending: t("users.list.descending"),
            compactView: t("users.list.compactView"),
            tableView: t("users.list.tableView"),
            cardsView: t("users.list.cardsView"),
            sortBy: t("users.list.sortBy"),
            displayedColumns: t("users.list.displayedColumns"),
            hiddenInTable: t("users.list.hiddenInTable"),
            showAll: t("users.list.showAll"),
            hideAll: t("users.list.hideAll"),
            noColumnsDisplayed: t("users.list.noColumnsDisplayed"),
            itemsPerPage: t("users.list.itemsPerPage"),
            displayName: t("users.create.nameLabel"),
            email: t("common.email"),
            primaryTenant: t("users.primaryTenant"),
            role: t("common.role"),
            superAdmin: t("users.superAdmin"),
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
              <UsersTable
                columnOrder={columnOrder}
                columnVisibility={columnVisibility}
                onRowClick={openUser}
                onSortChange={handleSortChange}
                sortBy={sortBy}
                sortOrder={sortOrder}
                tableSize={tableSize}
                tenantName={tenantName}
                users={pageRows}
              />
            </AdminListTableView>
          )}

        {!(isLoading || error) &&
          filtered.length > 0 &&
          viewMode === "cards" && (
            <>
              <AdminListCardsView bottomFade>
                <UsersCards
                  columnOrder={columnOrder}
                  columnVisibility={columnVisibility}
                  onCardClick={openUser}
                  tableSize={tableSize}
                  tenantName={tenantName}
                  users={pageRows}
                />
              </AdminListCardsView>
              <AdminListPagination {...pagination} />
            </>
          )}
      </div>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.create.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm" htmlFor="new-email">
                {t("users.create.emailLabel")}
              </label>
              <Input
                id="new-email"
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                value={email}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm" htmlFor="new-name">
                {t("users.create.nameLabel")}
              </label>
              <Input
                id="new-name"
                onChange={(e) => setDisplayName(e.target.value)}
                value={displayName}
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm">{t("users.create.tenantLabel")}</span>
              <Select onValueChange={setTenantId} value={tenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(tenants.data ?? []).map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-sm">{t("users.create.roleLabel")}</span>
              <Select
                onValueChange={(v) => setRole(v as TenantRole)}
                value={role}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="member">member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm" htmlFor="new-password">
                {t("users.create.passwordLabel")}
              </label>
              <Input
                id="new-password"
                onChange={(e) => setPassword(e.target.value)}
                type="text"
                value={password}
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Switch
                aria-label={t("users.create.superAdminLabel")}
                checked={superAdmin}
                onCheckedChange={setSuperAdmin}
              />
              {t("users.create.superAdminLabel")}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)} variant="outline">
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!(email.trim() && tenantId) || create.isPending}
              onClick={() => create.mutate()}
            >
              {t("users.create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
