/**
 * The home's right column, bottom half (PLAN-space-home.md H8).
 *
 * The Space's MOUNTS — what the sidebar lists under MODULE — not the installed
 * plugin list and not the artifacts above. A Space with no mounts says so in
 * one line rather than hiding the way in: mounting the first module is the
 * point of the empty state.
 *
 * Heading chrome matches the Work sidebar: hover reveals a chevron (fold the
 * card) and a "+" (mount). The in-card "Mount a module" link is gone so the
 * two ways in do not sit on top of each other.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Collapsible, CollapsibleContent } from "@engenty/ui-core";
import { Boxes, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { SpaceSectionAddButton } from "@/components/spaces/space-section-heading";
import { spaceModulePath, spaceSettingsPath } from "@/lib/space-routes";
import { useSpaceListedModules } from "@/lib/use-space-modules";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";
import { SpaceHomeSectionHeading } from "./SpaceHomeSectionHeading";
import {
  SPACE_HOME_ROW_CLASSNAME,
  SPACE_HOME_ROW_DOCK_ICON_CLASSNAME,
  SPACE_HOME_ROW_ICON_CLASSNAME,
} from "./space-home-row";

export function SpaceHomeModules({
  spaceId,
  spaceKey,
}: {
  spaceId: string;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const { modules } = useSpaceListedModules(spaceId);
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.homeModules,
    spaceKey
  );
  const addLabel = t("spaces.home.modules.mount", {
    defaultValue: "Mount a module",
  });

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceHomeSectionHeading
        action={
          <SpaceSectionAddButton aria-label={addLabel} asChild>
            <Link to={spaceSettingsPath(spaceKey)}>
              <Plus aria-hidden className="size-3.5" />
            </Link>
          </SpaceSectionAddButton>
        }
        onOpenChange={setOpen}
        open={open}
      >
        {t("spaces.apps.section", { defaultValue: "Modules" })}
      </SpaceHomeSectionHeading>
      <CollapsibleContent>
        <div className="ui-card-raised flex flex-col rounded-[14px] px-1.5 py-1">
          {modules.length === 0 ? (
            <p className="px-2 py-2 text-muted-foreground text-sm">
              {t("spaces.apps.empty", {
                defaultValue: "No module is mounted in this space yet.",
              })}
            </p>
          ) : (
            modules.map((module) => {
              const Icon = module.icon ?? Boxes;
              return (
                <Link
                  className={SPACE_HOME_ROW_CLASSNAME}
                  key={module.id}
                  to={spaceModulePath(spaceKey, module.id)}
                >
                  <span aria-hidden className={SPACE_HOME_ROW_ICON_CLASSNAME}>
                    <Icon className={SPACE_HOME_ROW_DOCK_ICON_CLASSNAME} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {module.label}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
