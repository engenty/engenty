/**
 * The sidebar's SECOND level — a module opened from Work.
 *
 * Back arrow, then the module's own name and icon. The arrow returns to the
 * space root (Work), never to `history.back()`: the column shows where you ARE
 * in the space, so its back control has to mean "up one level", and browser
 * history frequently means something else by then — a record you opened, or a
 * different space entirely.
 *
 * This row leads the column's BODY, one row under the header, which keeps the
 * space switcher at every level. It used to take the header row itself, and the
 * space then had no name and no switcher for as long as a module was open —
 * exactly what the collapsed column avoids by keeping the chooser as its first
 * breadcrumb.
 *
 * The space name is still not repeated here: it is the row directly above.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { spaceRootPath } from "@/lib/space-routes";
import { useSpaceModules } from "@/lib/use-space-modules";

export function SpaceModuleNavHeader({
  moduleId,
  spaceId,
  spaceKey,
}: {
  moduleId: string;
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const { modules } = useSpaceModules(spaceId);
  const app = modules.find((entry) => entry.id === moduleId) ?? null;
  const Icon = app?.icon;

  return (
    <div className={cn("flex min-w-0 items-center gap-1")}>
      <Button
        aria-label={t("spaces.nav.backToSpace", { defaultValue: "Back" })}
        asChild
        className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
        size="icon"
        variant="ghost"
      >
        <Link to={spaceRootPath(spaceKey)}>
          <ArrowLeft className="size-4" />
        </Link>
      </Button>
      {Icon ? (
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 truncate font-semibold text-sm">
        {app?.label ?? moduleId}
      </span>
    </div>
  );
}
