/**
 * What you can DO to a node in the Data tree (PLAN-space-data-agent-crud P3.1).
 *
 * The tree was a reader and the file manager was the editor — two screens over
 * one store, which is the split this whole design exists to remove. These are
 * the actions, and they go through `/data/*`: the same endpoints an agent uses,
 * so a person renaming a folder and an agent renaming it are one call with one
 * approval card behind it.
 *
 * **Gating means HIDDEN, never a menu item that 405s.** The listing tells us
 * what the owning module supports (`capabilities`), so Contacts — which
 * deliberately has no `createNode` — simply shows no "New folder", instead of
 * offering one that fails. An app that offers actions which do not work teaches
 * people it is flaky, and they stop trusting the ones that do.
 */
import type { DriveNode } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from "@engenty/ui-core";
import {
  FolderPlus,
  Info,
  MoreVertical,
  PencilLine,
  Shield,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isConnectedFolder } from "@/components/spaces/space-data/connected-folder";
import { NodeInfoDialog } from "@/components/spaces/space-data/node-info-dialog";
import { NodePermissionsDialog } from "@/components/spaces/space-data/node-permissions-dialog";
import type { SpaceDataCapabilities } from "@/lib/api/space-data-client";
import type { SpaceDataActions } from "@/lib/space-data-actions";
import { describeSpaceDataOutcome } from "@/lib/space-data-outcome";

/** The `t` a caller passes in, narrowed to what this needs. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Report what happened, in the four flavours that are not all failures.
 *
 * An approval is NOT an error and must not wear an error's colour: the change
 * is pending, somebody was asked, and the person should walk away expecting it
 * to land — not retry it. A conflict is a warning with a way forward, not a
 * failure.
 *
 * `t` is passed in because the classifier is pure and has none; the two
 * sentences that are OURS get translated here, while the server's own message
 * is shown verbatim — it names the module's action, which is the useful half.
 */
export function reportSpaceDataOutcome(error: unknown, t: Translate): void {
  const outcome = describeSpaceDataOutcome(error);
  if (outcome.kind === "approval") {
    toast.info(
      t("spaces.data.outcomeApproval", {
        defaultValue:
          "This needs approval. Someone has been asked — the change is not applied yet.",
      })
    );
    return;
  }
  if (outcome.kind === "conflict") {
    toast.warning(
      t("spaces.data.outcomeConflict", {
        defaultValue:
          "This changed since you opened it. Reload to see the current version, then re-apply your edit.",
      })
    );
    return;
  }
  toast.error(
    outcome.message ||
      t("spaces.data.outcomeError", {
        defaultValue: "That did not work.",
      })
  );
}

/** A tree row's path in the data namespace, or null when it is not a data node. */
function dataPathOf(node: DriveNode): string | null {
  return node.dataPath ?? null;
}

export interface SpaceDataNodeActionsProps {
  actions: SpaceDataActions;
  /** What the owning module supports, keyed by the node's root. */
  capabilitiesFor: (path: string) => SpaceDataCapabilities;
  node: DriveNode;
  spaceId: string | null;
}

export function SpaceDataNodeActions({
  actions,
  capabilitiesFor,
  node,
  spaceId,
}: SpaceDataNodeActionsProps) {
  const { t } = useTranslation("common");
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [name, setName] = useState(node.name);

  const path = dataPathOf(node);
  if (!path) {
    // Projects and artifacts are space-scoped stores, not module records —
    // they have no data path and their own screens own their actions.
    return null;
  }
  const capabilities = capabilitiesFor(path);
  const isContainer = node.kind === "folder" || node.kind === "bundle";
  /**
   * A ROOT is a module's presence in the space, not a folder in it.
   *
   * It is removed by unmounting the module and renamed by nobody, so the server
   * refuses both — and a menu that offered them anyway would be exactly the
   * "item that 405s" this component exists to avoid. A root has no separator:
   * `Files` is a root, `Files/Verträge` is a folder inside one.
   */
  const isRoot = !path.includes("/");
  const canCreateHere = isContainer && capabilities.canCreate;
  const canMoveThis = capabilities.canMove && !isRoot;
  const canDeleteThis = capabilities.canDelete && !isRoot;
  const showPermissions = isConnectedFolder(node);

  const run = async (work: () => Promise<void>, done: string) => {
    try {
      await work();
      toast.success(done);
    } catch (error) {
      reportSpaceDataOutcome(error, t);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("actions.more", { defaultValue: "More actions" })}
            className="size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            data-row-menu-trigger
            size="icon"
            variant="ghost"
          >
            <MoreVertical aria-hidden className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canCreateHere ? (
            <DropdownMenuItem
              onSelect={() =>
                void run(
                  () =>
                    actions.createFolder({
                      name: t("spaces.data.newFolderName", {
                        defaultValue: "New folder",
                      }),
                      parentPath: path,
                    }),
                  t("spaces.data.folderCreated", {
                    defaultValue: "Folder created",
                  })
                )
              }
            >
              <FolderPlus className="mr-2 size-4" />
              {t("spaces.data.newFolder", { defaultValue: "New folder" })}
            </DropdownMenuItem>
          ) : null}
          {canMoveThis ? (
            <DropdownMenuItem
              onSelect={() => {
                setName(node.name);
                setRenaming(true);
              }}
            >
              <PencilLine className="mr-2 size-4" />
              {t("actions.rename", { defaultValue: "Rename" })}
            </DropdownMenuItem>
          ) : null}
          {canCreateHere || canMoveThis ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => setInspecting(true)}>
            <Info className="mr-2 size-4" />
            {t("spaces.data.getInfo", { defaultValue: "Get Info" })}
          </DropdownMenuItem>
          {showPermissions ? (
            <DropdownMenuItem onSelect={() => setPermissionsOpen(true)}>
              <Shield className="mr-2 size-4" />
              {t("spaces.data.permissions", { defaultValue: "Permissions" })}
            </DropdownMenuItem>
          ) : null}
          {canDeleteThis ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirmingDelete(true)}
                variant="destructive"
              >
                <Trash2 className="mr-2 size-4" />
                {t("actions.delete", { defaultValue: "Delete" })}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setRenaming} open={renaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("actions.rename", { defaultValue: "Rename" })}
            </DialogTitle>
            <DialogDescription>
              {t("spaces.data.renameHint", {
                defaultValue:
                  "The name changes; nothing moves. Links and references keep working, because a node is identified by its record, not by its name.",
              })}
            </DialogDescription>
          </DialogHeader>
          <Input
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <DialogFooter>
            <Button onClick={() => setRenaming(false)} variant="ghost">
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              disabled={!name.trim() || actions.isBusy}
              onClick={() =>
                void run(
                  async () => {
                    await actions.renameNode({ newName: name.trim(), path });
                    setRenaming(false);
                  },
                  t("spaces.data.renamed", { defaultValue: "Renamed" })
                )
              }
            >
              {t("actions.save", { defaultValue: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setConfirmingDelete} open={confirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("spaces.data.deleteTitle", {
                defaultValue: "Delete {{name}}?",
                name: node.name,
              })}
            </AlertDialogTitle>
            {/*
              A cascade is named, not implied. Someone approving in a hurry
              needs to see that the children AND their stored bytes go — that is
              the part a generic "Are you sure?" hides.
            */}
            <AlertDialogDescription>
              {isContainer
                ? t("spaces.data.deleteFolderWarning", {
                    defaultValue:
                      "Everything inside this folder is deleted too, including the stored bytes of every file in it. This cannot be undone.",
                  })
                : t("spaces.data.deleteFileWarning", {
                    defaultValue:
                      "This removes the file and its stored bytes. This cannot be undone.",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void run(
                  async () => {
                    await actions.removeNode({
                      path,
                      // Containers cascade; a leaf has nothing to take with it.
                      recursive: isContainer,
                    });
                    setConfirmingDelete(false);
                  },
                  t("spaces.data.deleted", { defaultValue: "Deleted" })
                )
              }
            >
              {t("actions.delete", { defaultValue: "Delete" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NodeInfoDialog
        node={node}
        onOpenChange={setInspecting}
        open={inspecting}
        spaceId={spaceId}
      />
      {showPermissions ? (
        <NodePermissionsDialog
          node={node}
          onOpenChange={setPermissionsOpen}
          open={permissionsOpen}
          spaceId={spaceId}
        />
      ) : null}
    </>
  );
}
