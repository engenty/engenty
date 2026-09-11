// Overview footer links: AI settings + operations cockpit.

import { useTranslation } from "@engenty/i18n/ui";
import { ExternalLink, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

const OPERATIONS_COCKPIT_PATH = "/mdl/tasks/operations";

export function OverviewFooterLinks() {
  const { t } = useTranslation("ai-ui");
  return (
    <div className="flex flex-wrap items-center gap-4 border-border-soft border-t pt-4">
      <Link
        className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
        to="/settings/ai"
      >
        <Settings2 aria-hidden className="size-3.5" />
        {t("overview.links.aiSettings")}
      </Link>
      <Link
        className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
        to={OPERATIONS_COCKPIT_PATH}
      >
        <ExternalLink aria-hidden className="size-3.5" />
        {t("overview.links.operations")}
      </Link>
    </div>
  );
}
