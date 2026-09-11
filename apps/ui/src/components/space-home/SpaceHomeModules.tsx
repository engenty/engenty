/**
 * The home's right column, bottom half (PLAN-space-home.md H8).
 *
 * The Space's MOUNTS — what the sidebar lists under MODULE — not the installed
 * plugin list and not the artifacts above. A Space with no mounts says so in
 * one line rather than hiding the way in: mounting the first module is the
 * point of the empty state.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Boxes } from "lucide-react";
import { Link } from "react-router-dom";
import { spaceModulePath, spaceSettingsPath } from "@/lib/space-routes";
import { useSpaceListedModules } from "@/lib/use-space-modules";
import { SpaceHomeSectionHeading } from "./SpaceHomeSectionHeading";

export function SpaceHomeModules({
  spaceId,
  spaceKey,
}: {
  spaceId: string;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const { modules } = useSpaceListedModules(spaceId);

  return (
    <section className="flex flex-col">
      <SpaceHomeSectionHeading>
        {t("spaces.apps.section", { defaultValue: "Modules" })}
      </SpaceHomeSectionHeading>
      <div className="ui-card-raised flex flex-col rounded-[14px] px-1.5 py-1">
        {modules.length === 0 ? (
          <p className="px-2 py-2 text-[12.5px] text-muted-foreground">
            {t("spaces.apps.empty", {
              defaultValue: "No module is mounted in this space yet.",
            })}
          </p>
        ) : (
          modules.map((module) => {
            const Icon = module.icon ?? Boxes;
            return (
              <Link
                className="flex items-center gap-2.5 rounded-[10px] px-2 py-2 hover:bg-accent/60"
                key={module.id}
                to={spaceModulePath(spaceKey, module.id)}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-muted text-muted-foreground">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-[13px]">
                  {module.label}
                </span>
              </Link>
            );
          })
        )}
        <Link
          className="px-2 py-2 font-medium text-[12px] text-link hover:underline"
          to={spaceSettingsPath(spaceKey)}
        >
          {t("spaces.home.modules.mount", { defaultValue: "Mount a module" })}
        </Link>
      </div>
    </section>
  );
}
