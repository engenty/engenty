import {
  ModuleSidebarHeaderLabel,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { DockOffersIcon } from "@engenty/ui-icons";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { InvoicesSidebarPanel } from "../components/invoices-list-secondary-nav-shell.js";

const INVOICES_BASE = "/mdl/invoices";

/**
 * Header label rendered into the secondary-nav header slot. Translates itself so
 * the slot element can stay referentially stable (created once) — recreating it
 * on every `t`/`ready` change would make usePageConfig re-dispatch each render
 * and thrash the panel's layout effects (max-update-depth loop).
 */
function InvoicesSidebarHeaderLabel() {
  const { t } = useTranslation("invoices");
  return (
    <ModuleSidebarHeaderLabel
      icon={DockOffersIcon}
      label={t("menu")}
      to={INVOICES_BASE}
    />
  );
}

/** Unified sidebar panel for any `/mdl/invoices/*` screen. */
export function useInvoicesModuleSecondaryShellNav() {
  const { t } = useTranslation("invoices");
  const { secondaryNavOpen } = useShellSecondaryNav();

  // Stable element references: the inner components subscribe to translations
  // themselves, so these never need to be recreated.
  const secondaryNavAfterItems = useMemo(() => <InvoicesSidebarPanel />, []);
  const secondaryNavHeaderSlot = useMemo(
    () => <InvoicesSidebarHeaderLabel />,
    []
  );

  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () => (secondaryNavOpen ? null : { label: t("menu"), to: INVOICES_BASE }),
    [secondaryNavOpen, t]
  );

  return { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot };
}
