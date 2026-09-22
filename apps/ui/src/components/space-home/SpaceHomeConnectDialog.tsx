/**
 * Connect from a space home: plugins (accounts, MCP, imported connectors)
 * and skills, in one modal. Plugin enablement is the marketplace; skills
 * are space mounts saved with the rest of the space left untouched.
 */
import { PluginMarketplacePanel } from "@engenty/connections/ui/marketplace";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { ArrowLeft } from "lucide-react";
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

export function SpaceHomeConnectDialog({
  initialTab,
  onOpenChange,
  open,
  spaceId,
}: {
  initialTab: SpaceConnectTab;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  spaceId: string;
}) {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<SpaceConnectTab>(initialTab);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const spacesQuery = useSpacesQuery();
  const space = spacesQuery.data?.find((entry) => entry.id === spaceId) ?? null;

  useEffect(() => {
    if (!open) {
      setDetailsId(null);
      return;
    }
    setTab(initialTab);
  }, [initialTab, open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={cn(
          "grid h-[min(85vh,42rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-3xl",
          detailsId && "gap-3"
        )}
      >
        <DialogHeader>
          {detailsId ? (
            <Button
              aria-label={t("spaces.home.extensions.back", {
                defaultValue: "Back",
              })}
              className="-ml-2"
              onClick={() => setDetailsId(null)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ArrowLeft />
            </Button>
          ) : null}
          <DialogTitle className={detailsId ? "sr-only" : undefined}>
            {t("spaces.home.extensions.dialogTitle", {
              defaultValue: "Extensions",
            })}
          </DialogTitle>
        </DialogHeader>
        <Tabs
          className="flex h-full min-h-0 flex-col"
          onValueChange={(value) => setTab(value as SpaceConnectTab)}
          value={tab}
        >
          {detailsId ? null : (
            <TabsList className="w-full">
              <TabsTrigger className="flex-1" value="plugins">
                {t("spaces.home.extensions.tabPlugins", {
                  defaultValue: "Connections",
                })}
              </TabsTrigger>
              <TabsTrigger className="flex-1" value="skills">
                {t("spaces.home.extensions.tabSkills", {
                  defaultValue: "Skills",
                })}
              </TabsTrigger>
            </TabsList>
          )}
          <TabsContent
            className={cn(
              "min-h-0 flex-1 overflow-y-auto pr-1",
              detailsId ? "mt-0" : "mt-3"
            )}
            value="plugins"
          >
            {open && tab === "plugins" ? (
              <PluginMarketplacePanel
                detailsId={detailsId}
                onDetailsIdChange={setDetailsId}
                spaceId={spaceId}
              />
            ) : null}
          </TabsContent>
          <TabsContent
            className={cn(
              "min-h-0 flex-1 overflow-y-auto pr-1",
              detailsId ? "mt-0" : "mt-3"
            )}
            value="skills"
          >
            {open && tab === "skills" && space ? (
              <SpaceSkillsTab space={space} />
            ) : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
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
