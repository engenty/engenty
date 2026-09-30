/**
 * The home's right column, below Erweiterungen: the skills this space's
 * engenties can use. The space's own skills first, then one folder per
 * origin — each mounted module, engenty itself, and the tenant's library
 * (skills not on this space yet, with a "+" to add one). Any skill opens
 * read-only in a modal.
 */
import { SkillInspectDialog } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@engenty/ui-core";
import { ChevronDown, Folder, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { SpaceSectionAddButton } from "@/components/spaces/space-section-heading";
import {
  selectionFromMounts,
  selectionToPayload,
  toggleSelection,
} from "@/components/spaces/space-setup-selection";
import type { Space } from "@/lib/api/spaces-client";
import {
  groupSpaceHomeSkills,
  type SpaceHomeSkill,
  type SpaceHomeSkillFolder,
} from "@/lib/space-home-skills";
import {
  useSaveSpaceSetupMutation,
  useSpaceMountsQuery,
  useSpaceSetupCatalogQuery,
  useSpaceSkillCatalogQuery,
} from "@/lib/spaces-queries";
import { useSpaceModules } from "@/lib/use-space-modules";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";
import { SpaceExtensionsDialog } from "./SpaceExtensionsDialog";
import { SpaceHomeSectionHeading } from "./SpaceHomeSectionHeading";
import {
  SPACE_HOME_ROW_CLASSNAME,
  SPACE_HOME_ROW_GLYPH_CLASSNAME,
  SPACE_HOME_ROW_ICON_CLASSNAME,
} from "./space-home-row";

export function SpaceHomeSkills({ space }: { space: Space }) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.homeSkills,
    space.key
  );
  const [connectOpen, setConnectOpen] = useState(false);
  const [inspected, setInspected] = useState<{
    name: string;
    origin: string | null;
  } | null>(null);
  const mountsQuery = useSpaceMountsQuery(open ? space.id : null);
  const skillsQuery = useSpaceSkillCatalogQuery(open);
  const setupCatalogQuery = useSpaceSetupCatalogQuery(open);
  const save = useSaveSpaceSetupMutation();
  // The name the Module box shows (the rail's translated label), else the
  // catalog's.
  const { modules: spaceModules } = useSpaceModules(open ? space.id : null);

  const mounts = useMemo(() => mountsQuery.data ?? [], [mountsQuery.data]);
  const grouped = useMemo(() => {
    const mountedSkills = new Set<string>();
    const mountedModules = new Set<string>();
    for (const mount of mounts) {
      if (mount.resourceType === "skill") {
        mountedSkills.add(mount.resourceKey);
      } else if (
        mount.resourceType === "module" &&
        mount.agentAccess !== "none"
      ) {
        mountedModules.add(mount.resourceKey);
      }
    }
    return groupSpaceHomeSkills({
      catalog: skillsQuery.data ?? [],
      mountedModules,
      mountedSkills,
      moduleNames: new Map([
        ...(setupCatalogQuery.data?.modules ?? []).map(
          (module) => [module.id, module.name] as const
        ),
        ...spaceModules.map((module) => [module.id, module.label] as const),
      ]),
    });
  }, [mounts, setupCatalogQuery.data?.modules, skillsQuery.data, spaceModules]);

  const folderLabel = (folder: SpaceHomeSkillFolder) => {
    if (folder.kind === "engenty") {
      return t("spaces.home.skills.engenty", { defaultValue: "Engenty" });
    }
    if (folder.kind === "tenant") {
      return t("spaces.home.skills.tenant", { defaultValue: "Tenant" });
    }
    return folder.label ?? folder.id;
  };

  const addToSpace = (skill: SpaceHomeSkill) => {
    const selection = toggleSelection(
      selectionFromMounts(mounts),
      { resourceKey: skill.name, resourceType: "skill" },
      true
    );
    void save.mutateAsync({
      color: space.color,
      icon: space.icon,
      mounts: selectionToPayload(selection),
      name: space.name,
      spaceId: space.id,
    });
  };

  const addLabel = t("spaces.home.skills.add", { defaultValue: "Add skills" });
  const isEmpty = grouped.own.length === 0 && grouped.folders.length === 0;

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceHomeSectionHeading
        action={
          <SpaceSectionAddButton
            aria-label={addLabel}
            onClick={() => setConnectOpen(true)}
          />
        }
        onOpenChange={setOpen}
        open={open}
      >
        {t("spaces.home.skills.title", { defaultValue: "Skills" })}
      </SpaceHomeSectionHeading>
      <CollapsibleContent>
        <div className="ui-card-raised flex flex-col rounded-[14px] px-1.5 py-1">
          {isEmpty ? (
            <p className="px-2 py-2 text-muted-foreground text-sm">
              {t("spaces.home.skills.empty", {
                defaultValue: "This space uses no skills yet.",
              })}
            </p>
          ) : null}
          {grouped.own.map((skill) => (
            <button
              className={SPACE_HOME_ROW_CLASSNAME}
              key={skill.name}
              onClick={() => setInspected({ name: skill.name, origin: null })}
              type="button"
            >
              <span className={SPACE_HOME_ROW_ICON_CLASSNAME}>
                <Sparkles className={SPACE_HOME_ROW_GLYPH_CLASSNAME} />
              </span>
              <span className="min-w-0 flex-1 truncate">{skill.label}</span>
            </button>
          ))}
          {grouped.folders.map((folder) => (
            <SkillFolder
              adding={save.isPending}
              addLabel={t("spaces.home.skills.addToSpace", {
                defaultValue: "Add to this space",
              })}
              folder={folder}
              key={`${folder.kind}:${folder.id}`}
              label={folderLabel(folder)}
              onAdd={folder.kind === "tenant" ? addToSpace : undefined}
              onInspect={(skill) =>
                setInspected({ name: skill.name, origin: folderLabel(folder) })
              }
            />
          ))}
          {save.error instanceof Error ? (
            <p className="px-2 py-1 text-destructive text-xs">
              {save.error.message}
            </p>
          ) : null}
        </div>
      </CollapsibleContent>
      <SpaceExtensionsDialog
        initialTab="skills"
        onOpenChange={setConnectOpen}
        open={connectOpen}
        spaceId={space.id}
      />
      <SkillInspectDialog
        name={inspected?.name ?? null}
        onOpenChange={(next) => {
          if (!next) {
            setInspected(null);
          }
        }}
        origin={inspected?.origin}
      />
    </Collapsible>
  );
}

function SkillFolder({
  addLabel,
  adding,
  folder,
  label,
  onAdd,
  onInspect,
}: {
  addLabel: string;
  adding: boolean;
  folder: SpaceHomeSkillFolder;
  label: string;
  /** Present on the tenant folder: its skills are not on the space yet. */
  onAdd?: (skill: SpaceHomeSkill) => void;
  onInspect: (skill: SpaceHomeSkill) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Collapsible onOpenChange={setExpanded} open={expanded}>
      <CollapsibleTrigger
        className={cn(SPACE_HOME_ROW_CLASSNAME, "group/folder")}
      >
        <span className={SPACE_HOME_ROW_ICON_CLASSNAME}>
          <Folder className={SPACE_HOME_ROW_GLYPH_CLASSNAME} />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform]",
              "group-hover/folder:opacity-100 group-focus-visible/folder:opacity-100",
              expanded ? "" : "-rotate-90"
            )}
          />
        </span>
        <span className="font-medium text-muted-foreground text-xs tabular-nums">
          {folder.skills.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col pb-1 pl-9">
          {folder.skills.map((skill) => (
            <li className="flex items-center" key={skill.name}>
              <button
                className={cn(
                  "min-w-0 flex-1 truncate rounded-[8px] px-2 py-1 text-left text-foreground text-sm transition hover:bg-muted/60",
                  onAdd && "text-muted-foreground"
                )}
                onClick={() => onInspect(skill)}
                title={skill.description || undefined}
                type="button"
              >
                {skill.label}
              </button>
              {onAdd ? (
                <button
                  aria-label={`${addLabel}: ${skill.label}`}
                  className="flex size-6 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                  disabled={adding}
                  onClick={() => onAdd(skill)}
                  title={addLabel}
                  type="button"
                >
                  <Plus className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
