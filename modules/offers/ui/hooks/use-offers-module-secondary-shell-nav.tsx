import {
  ModuleSidebarHeaderLabel,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { DockOffersIcon } from "@engenty/ui-icons";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { OffersSidebarPanel } from "../components/offers-sidebar-panel.js";

const OFFERS_BASE = "/mdl/offers";

/** Unified sidebar panel for any `/mdl/offers/*` screen. */
export function useOffersModuleSecondaryShellNav() {
  const { i18n, ready, t } = useTranslation("offers");
  const { secondaryNavOpen } = useShellSecondaryNav();

  const secondaryNavAfterItems = useMemo(
    () => <OffersSidebarPanel />,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, i18n.language]
  );

  const secondaryNavHeaderSlot = useMemo(
    () => (
      <ModuleSidebarHeaderLabel
        icon={DockOffersIcon}
        label={t("menu.offers", { defaultValue: "Offers" })}
        to={OFFERS_BASE}
      />
    ),
    [t]
  );

  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () =>
      secondaryNavOpen
        ? null
        : {
            label: t("menu.offers", { defaultValue: "Offers" }),
            to: OFFERS_BASE,
          },
    [secondaryNavOpen, t]
  );

  return { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot };
}
