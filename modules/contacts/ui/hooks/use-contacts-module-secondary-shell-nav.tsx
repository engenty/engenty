import {
  ModuleSidebarHeaderLabel,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { DockContactsIcon } from "@engenty/ui-icons";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { ContactsSidebarPanel } from "../components/contacts-list-secondary-nav-shell.js";

const CONTACTS_BASE = "/mdl/contacts";

/** Unified sidebar panel for any `/mdl/contacts/*` screen. */
export function useContactsModuleSecondaryShellNav() {
  const { t, i18n, ready } = useTranslation("contacts");
  const { secondaryNavOpen } = useShellSecondaryNav();

  const secondaryNavAfterItems = useMemo(
    () => <ContactsSidebarPanel />,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, i18n.language]
  );

  const secondaryNavHeaderSlot = useMemo(
    () => (
      <ModuleSidebarHeaderLabel
        icon={DockContactsIcon}
        label={t("menu.contacts")}
        to={CONTACTS_BASE}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, ready, i18n.language]
  );

  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () =>
      secondaryNavOpen
        ? null
        : { label: t("menu.contacts"), to: CONTACTS_BASE },
    [secondaryNavOpen, t]
  );

  return { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot };
}
