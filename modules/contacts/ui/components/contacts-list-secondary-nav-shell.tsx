import { canonicalModulePathname } from "@engenty/ai-core/browser";
import { ModuleSidebarAgents } from "@engenty/ai-ui";
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
  SidebarRow,
  SidebarRowButton,
  Skeleton,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
} from "@engenty/ui-core";
import { DockContactsIcon } from "@engenty/ui-icons";
import {
  type UiIconComponent,
  useSecondaryNavSearchResultsOnly,
} from "@engenty/ui-plugin-sdk";
import { Loader2, Search, X } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { getRolePluralLabel } from "../api/role-menu-settings.js";
import type { ContactListItem, ContactRole } from "../api.js";
import { useContactsSidebarPrefs } from "../lib/use-contacts-sidebar-prefs.js";
import {
  contactsListOptions,
  useContactsListQuery,
  useContactsRoleMenuQuery,
} from "../queries.js";
import { ContactsSidebarAddMenu } from "./contacts-sidebar-add-menu.js";
import { ContactsSidebarListSettings } from "./contacts-sidebar-settings.js";

function contactListSecondaryNavLabel(entity: ContactListItem): string {
  return entity.type === "organisation"
    ? entity.legal_name?.trim() || entity.display_name
    : entity.display_name;
}

function ContactNavRow({
  to,
  icon: Icon,
  label,
  active,
  search: linkSearch,
}: {
  to: string;
  icon?: UiIconComponent;
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
          {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
          <span className="truncate">{label}</span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

/**
 * Unified sidebar panel: Contacts (the list page) → the module's Engentys →
 * search with filters and "+" → the contact list those filter. While searching,
 * matching contacts replace the list.
 * Suppresses shell-managed role links (via useSecondaryNavSearchResultsOnly).
 */
export function ContactsSidebarPanel() {
  const { t, i18n } = useTranslation("contacts");
  // Canonical, not raw: in a space this is `/s/<key>/<segment>/…`, and every
  // matcher below is written against `/mdl/<module>/…`.
  const { pathname: rawPathname } = useLocation();
  const pathname = canonicalModulePathname(rawPathname);

  useEffect(() => {
    void i18n.loadNamespaces(["contacts"]);
  }, [i18n]);

  // Suppress the shell-registered role links; role filters live on the list.
  useSecondaryNavSearchResultsOnly(true);

  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const trimmed = search.trim();
  const isSearching = trimmed.length > 0;

  const { filtered, prefs, updatePrefs } = useContactsSidebarPrefs();
  const roleMenuQuery = useContactsRoleMenuQuery();
  const roleOptions = useMemo(
    () =>
      (roleMenuQuery.data?.items ?? [])
        .filter((item) => item.visible)
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          label:
            item.plural?.trim() ||
            item.title?.trim() ||
            getRolePluralLabel(item.slug, (key) =>
              t(key, { defaultValue: item.slug })
            ),
          value: item.slug,
        })),
    [roleMenuQuery.data, t]
  );

  // The list (shown when not searching), as the filter popover sets it.
  const recentQuery = useContactsListQuery({
    page: 1,
    pageSize: 20,
    sortBy: prefs.sortBy,
    sortOrder: prefs.sortOrder,
    include_linked_invoice_counts: false,
    ...(prefs.role === "all" ? {} : { role: prefs.role as ContactRole }),
    ...(prefs.type === "all" ? {} : { type: prefs.type }),
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

  const listActive = pathname === "/mdl/contacts";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SidebarHeader className="gap-0 p-0 pb-3">
        {isSearching ? null : (
          <>
            <SidebarGroup className="p-0">
              <SidebarNavList>
                <ContactNavRow
                  active={listActive}
                  icon={DockContactsIcon}
                  label={t("menu.contacts")}
                  to="/mdl/contacts"
                />
              </SidebarNavList>
            </SidebarGroup>
            <ModuleSidebarAgents moduleId="contacts" />
          </>
        )}

        {/* Search, filters and "+" sit right above the list they act on. */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-1 pt-4",
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
          {isSearching ? null : (
            <>
              <ContactsSidebarListSettings
                filtered={filtered}
                prefs={prefs}
                roleOptions={roleOptions}
                updatePrefs={updatePrefs}
              />
              <ContactsSidebarAddMenu />
            </>
          )}
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
          <SidebarGroup className="min-h-0 flex-1 p-0">
            <SidebarGroupContent className="min-h-0 flex-1">
              {recentLoading ? (
                <div className="flex flex-col gap-1.5 pl-2">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton className="h-6 w-full" key={`rsk-${i}`} />
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <p className="pl-2 text-muted-foreground text-xs">
                  {filtered
                    ? t("listSidebar.noMatches")
                    : t("listSidebar.noRecent")}
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
        )}
      </SidebarContent>
    </div>
  );
}
