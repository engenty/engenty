// Shell secondary-nav panel for all /mdl/inbox screens: status lanes,
// connected accounts (filter), and the module settings entry.
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
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
  Check,
  Eye,
  Inbox,
  Settings,
  Sparkles,
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { InboxAccount, InboxMessageStatus } from "../api.js";
import { useInboxAccountsQuery } from "../queries.js";

const LANES: {
  icon: typeof Inbox;
  key: "all" | InboxMessageStatus;
}[] = [
  { icon: Inbox, key: "all" },
  { icon: Sparkles, key: "new" },
  { icon: Eye, key: "triaged" },
  { icon: Check, key: "processed" },
  { icon: Archive, key: "archived" },
];

function laneTo(lane: string, account: string | null): string {
  const params = new URLSearchParams();
  if (lane !== "all") {
    params.set("lane", lane);
  }
  if (account) {
    params.set("account", account);
  }
  const qs = params.toString();
  return `/mdl/inbox${qs ? `?${qs}` : ""}`;
}

function accountLabel(account: InboxAccount): string {
  return (
    account.display_name ?? account.external_account ?? account.connector_id
  );
}

export function InboxSidebarPanel() {
  const { t } = useTranslation("inbox");
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const lane = searchParams.get("lane") ?? "all";
  const account = searchParams.get("account");
  const onSettings = location.pathname.startsWith("/mdl/inbox/settings");
  const accountsQuery = useInboxAccountsQuery();
  const accounts = accountsQuery.data?.accounts ?? [];

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarNavList>
            {LANES.map(({ icon: Icon, key }) => {
              const active = !onSettings && lane === key;
              return (
                <SidebarRow isActive={active} key={key}>
                  <SidebarRowButton asChild isActive={active}>
                    <Link
                      to={laneTo(key, account)}
                      {...shellSecondaryNavItemProps}
                    >
                      <Icon className="size-4" />
                      <span>{t(`lanes.${key}`)}</span>
                    </Link>
                  </SidebarRowButton>
                </SidebarRow>
              );
            })}
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
                        to={laneTo(lane, active ? null : entry.connection_id)}
                        {...shellSecondaryNavItemProps}
                      >
                        <AtSign className="size-4" />
                        <span className="truncate">{accountLabel(entry)}</span>
                        {entry.sharing === "org" ? (
                          <Badge className="ml-auto" variant="secondary">
                            {t("filters.org")}
                          </Badge>
                        ) : null}
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
