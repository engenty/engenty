/**
 * Module-contributed lists on the space's Work sidebar and home
 * (`registerSpaceSection`). The host draws the chrome — heading, fold state,
 * rows — in each slot's own style; the module only answers `useItems`.
 *
 * A section renders only where its module is mounted, and only once it has
 * something to show: an empty list stays off the page the same way an empty
 * Artefakte section does.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Collapsible, CollapsibleContent } from "@engenty/ui-core";
import {
  type UiSpaceSectionContribution,
  type UiSpaceSectionSlot,
  useUiContributions,
} from "@engenty/ui-plugin-sdk";
import { Boxes } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { SpaceHomeSectionHeading } from "@/components/space-home/SpaceHomeSectionHeading";
import { SpaceNavRow } from "@/components/spaces/space-nav-row";
import { SpaceSectionHeading } from "@/components/spaces/space-section-heading";
import { spaceModulePath } from "@/lib/space-routes";
import { useSpaceModules } from "@/lib/use-space-modules";
import { useSpaceSectionOpen } from "@/lib/use-space-section-open";

function sectionModuleId(section: UiSpaceSectionContribution): string {
  return section.moduleId ?? section.pluginId;
}

function useSlotSections(
  spaceId: string,
  slot: UiSpaceSectionSlot
): UiSpaceSectionContribution[] {
  const { contributions } = useUiContributions();
  const { modules } = useSpaceModules(spaceId);
  return useMemo(() => {
    const mounted = new Set(modules.map((module) => module.id));
    return (contributions.spaceSections ?? []).filter(
      (section) =>
        section.slots.includes(slot) && mounted.has(sectionModuleId(section))
    );
  }, [contributions.spaceSections, modules, slot]);
}

function useSectionLabel(section: UiSpaceSectionContribution): string {
  const { t } = useTranslation();
  return section.labelKey
    ? t(section.labelKey, { defaultValue: section.label ?? section.id })
    : (section.label ?? section.id);
}

function openStorageKey(
  section: UiSpaceSectionContribution,
  slot: UiSpaceSectionSlot
): string {
  return `engenty.space.${slot}.${section.pluginId}.${section.id}.open`;
}

interface SectionProps {
  section: UiSpaceSectionContribution;
  spaceId: string;
  spaceKey: string;
}

function SidebarSection({ section, spaceId, spaceKey }: SectionProps) {
  const label = useSectionLabel(section);
  const { pathname } = useLocation();
  const { items } = section.useItems({ spaceId, spaceKey });
  const [open, setOpen] = useSpaceSectionOpen(
    openStorageKey(section, "space.sidebar"),
    spaceKey
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceSectionHeading
        count={items.length}
        onOpenChange={setOpen}
        open={open}
      >
        {label}
      </SpaceSectionHeading>
      <CollapsibleContent>
        {items.map((item) => {
          const href = spaceModulePath(
            spaceKey,
            sectionModuleId(section),
            item.path
          );
          return (
            <SpaceNavRow
              active={pathname === href || pathname.startsWith(`${href}/`)}
              href={href}
              icon={item.icon}
              key={item.id}
              label={item.label}
            />
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

function HomeSection({
  section,
  slot,
  spaceId,
  spaceKey,
}: SectionProps & { slot: "space.home.aside" | "space.home.main" }) {
  const label = useSectionLabel(section);
  const { items } = section.useItems({ spaceId, spaceKey });
  const [open, setOpen] = useSpaceSectionOpen(
    openStorageKey(section, slot),
    spaceKey
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceHomeSectionHeading onOpenChange={setOpen} open={open}>
        {label}
      </SpaceHomeSectionHeading>
      <CollapsibleContent>
        <div className="ui-card-raised flex flex-col rounded-[14px] px-1.5 py-1">
          {items.map((item) => {
            const Icon = item.icon ?? Boxes;
            return (
              <Link
                className="flex items-center gap-2.5 rounded-[10px] px-2 py-2 hover:bg-accent/60"
                key={item.id}
                to={spaceModulePath(
                  spaceKey,
                  sectionModuleId(section),
                  item.path
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-muted text-muted-foreground">
                  <Icon className="size-3.5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-[13px]">
                    {item.label}
                  </span>
                  {slot === "space.home.main" && item.description ? (
                    <span className="line-clamp-1 text-[12.5px] text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SpacePluginSidebarSections({
  spaceId,
  spaceKey,
}: {
  spaceId: string;
  spaceKey: string;
}) {
  const sections = useSlotSections(spaceId, "space.sidebar");
  return sections.map((section) => (
    <SidebarSection
      key={`${section.pluginId}:${section.id}`}
      section={section}
      spaceId={spaceId}
      spaceKey={spaceKey}
    />
  ));
}

export function SpacePluginHomeSections({
  slot,
  spaceId,
  spaceKey,
}: {
  slot: "space.home.aside" | "space.home.main";
  spaceId: string;
  spaceKey: string;
}) {
  const sections = useSlotSections(spaceId, slot);
  return sections.map((section) => (
    <HomeSection
      key={`${section.pluginId}:${section.id}`}
      section={section}
      slot={slot}
      spaceId={spaceId}
      spaceKey={spaceKey}
    />
  ));
}
