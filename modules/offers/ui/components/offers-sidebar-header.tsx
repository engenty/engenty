import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Input,
  SidebarHeader,
  SidebarNavList,
  SidebarRow,
  SidebarRowButton,
} from "@engenty/ui-core";
import { DockOffersIcon } from "@engenty/ui-icons";
import { Plus, Search, X } from "lucide-react";
import type { ElementType } from "react";
import { Link } from "react-router-dom";
import type { OfferStatus } from "../api.js";
import type { OffersSidebarPrefs } from "../lib/use-offers-sidebar-prefs.js";
import { OffersSidebarListSettings } from "./offers-sidebar-settings.js";

interface SidebarNavRowProps {
  active: boolean;
  icon?: ElementType;
  label: string;
  to: string;
}

export function SidebarNavRow({
  active,
  icon: Icon,
  label,
  to,
}: SidebarNavRowProps) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link to={to} {...shellSecondaryNavItemProps}>
          {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
          <span className="truncate">{label}</span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

interface OffersSidebarHeaderProps {
  clients: Array<{ id: string; display_name: string }>;
  isSearching: boolean;
  onClearSearch: () => void;
  onCreateOffer: () => void;
  onSearchChange: (value: string) => void;
  pathname: string;
  prefs: OffersSidebarPrefs;
  search: string;
  statusLabel: (status: OfferStatus) => string;
  trimmed: string;
  updatePrefs: (
    updater: (current: OffersSidebarPrefs) => OffersSidebarPrefs
  ) => void;
}

export function OffersSidebarHeader({
  clients,
  isSearching,
  onClearSearch,
  onCreateOffer,
  onSearchChange,
  pathname,
  prefs,
  search,
  statusLabel,
  trimmed,
  updatePrefs,
}: OffersSidebarHeaderProps) {
  const { t } = useTranslation("offers");

  return (
    <SidebarHeader className="gap-0 p-0 pb-3">
      <div className="flex min-w-0 items-center gap-1 pr-1 pl-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
          />
          <Input
            aria-label={t("sidebar.searchAria", {
              defaultValue: "Search offers",
            })}
            className="h-8 w-full py-0 pr-7 pl-8 text-sm"
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("sidebar.searchPlaceholder", {
              defaultValue: "Search offers...",
            })}
            value={search}
            {...shellSecondaryNavItemProps}
          />
          {trimmed ? (
            <Button
              aria-label={t("sidebar.clearSearch", {
                defaultValue: "Clear search",
              })}
              className="absolute top-1/2 right-1 h-6 w-6 shrink-0 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={onClearSearch}
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
            <OffersSidebarListSettings
              clients={clients}
              prefs={prefs}
              statusLabel={statusLabel}
              updatePrefs={updatePrefs}
            />
            <Button
              aria-label={t("createOffer", { defaultValue: "Create offer" })}
              className="h-8 w-8 shrink-0 border-0 p-0 shadow-none"
              onClick={onCreateOffer}
              title={t("createOffer", { defaultValue: "Create offer" })}
              type="button"
              variant="ghost"
              {...shellSecondaryNavItemProps}
            >
              <Plus aria-hidden className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {isSearching ? null : (
        <SidebarNavList className="pt-2">
          <SidebarNavRow
            active={pathname === "/mdl/offers"}
            icon={DockOffersIcon}
            label={t("menu.offers", { defaultValue: "Offers" })}
            to="/mdl/offers"
          />
        </SidebarNavList>
      )}
    </SidebarHeader>
  );
}
