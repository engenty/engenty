import { useSetupSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import type { LucideIcon } from "lucide-react";
import {
  Box,
  Cable,
  ChevronRightIcon,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  SettingsOverviewIcon,
  type SettingsOverviewIconTone,
} from "@/components/settings/SettingsOverviewIcon";

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
    to: "/setup/connectors",
    labelKey: "navigation.setupConnectors",
    descriptionKey: "setup.connectorsDescription",
    Icon: Cable,
    tone: "moss",
  },
];

/**
 * Install-owner overview at `/setup` — link cards into the Setup children,
 * matching the stacked `/settings` overview layout.
 */
export function SetupPage() {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } = useSetupSecondaryShellNav(
    t("navigation.setup")
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
      <div className="mx-auto w-full max-w-4xl space-y-8 p-page sm:pt-4">
        <div className="space-y-8 pb-12">
          <SettingsFormSection
            cardVariant="flush"
            description={t("setup.overviewDescription")}
            title={t("navigation.setup")}
          >
            <div className="divide-y divide-border">
              {SETUP_ROWS.map((row) => (
                <Link
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                  key={row.to}
                  to={row.to}
                >
                  <SettingsOverviewIcon Icon={row.Icon} tone={row.tone} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-foreground text-sm">
                      {t(row.labelKey)}
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
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
    </div>
  );
}
