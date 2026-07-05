import {
  ModuleSidebarHeaderLabel,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { Mail } from "lucide-react";
import { useMemo } from "react";
import { InboxSidebarPanel } from "../components/inbox-sidebar-panel.js";

/** Unified sidebar panel for any `/mdl/inbox/*` screen. */
export function useInboxSecondaryNav() {
  const { t, i18n, ready } = useTranslation("inbox");
  const { secondaryNavOpen } = useShellSecondaryNav();

  // Re-memoized on locale change only (mirrors the tasks module hook).
  const secondaryNavAfterItems = useMemo(
    () => <InboxSidebarPanel />,
    [ready, i18n.language]
  );

  const secondaryNavHeaderSlot = useMemo(
    () => (
      <ModuleSidebarHeaderLabel
        icon={Mail}
        label={t("title")}
        to="/mdl/inbox"
      />
    ),
    [t, ready, i18n.language]
  );

  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () => (secondaryNavOpen ? null : { label: t("title"), to: "/mdl/inbox" }),
    [secondaryNavOpen, t]
  );

  return { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot };
}
