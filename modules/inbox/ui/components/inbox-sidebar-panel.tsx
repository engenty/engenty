// Shell secondary-nav panel for all /mdl/inbox screens: inbox / archived
// lanes, connected accounts (filter), and the module settings entry.
import { canonicalModulePathname } from "@engenty/ai-core/browser";
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarNavList,
  SidebarNavSectionLabel,
  SidebarRow,
  SidebarRowButton,
  Skeleton,
} from "@engenty/ui-core";
import {
  Archive,
  AtSign,
  Ban,
  Bell,
  Inbox,
  Megaphone,
  MessagesSquare,
  Newspaper,
  Settings,
  Tag,
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  getCategoryTitleLabel,
  type InboxCategoryItem,
  visibleInboxCategories,
} from "../api/inbox-categories-settings.js";
import type { InboxAccount } from "../api.js";
import { useInboxAccountsQuery, useInboxCategoriesQuery } from "../queries.js";

const LANES: {
  icon: typeof Inbox;
  key: "all" | "archived";
  labelKey: "lanes.inbox" | "lanes.archived";
}[] = [
  { icon: Inbox, key: "all", labelKey: "lanes.inbox" },
  { icon: Archive, key: "archived", labelKey: "lanes.archived" },
];

const FIXED_CATEGORY_ICONS: Record<string, typeof Inbox> = {
  conversation: MessagesSquare,
  newsletter: Newspaper,
  notification: Bell,
  promotion: Megaphone,
  spam: Ban,
};

function inboxTo(params: {
  account: string | null;
  category: string | null;
  lane: string;
}): string {
  const search = new URLSearchParams();
  if (params.lane !== "all") {
    search.set("lane", params.lane);
  }
  if (params.account) {
    search.set("account", params.account);
  }
  if (params.category) {
    search.set("category", params.category);
  }
  const qs = search.toString();
  return `/mdl/inbox${qs ? `?${qs}` : ""}`;
}

function accountLabel(account: InboxAccount): string {
  return (
    account.display_name ?? account.external_account ?? account.connector_id
  );
}

function categoryIcon(slug: string) {
  return FIXED_CATEGORY_ICONS[slug] ?? Tag;
}

export function InboxSidebarPanel() {
  const { t } = useTranslation("inbox");
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const lane = searchParams.get("lane") ?? "all";
  const account = searchParams.get("account");
  const category = searchParams.get("category");
  // Canonical, not raw: in a space this is `/s/<key>/inbox/settings`.
  const onSettings = canonicalModulePathname(location.pathname).startsWith(
    "/mdl/inbox/settings"
  );
  const accountsQuery = useInboxAccountsQuery();
  const categoriesQuery = useInboxCategoriesQuery();
  const accounts = accountsQuery.data?.accounts ?? [];
  const categoryItems: InboxCategoryItem[] = categoriesQuery.data
    ? visibleInboxCategories(categoriesQuery.data)
    : [];

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarNavList>
            {LANES.map(({ icon: Icon, key, labelKey }) => {
              const active = !onSettings && lane === key;
              return (
                <SidebarRow isActive={active} key={key}>
                  <SidebarRowButton asChild isActive={active}>
                    <Link
                      to={inboxTo({ account, category, lane: key })}
                      {...shellSecondaryNavItemProps}
                    >
                      <Icon className="size-4" />
                      <span>{t(labelKey)}</span>
                    </Link>
                  </SidebarRowButton>
                </SidebarRow>
              );
            })}
          </SidebarNavList>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Category lanes are a second, independent axis: they combine with the
          status lane rather than replacing it. Clicking the active one clears
          it, so there is no separate "all categories" row. */}
      <SidebarGroup>
        <SidebarNavSectionLabel>
          {t("sidebar.categories")}
        </SidebarNavSectionLabel>
        <SidebarGroupContent>
          <SidebarNavList>
            {categoriesQuery.isLoading ? (
              <Skeleton className="mx-2 h-6" />
            ) : (
              categoryItems.map((item) => {
                const Icon = categoryIcon(item.slug);
                const active = !onSettings && category === item.slug;
                return (
                  <SidebarRow isActive={active} key={item.slug}>
                    <SidebarRowButton asChild isActive={active}>
                      <Link
                        to={inboxTo({
                          account,
                          category: active ? null : item.slug,
                          lane,
                        })}
                        {...shellSecondaryNavItemProps}
                      >
                        <Icon className="size-4" />
                        <span>
                          {getCategoryTitleLabel(item.slug, item.title, t)}
                        </span>
                      </Link>
                    </SidebarRowButton>
                  </SidebarRow>
                );
              })
            )}
          </SidebarNavList>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarNavSectionLabel>{t("sidebar.accounts")}</SidebarNavSectionLabel>
        <SidebarGroupContent>
          <SidebarNavList>
            {accountsQuery.isLoading ? (
              <Skeleton className="mx-2 h-6" />
            ) : (
              accounts.map((entry) => {
                const active = !onSettings && account === entry.connection_id;
                return (
                  <SidebarRow isActive={active} key={entry.connection_id}>
                    <SidebarRowButton asChild isActive={active}>
                      <Link
                        to={inboxTo({
                          account: active ? null : entry.connection_id,
                          category,
                          lane,
                        })}
                        {...shellSecondaryNavItemProps}
                      >
                        <AtSign className="size-4" />
                        <span className="truncate">{accountLabel(entry)}</span>
                      </Link>
                    </SidebarRowButton>
                  </SidebarRow>
                );
              })
            )}
          </SidebarNavList>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Pinned to the sidebar bottom (parent is a flex column), kept quiet. */}
      <SidebarGroup className="mt-auto border-t pt-1 pb-2">
        <SidebarGroupContent>
          <SidebarNavList>
            <SidebarRow isActive={onSettings}>
              <SidebarRowButton
                asChild
                className="text-muted-foreground text-xs"
                isActive={onSettings}
              >
                <Link to="/mdl/inbox/settings" {...shellSecondaryNavItemProps}>
                  <Settings className="size-3.5" />
                  <span>{t("actions.settings")}</span>
                </Link>
              </SidebarRowButton>
            </SidebarRow>
          </SidebarNavList>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
