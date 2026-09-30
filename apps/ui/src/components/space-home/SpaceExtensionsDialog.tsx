/**
 * A Space's Erweiterungen dialog: the connections module's one dialog for this
 * Space, with the Space's skill mounts as its Skills tab. Space home and Space
 * settings open it.
 */
import { ExtensionsDialog } from "@engenty/connections/ui/marketplace";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Spinner } from "@engenty/ui-core";
import { useEffect, useMemo, useState } from "react";
import {
  isModuleSkill,
  syncSpaceSkills,
} from "@/components/spaces/space-capability-recommendations";
import { useSpaceMountCatalog } from "@/components/spaces/space-mount-catalog";
import {
  type SpaceSelection,
  selectionFromMounts,
  selectionToPayload,
} from "@/components/spaces/space-setup-selection";
import {
  useSaveSpaceSetupMutation,
  useSpaceMountsQuery,
  useSpacesQuery,
} from "@/lib/spaces-queries";
import { SpaceSkillPackages } from "./space-skill-packages";

export type SpaceConnectTab = "plugins" | "skills";

export function SpaceExtensionsDialog({
  initialDetailsId = null,
  initialTab = "plugins",
  onOpenChange,
  open,
  spaceId,
}: {
  /** Open on one connector's detail (its catalog id). */
  initialDetailsId?: string | null;
  initialTab?: SpaceConnectTab;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  spaceId: string;
}) {
  const spacesQuery = useSpacesQuery();
  const space = spacesQuery.data?.find((entry) => entry.id === spaceId) ?? null;

  return (
    <ExtensionsDialog
      initialDetailsId={initialDetailsId}
      initialTab={initialTab}
      onOpenChange={onOpenChange}
      open={open}
      owner={{ spaceId, spaceName: space?.name ?? null }}
      renderSkills={() => (space ? <SpaceSkillsTab space={space} /> : null)}
    />
  );
}

function SpaceSkillsTab({
  space,
}: {
  space: {
    color: string | null;
    icon: string | null;
    id: string;
    name: string;
  };
}) {
  const { t } = useTranslation("common");
  const mountsQuery = useSpaceMountsQuery(space.id);
  const mounts = useMemo(() => mountsQuery.data ?? [], [mountsQuery.data]);
  const catalog = useSpaceMountCatalog(mounts, true);
  const catalogModuleIds = useMemo(
    () => new Set(catalog.modules.map((module) => module.id)),
    [catalog.modules]
  );
  const skills = useMemo(
    () =>
      catalog.skills.filter((skill) => !isModuleSkill(skill, catalogModuleIds)),
    [catalog.skills, catalogModuleIds]
  );
  const save = useSaveSpaceSetupMutation();
  const [selection, setSelection] = useState<SpaceSelection>(new Map());
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || catalog.isPending || mountsQuery.isPending) {
      return;
    }
    setSelection(
      syncSpaceSkills(
        selectionFromMounts(mounts),
        catalog.skills,
        catalogModuleIds
      )
    );
    setSeeded(true);
  }, [
    catalog.isPending,
    catalog.skills,
    catalogModuleIds,
    mounts,
    mountsQuery.isPending,
    seeded,
  ]);

  if (!seeded) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
        <Spinner className="size-4" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SpaceSkillPackages
        onChange={setSelection}
        selection={selection}
        skills={skills}
      />
      {save.error instanceof Error ? (
        <p className="text-destructive text-xs">{save.error.message}</p>
      ) : null}
      <Button
        disabled={save.isPending}
        onClick={() => {
          const synced = syncSpaceSkills(
            selection,
            catalog.skills,
            catalogModuleIds
          );
          void save.mutateAsync({
            color: space.color,
            icon: space.icon,
            mounts: selectionToPayload(synced),
            name: space.name,
            spaceId: space.id,
          });
        }}
        type="button"
      >
        {save.isPending
          ? t("spaces.home.extensions.skillsSaving", {
              defaultValue: "Saving…",
            })
          : t("spaces.home.extensions.skillsSave", {
              defaultValue: "Save skills",
            })}
      </Button>
    </div>
  );
}
