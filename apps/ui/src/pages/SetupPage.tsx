import { useSetupSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import type { LucideIcon } from "lucide-react";
import {
  Box,
  Cable,
  ChevronRightIcon,
  Clapperboard,
  KeyRound,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  SettingsOverviewIcon,
  type SettingsOverviewIconTone,
} from "@/components/settings/SettingsOverviewIcon";
import { useDeveloperModeEnabled } from "@/hooks/use-developer-mode-enabled";

interface SetupOverviewRow {
  descriptionKey: string;
  Icon: LucideIcon;
  labelKey: string;
  to: string;
  tone: SettingsOverviewIconTone;
}

const SETUP_ROWS: SetupOverviewRow[] = [
  {
    to: "/setup/platform",
    labelKey: "navigation.setupPlatform",
    descriptionKey: "setup.platformDescription",
    Icon: KeyRound,
    tone: "rose",
  },
  {
    to: "/setup/plugins",
    labelKey: "navigation.plugins",
    descriptionKey: "setup.pluginsDescription",
    Icon: Box,
    tone: "ember",
  },
  {
    to: "/setup/roles",
    labelKey: "settings.roles.menuLabel",
    descriptionKey: "setup.rolesDescription",
    Icon: ShieldCheck,
    tone: "cobalt",
  },
  {
    to: "/setup/audit-logs",
    labelKey: "menu.auditLogs",
    descriptionKey: "setup.auditLogsDescription",
    Icon: ScrollText,
    tone: "amber",
  },
  {
    to: "/setup/connectors",
    labelKey: "navigation.setupConnectors",
    descriptionKey: "setup.connectorsDescription",
    Icon: Cable,
    tone: "moss",
  },
];

const STUDIO_ROW: SetupOverviewRow = {
  to: "/setup/studio",
  labelKey: "navigation.mastraStudio",
  descriptionKey: "setup.studioDescription",
  Icon: Clapperboard,
  tone: "ember",
};

/**
 * Install-owner overview at `/setup` — link cards into the Setup children,
 * matching the stacked `/settings` overview layout.
 */
export function SetupPage() {
  const { t } = useTranslation("common");
  const developerModeEnabled = useDeveloperModeEnabled();
  const { moduleRootCrumb, secondaryNavHeaderSlot } = useSetupSecondaryShellNav(
    t("navigation.setup")
  );
  const rows = useMemo(
    () => (developerModeEnabled ? [...SETUP_ROWS, STUDIO_ROW] : SETUP_ROWS),
    [developerModeEnabled]
  );

  usePageConfig({
    breadcrumbs: useMemo(
      () => (moduleRootCrumb ? [moduleRootCrumb] : []),
      [moduleRootCrumb]
    ),
    secondaryNavHeaderSlot,
  });

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto bg-muted/20">
      <div className="mx-auto w-full max-w-4xl p-page pb-12 sm:pt-4">
        <SettingsFormSection
          cardVariant="flush"
          description={t("setup.overviewDescription")}
          title={t("navigation.setup")}
        >
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <Link
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30"
                key={row.to}
                to={row.to}
              >
                <SettingsOverviewIcon Icon={row.Icon} tone={row.tone} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium text-foreground text-sm leading-none">
                    {t(row.labelKey)}
                  </span>
                  <span className="truncate text-muted-foreground text-xs leading-snug">
                    {t(row.descriptionKey)}
                  </span>
                </div>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/40" />
              </Link>
            ))}
          </div>
        </SettingsFormSection>
      </div>
    </div>
  );
}
