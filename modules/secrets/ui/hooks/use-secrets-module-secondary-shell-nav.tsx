import {
  ModuleSidebarHeaderLabel,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { DockSecretsIcon } from "@engenty/ui-icons";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { SecretsSidebarPanel } from "../components/secrets-sidebar-panel.js";
import { SECRETS_MODULE_BASE } from "../secrets-paths.js";

/** Unified sidebar panel for any `/mdl/secrets/*` screen. */
export function useSecretsModuleSecondaryShellNav() {
  const { t, i18n, ready } = useTranslation("secrets");
  const { secondaryNavOpen } = useShellSecondaryNav();

  const secondaryNavAfterItems = useMemo(
    () => <SecretsSidebarPanel />,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount when locale is ready/changes
    [ready, i18n.language]
  );

  const secondaryNavHeaderSlot = useMemo(
    () => (
      <ModuleSidebarHeaderLabel
        icon={DockSecretsIcon}
        label={t("menu.secrets")}
        to={SECRETS_MODULE_BASE}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount when locale is ready/changes
    [t, ready, i18n.language]
  );

  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () =>
      secondaryNavOpen
        ? null
        : { label: t("menu.secrets"), to: SECRETS_MODULE_BASE },
    [secondaryNavOpen, t]
  );

  return { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot };
}
