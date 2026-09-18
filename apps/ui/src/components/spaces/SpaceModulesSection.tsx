/**
 * Which records modules are mounted in this space — the Work-tab list under
 * Agents. Assistant modules stay out of this list: Copilot has a root-level
 * home, and hired engenties already have a home in the Agents roster.
 *
 * The chevron beside the heading collapses the list the same way Agents does
 * (label stays a label, chevron toggles). The hover "+" opens the mounts
 * picker; that lives on the heading so it remains reachable while collapsed.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Collapsible, CollapsibleContent } from "@engenty/ui-core";
import { SpaceNavRow } from "@/components/spaces/space-nav-row";
import {
  SpaceSectionAddButton,
  SpaceSectionHeading,
} from "@/components/spaces/space-section-heading";
import { spaceModulePath } from "@/lib/space-routes";
import type { SpaceModule } from "@/lib/use-space-modules";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";

export function SpaceModulesSection({
  activeModuleId,
  canAdd,
  isPending,
  modules,
  onAdd,
  spaceKey,
}: {
  activeModuleId: string | undefined;
  canAdd: boolean;
  isPending: boolean;
  modules: SpaceModule[];
  onAdd: () => void;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.modules,
    spaceKey
  );

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceSectionHeading
        action={
          canAdd ? (
            <SpaceSectionAddButton
              aria-label={t("spaces.apps.addAction", {
                defaultValue: "Add a module",
              })}
              onClick={onAdd}
            />
          ) : null
        }
        count={modules.length}
        onOpenChange={setOpen}
        open={open}
      >
        {t("spaces.apps.section", { defaultValue: "Modules" })}
      </SpaceSectionHeading>

      <CollapsibleContent>
        {isPending ? (
          <div className="flex flex-col gap-1">
            {[0, 1, 2].map((index) => (
              <div
                className="h-8 animate-pulse rounded-[8px] bg-muted"
                key={index}
              />
            ))}
          </div>
        ) : null}
        {!isPending && modules.length === 0 ? (
          <p className="px-2 text-muted-foreground text-sm">
            {t("spaces.apps.empty", {
              defaultValue: "No modules are mounted in this space yet.",
            })}
          </p>
        ) : null}
        {modules.map((app) => (
          <SpaceNavRow
            active={activeModuleId === app.id}
            href={spaceModulePath(spaceKey, app.id)}
            icon={app.icon}
            key={app.id}
            label={app.label}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
