/**
 * One mount kind per modal. The setup endpoint reconciles the complete desired
 * set, so every save carries the other kinds through unchanged.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@engenty/ui-core";
import type { SpaceResourceKind } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import type { Space } from "@/lib/api/spaces-client";
import { spaceAgentHirePath } from "@/lib/space-routes";
import {
  useSaveSpaceSetupMutation,
  useSpaceMountsQuery,
} from "@/lib/spaces-queries";
import { SpaceAgentPicker } from "./SpaceAgentPicker";
import { SpaceModulePicker } from "./SpaceModulePicker";
import { SpaceResourcePicker } from "./SpaceResourcePicker";
import {
  isModuleSkill,
  syncSpaceSkills,
} from "./space-capability-recommendations";
import {
  type SpaceCatalogItem,
  useSpaceMountCatalog,
} from "./space-mount-catalog";
import { SPACE_MOUNT_KIND_COPY } from "./space-mount-copy";
import {
  closeModuleDependencies,
  moduleRequiresFromItems,
  pendingRemovals,
  type SpaceSelection,
  selectionFromMounts,
  selectionToPayload,
} from "./space-setup-selection";

export function SpaceMountsDialog({
  kind,
  onOpenChange,
  open,
  space,
}: {
  /** Null closes the dialog — the page keeps "which kind" and "open" as one fact. */
  kind: SpaceResourceKind | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  space: Space | null;
}) {
  const { t } = useTranslation("common");
  const mountsQuery = useSpaceMountsQuery(open && space ? space.id : null);
  const mounts = useMemo(() => mountsQuery.data ?? [], [mountsQuery.data]);
  // `ownerUserId` is what makes a space personal — decision 7 uses it to decide
  // whether personal accounts may be offered here at all.
  const catalog = useSpaceMountCatalog(mounts, open, {
    isPersonal: space?.ownerUserId != null,
  });
  const catalogModuleIds = useMemo(
    () => new Set(catalog.modules.map((module) => module.id)),
    [catalog.modules]
  );
  const save = useSaveSpaceSetupMutation();

  const [selection, setSelection] = useState<SpaceSelection>(new Map());
  const [seeded, setSeeded] = useState(false);

  // Seeded once per opening, and only after the refetch lands: after a save the
  // mounts query is invalidated but its CACHED rows are still readable, so
  // reopening immediately would seed from the pre-save set and silently put
  // back the mount that was just removed.
  useEffect(() => {
    if (!open) {
      setSeeded(false);
      return;
    }
    if (
      seeded ||
      catalog.isPending ||
      mountsQuery.isPending ||
      mountsQuery.isFetching
    ) {
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
    catalog.agents,
    catalog.isPending,
    catalog.skills,
    catalogModuleIds,
    mounts,
    mountsQuery.isFetching,
    mountsQuery.isPending,
    open,
    seeded,
  ]);

  const items: SpaceCatalogItem[] = useMemo(() => {
    switch (kind) {
      case "agent":
        return catalog.agents;
      case "connection":
        return catalog.connections;
      case "module":
        return catalog.modules;
      case "skill":
        return catalog.skills.filter(
          (skill) => !isModuleSkill(skill, catalogModuleIds)
        );
      default:
        return [];
    }
  }, [catalog, catalogModuleIds, kind]);

  // Only this kind's removals are announced: the other three are carried
  // through untouched, so naming them would be a warning about nothing.
  const removals = useMemo(
    () =>
      kind
        ? pendingRemovals(
            selection,
            mounts.filter((mount) => mount.resourceType === kind)
          )
        : [],
    [kind, mounts, selection]
  );

  const loading = mountsQuery.isPending || catalog.isPending || !seeded;
  const errorMessage = save.error instanceof Error ? save.error.message : null;

  const copy = kind ? SPACE_MOUNT_KIND_COPY[kind] : null;
  const commitSelection = async (next: SpaceSelection) => {
    if (!space) {
      return false;
    }
    const synced = syncSpaceSkills(
      closeModuleDependencies(next, moduleRequiresFromItems(catalog.modules)),
      catalog.skills,
      catalogModuleIds
    );
    try {
      await save.mutateAsync({
        color: space.color,
        icon: space.icon,
        mounts: selectionToPayload(synced),
        name: space.name,
        spaceId: space.id,
      });
      setSelection(synced);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open && kind != null}>
      <DialogContent
        className={cn(
          "flex max-h-[85vh] flex-col",
          kind === "module" || kind === "agent"
            ? "sm:max-w-3xl"
            : "sm:max-w-2xl"
        )}
      >
        <DialogHeader>
          <DialogTitle>{copy ? t(copy.titleKey) : ""}</DialogTitle>
          {/* No selected-count. The ticks below ARE the count, and a number in
              the corner only competes with the close button for the same
              inch. */}
          <DialogDescription>{copy ? t(copy.hintKey) : ""}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
              <Spinner className="size-4" />
              {t("spaces.setup.loadingCatalog")}
            </div>
          ) : kind === "module" ? (
            <SpaceModulePicker
              commit={commitSelection}
              items={items}
              lockedKeys={catalog.lockedKeys}
              saving={save.isPending}
              selection={selection}
            />
          ) : kind === "agent" ? (
            <SpaceAgentPicker
              commit={commitSelection}
              hirePath={space ? spaceAgentHirePath(space.key) : undefined}
              items={items}
              lockedKeys={catalog.lockedKeys}
              onHire={() => onOpenChange(false)}
              saving={save.isPending}
              selection={selection}
            />
          ) : items.length === 0 ? (
            <p className="px-2 py-8 text-center text-muted-foreground text-sm">
              {t("spaces.setup.emptyCatalog")}
            </p>
          ) : kind ? (
            <SpaceResourcePicker
              items={items}
              kind={kind}
              lockedKeys={catalog.lockedKeys}
              selection={selection}
              setSelection={setSelection}
            />
          ) : null}
        </div>

        {kind !== "module" && kind !== "agent" && removals.length > 0 ? (
          // Said BEFORE the save, not after: this is the sentence that decides
          // whether someone reaches for the checkbox at all.
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            {t("spaces.setup.removalNotice", {
              count: removals.length,
              names: removals.map((mount) => mount.resourceKey).join(", "),
            })}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="text-destructive text-xs">{errorMessage}</p>
        ) : null}

        <DialogFooter>
          {kind === "module" || kind === "agent" ? (
            <Button
              disabled={save.isPending}
              onClick={() => onOpenChange(false)}
              type="button"
            >
              {t("actions.close", { defaultValue: "Close" })}
            </Button>
          ) : (
            <>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                {t("actions.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                disabled={loading || save.isPending || !space}
                onClick={() => {
                  if (!space) {
                    return;
                  }
                  save.mutate(
                    {
                      color: space.color,
                      icon: space.icon,
                      mounts: selectionToPayload(selection),
                      name: space.name,
                      spaceId: space.id,
                    },
                    { onSuccess: () => onOpenChange(false) }
                  );
                }}
                type="button"
              >
                {save.isPending
                  ? t("saving", { defaultValue: "Saving…" })
                  : t("save", { defaultValue: "Save" })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
