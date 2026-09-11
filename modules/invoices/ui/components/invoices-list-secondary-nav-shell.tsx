import { canonicalModulePathname } from "@engenty/ai-core/browser";
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Input,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarNavList,
  SidebarNavSectionLabel,
  SidebarRow,
  SidebarRowButton,
  Skeleton,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
} from "@engenty/ui-core";
import { useSecondaryNavSearchResultsOnly } from "@engenty/ui-plugin-sdk";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { InvoiceListItem } from "../api.js";
import { todayIsoDate } from "../lib/invoices-filters.js";
import { useInvoicesListQuery } from "../queries.js";

function invoiceSecondaryNavLabel(invoice: InvoiceListItem): string {
  const recipient = invoice.recipientSnapshot?.displayName?.trim();
  return recipient ? `${invoice.number} · ${recipient}` : invoice.number;
}

function InvoiceNavRow({
  to,
  search,
  label,
  active,
}: {
  to: string;
  search?: string;
  label: string;
  active: boolean;
}) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link
          to={search ? { pathname: to, search } : to}
          {...shellSecondaryNavItemProps}
        >
          <span className="truncate">{label}</span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

/**
 * Unified invoices sidebar panel: search input → status filter links → recent
 * invoices. When search is active, the recent list is replaced by matching
 * invoices. Recent/result rows open the invoice via the `?invoice=<id>` param
 * (the list page opens the edit sheet). Suppresses shell-managed links.
 */
export function InvoicesSidebarPanel() {
  const { t, i18n } = useTranslation("invoices");
  // Canonical, not raw: in a space this is `/s/<key>/<segment>/…`, and every
  // matcher below is written against `/mdl/<module>/…`.
  const pathname = canonicalModulePathname(useLocation().pathname);

  useEffect(() => {
    void i18n.loadNamespaces(["invoices"]);
  }, [i18n]);

  // Render our own filter links — suppress any shell-registered ones.
  useSecondaryNavSearchResultsOnly(true);

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const setSearch = useCallback(
    (value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) {
            next.set("q", value);
          } else {
            next.delete("q");
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const trimmed = search.trim();
  const isSearching = trimmed.length > 0;

  const listQuery = useInvoicesListQuery();
  const invoices = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const loading = listQuery.isLoading;

  const today = todayIsoDate();
  const overdueCount = useMemo(
    () => invoices.filter((inv) => inv.dueDate && inv.dueDate < today).length,
    [invoices, today]
  );

  const recent = useMemo(
    () =>
      [...invoices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20),
    [invoices]
  );

  const hits = useMemo(() => {
    if (!isSearching) {
      return [];
    }
    const q = trimmed.toLowerCase();
    return invoices
      .filter(
        (inv) =>
          inv.number.toLowerCase().includes(q) ||
          inv.content?.toLowerCase().includes(q) ||
          inv.recipientSnapshot?.displayName?.toLowerCase().includes(q) ||
          inv.recipientSnapshot?.email?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [invoices, isSearching, trimmed]);

  const activeFilter = searchParams.get("filter");
  const onListRoot = pathname === "/mdl/invoices";
  const allActive = onListRoot && !activeFilter;
  const overdueActive = onListRoot && activeFilter === "overdue";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SidebarHeader className="gap-0 p-0 pb-3">
        <div
          className={cn(
            "flex min-w-0 items-center",
            sidebarColumnContentInsetClassName,
            sidebarColumnContentInsetEndClassName
          )}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
            />
            <Input
              aria-label={t("listSidebar.searchAria", {
                defaultValue: "Search invoices",
              })}
              className="h-8 w-full py-0 pr-7 pl-8 text-sm"
              onChange={(e) => {
                const v = e.target.value;
                void setSearch(v === "" ? null : v);
              }}
              placeholder={t("listSidebar.searchPlaceholder", {
                defaultValue: "Search",
              })}
              value={search}
              {...shellSecondaryNavItemProps}
            />
            {trimmed ? (
              <Button
                aria-label={t("listSidebar.clearSearch", {
                  defaultValue: "Clear search",
                })}
                className="absolute top-1/2 right-1 h-6 w-6 shrink-0 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => void setSearch(null)}
                size="icon"
                tabIndex={-1}
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0.5 overflow-x-hidden px-0 py-0">
        {isSearching ? (
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              {hits.length === 0 ? (
                <p className="py-2 pl-2 text-muted-foreground text-xs">
                  {t("listSidebar.noSearchResults", {
                    defaultValue: "No matching invoices.",
                  })}
                </p>
              ) : (
                <SidebarNavList>
                  {hits.map((inv) => (
                    <InvoiceNavRow
                      active={pathname === `/mdl/invoices/${inv.id}`}
                      key={inv.id}
                      label={invoiceSecondaryNavLabel(inv)}
                      to={`/mdl/invoices/${inv.id}`}
                    />
                  ))}
                </SidebarNavList>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            <SidebarGroup className="p-0 pb-2">
              <nav
                aria-label={t("listSidebar.filtersNavAria", {
                  defaultValue: "Invoice filters",
                })}
              >
                <SidebarNavList>
                  <InvoiceNavRow
                    active={allActive}
                    label={t("listSidebar.all", { defaultValue: "All" })}
                    to="/mdl/invoices"
                  />
                  <InvoiceNavRow
                    active={overdueActive}
                    label={
                      overdueCount > 0
                        ? t("listSidebar.overdueWithCount", {
                            count: overdueCount,
                            defaultValue: `Overdue (${overdueCount})`,
                          })
                        : t("listSidebar.overdue", { defaultValue: "Overdue" })
                    }
                    search="?filter=overdue"
                    to="/mdl/invoices"
                  />
                </SidebarNavList>
              </nav>
            </SidebarGroup>

            <div className="shrink-0 border-border-soft border-t" />

            <SidebarGroup className="min-h-0 flex-1 p-0 pt-3">
              <SidebarNavSectionLabel>
                {t("listSidebar.recentSection", { defaultValue: "Recent" })}
              </SidebarNavSectionLabel>
              <SidebarGroupContent className="min-h-0 flex-1">
                {loading ? (
                  <div className="flex flex-col gap-1.5 pl-2">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Skeleton className="h-6 w-full" key={`rsk-${i}`} />
                    ))}
                  </div>
                ) : recent.length === 0 ? (
                  <p className="pl-2 text-muted-foreground text-xs">
                    {t("listSidebar.noRecent", {
                      defaultValue: "No invoices yet.",
                    })}
                  </p>
                ) : (
                  <SidebarNavList className="min-h-0 flex-1 overflow-y-auto pb-2">
                    {recent.map((inv) => (
                      <InvoiceNavRow
                        active={pathname === `/mdl/invoices/${inv.id}`}
                        key={inv.id}
                        label={invoiceSecondaryNavLabel(inv)}
                        to={`/mdl/invoices/${inv.id}`}
                      />
                    ))}
                  </SidebarNavList>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
    </div>
  );
}
