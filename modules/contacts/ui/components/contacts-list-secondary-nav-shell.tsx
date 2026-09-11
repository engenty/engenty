import { canonicalModulePathname } from "@engenty/ai-core/browser";
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
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
import { Loader2, Search, X } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { getRolePluralLabel } from "../api/role-menu-settings.js";
import type { ContactListItem } from "../api.js";
import {
  contactsListOptions,
  useContactsListQuery,
  useContactsRoleMenuQuery,
} from "../queries.js";

function contactListSecondaryNavLabel(entity: ContactListItem): string {
  return entity.type === "organisation"
    ? entity.legal_name?.trim() || entity.display_name
    : entity.display_name;
}

function ContactNavRow({
  to,
  label,
  active,
  search: linkSearch,
}: {
  to: string;
  label: string;
  active: boolean;
  search?: string;
}) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link
          to={linkSearch ? { pathname: to, search: linkSearch } : to}
          {...shellSecondaryNavItemProps}
        >
          <span className="truncate">{label}</span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

/**
 * Unified sidebar panel: search input → role filter links → recent contacts.
 * When search is active, replaces the list with matching contact results.
 * Suppresses shell-managed role links (via useSecondaryNavSearchResultsOnly).
 */
export function ContactsSidebarPanel() {
  const { t, i18n } = useTranslation("contacts");
  // Canonical, not raw: in a space this is `/s/<key>/<segment>/…`, and every
  // matcher below is written against `/mdl/<module>/…`.
  const { pathname: rawPathname, search: locationSearch } = useLocation();
  const pathname = canonicalModulePathname(rawPathname);

  useEffect(() => {
    void i18n.loadNamespaces(["contacts"]);
  }, [i18n]);

  // Always suppress shell-registered role links — we render our own below.
  useSecondaryNavSearchResultsOnly(true);

  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const trimmed = search.trim();
  const isSearching = trimmed.length > 0;

  // Role menu config
  const roleMenuQuery = useContactsRoleMenuQuery();
  const roleItems = useMemo(
    () =>
      roleMenuQuery.data?.items
        .filter((i) => i.visible)
        .sort((a, b) => a.order - b.order) ?? [],
    [roleMenuQuery.data]
  );

  // Recent contacts (shown when not searching)
  const recentQuery = useContactsListQuery({
    page: 1,
    pageSize: 20,
    sortBy: "created_at",
    sortOrder: "desc",
    include_linked_invoice_counts: false,
  });
  const recent = recentQuery.data?.data ?? [];
  const recentLoading = recentQuery.isLoading;

  // Search results
  const searchQuery = useQuery({
    ...contactsListOptions({
      page: 1,
      pageSize: 20,
      search: trimmed,
      sortBy: "display_name",
      sortOrder: "asc",
      include_linked_invoice_counts: false,
    }),
    enabled: isSearching,
  });
  const hits = searchQuery.data?.data ?? [];
  const searchLoading =
    isSearching && (searchQuery.isLoading || searchQuery.isFetching);

  const resultLinkSearch = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";

  // Determine active role from URL search params
  const urlSearchParams = new URLSearchParams(locationSearch);
  const activeRole = urlSearchParams.get("role");

  const allActive = pathname === "/mdl/contacts" && !activeRole;

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
                defaultValue: "Search contacts",
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
              {searchLoading ? (
                <p
                  className="flex items-center gap-2 py-2 pl-2 text-muted-foreground text-xs"
                  role="status"
                >
                  <Loader2
                    aria-hidden
                    className="size-3.5 shrink-0 animate-spin"
                  />
                  {t("listSidebar.searchLoading", {
                    defaultValue: "Searching…",
                  })}
                </p>
              ) : hits.length === 0 ? (
                <p className="py-2 pl-2 text-muted-foreground text-xs">
                  {t("listSidebar.noSearchResults", {
                    defaultValue: "No matching contacts.",
                  })}
                </p>
              ) : (
                <SidebarNavList>
                  {hits.map((c) => {
                    const active = pathname === `/mdl/contacts/${c.id}`;
                    return (
                      <ContactNavRow
                        active={active}
                        key={c.id}
                        label={contactListSecondaryNavLabel(c)}
                        search={resultLinkSearch}
                        to={`/mdl/contacts/${c.id}`}
                      />
                    );
                  })}
                </SidebarNavList>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            <SidebarGroup className="p-0 pb-2">
              <nav
                aria-label={t("listSidebar.contactsNavAria", {
                  defaultValue: "Contact groups",
                })}
              >
                <SidebarNavList>
                  <ContactNavRow
                    active={allActive}
                    label={t("menu.all", { defaultValue: "All" })}
                    to="/mdl/contacts"
                  />
                  {roleItems.map((item) => {
                    const label =
                      item.plural?.trim() ||
                      item.title?.trim() ||
                      getRolePluralLabel(item.slug, (key) =>
                        t(key, { defaultValue: item.slug })
                      );
                    const active =
                      pathname === "/mdl/contacts" && activeRole === item.slug;
                    return (
                      <ContactNavRow
                        active={active}
                        key={item.slug}
                        label={label}
                        to={`/mdl/contacts?role=${item.slug}`}
                      />
                    );
                  })}
                </SidebarNavList>
              </nav>
            </SidebarGroup>

            <div className="shrink-0 border-border-soft border-t" />

            <SidebarGroup className="min-h-0 flex-1 p-0 pt-3">
              <SidebarNavSectionLabel>
                {t("listSidebar.recentSection", { defaultValue: "Recent" })}
              </SidebarNavSectionLabel>
              <SidebarGroupContent className="min-h-0 flex-1">
                {recentLoading ? (
                  <div className="flex flex-col gap-1.5 pl-2">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Skeleton className="h-6 w-full" key={`rsk-${i}`} />
                    ))}
                  </div>
                ) : recent.length === 0 ? (
                  <p className="pl-2 text-muted-foreground text-xs">
                    {t("listSidebar.noRecent", {
                      defaultValue: "No contacts yet.",
                    })}
                  </p>
                ) : (
                  <SidebarNavList className="min-h-0 flex-1 overflow-y-auto pb-2">
                    {recent.map((c) => {
                      const active = pathname === `/mdl/contacts/${c.id}`;
                      return (
                        <ContactNavRow
                          active={active}
                          key={c.id}
                          label={contactListSecondaryNavLabel(c)}
                          to={`/mdl/contacts/${c.id}`}
                        />
                      );
                    })}
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
