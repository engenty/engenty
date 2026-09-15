// File tree + text editor for the selected workspace mount. Mount picker lives
// in the tree header; the selected path sits in the editor header. Actions: "+"
// opens the new-file modal; Save + trash (with confirm) sit beside the path.
// Tree is cached (see use-agent-workspace-tab); writes/deletes are also
// rejected server-side.

import {
  PaneResizeHandle,
  usePersistedEwResizePaneWidth,
} from "@engenty/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Plus, Trash2 } from "lucide-react";
import { type CSSProperties, useState } from "react";

import type { useAgentWorkspaceTab } from "./use-agent-workspace-tab";
import { WorkspaceCodeEditor } from "./workspace-code-editor";
import { WorkspaceFileTree } from "./workspace-file-tree";
import { WorkspaceNewFileDialog } from "./workspace-new-file-dialog";
import { collectFolderPaths } from "./workspace-tree-utils";

const TREE_WIDTH_STORAGE_KEY = "engenty.agent_workspace.tree_width_px";
const TREE_WIDTH_DEFAULT_PX = 240;
const TREE_WIDTH_MIN_PX = 160;
const TREE_WIDTH_MAX_PX = 480;

interface WorkspaceFileBrowserProps {
  t: (key: string) => string;
  workspace: ReturnType<typeof useAgentWorkspaceTab>;
}

function fileReadError(
  workspace: ReturnType<typeof useAgentWorkspaceTab>
): string | null {
  // A 404 on an unsaved (new) file is expected — only surface real read errors.
  if (workspace.isNewFile || !workspace.fileQuery.isError) {
    return null;
  }
  const error = workspace.fileQuery.error;
  return error instanceof Error ? error.message : "Error";
}

function mountLabel(
  mount: {
    access: string;
    browsable: boolean;
    path: string;
    requiresBinding?: boolean;
    scope: string;
  },
  t: (key: string) => string
): string {
  const access =
    mount.access === "ro" ? t("workspace.readOnly") : t("workspace.readWrite");
  const suffix = mount.browsable
    ? ""
    : ` · ${
        mount.requiresBinding
          ? t("workspace.requiresBinding")
          : t("workspace.unavailable")
      }`;
  return `${mount.path} · ${mount.scope} · ${access}${suffix}`;
}

export function WorkspaceFileBrowser({
  t,
  workspace,
}: WorkspaceFileBrowserProps) {
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const readError = fileReadError(workspace);
  const isLoadingFile =
    workspace.selectedFile !== null &&
    !workspace.isNewFile &&
    workspace.fileQuery.isLoading;
  const view = workspace.view;
  const {
    displayedWidthPx,
    handleResizeKeyDown,
    handleResizePointerDown,
    isResizing,
  } = usePersistedEwResizePaneWidth({
    defaultPx: TREE_WIDTH_DEFAULT_PX,
    maxPx: TREE_WIDTH_MAX_PX,
    minPx: TREE_WIDTH_MIN_PX,
    storageKey: TREE_WIDTH_STORAGE_KEY,
  });

  return (
    <div className="ui-card-elevated flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <aside
        className="flex min-h-0 w-full flex-col border-b lg:w-(--workspace-tree-width) lg:shrink-0 lg:border-b-0"
        style={
          {
            "--workspace-tree-width": `${displayedWidthPx}px`,
          } as CSSProperties
        }
      >
        <div className="shrink-0 space-y-1.5 border-b p-2">
          {view && !workspace.mountLocked ? (
            <Select
              onValueChange={workspace.selectMount}
              value={workspace.selectedMount ?? ""}
            >
              <SelectTrigger
                aria-label={t("workspace.mounts")}
                className="h-8 w-full"
                size="sm"
              >
                <SelectValue placeholder={t("workspace.selectMount")} />
              </SelectTrigger>
              <SelectContent>
                {view.mounts.map((mount) => (
                  <SelectItem
                    disabled={!mount.browsable}
                    key={mount.path}
                    value={mount.path}
                  >
                    <span className="font-mono text-xs">
                      {mountLabel(mount, t)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <div className="flex items-center justify-between gap-2 px-0.5">
            <span className="font-medium text-muted-foreground text-xs">
              {t("workspace.files")}
            </span>
            {workspace.readOnly ? (
              <Badge className="h-5 px-1.5 text-[10px]" variant="secondary">
                {t("workspace.readOnly")}
              </Badge>
            ) : (
              <Button
                aria-label={t("workspace.newFileTitle")}
                className="size-7"
                onClick={() => setNewFileOpen(true)}
                size="icon"
                variant="ghost"
              >
                <Plus className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-1.5">
            {workspace.treeQuery.isLoading ? (
              <p className="p-1.5 text-muted-foreground text-xs">
                {t("workspace.loading")}
              </p>
            ) : workspace.tree.length === 0 ? (
              <p className="p-1.5 text-muted-foreground text-xs">
                {t("workspace.empty")}
              </p>
            ) : (
              <WorkspaceFileTree
                nodes={workspace.tree}
                onSelect={workspace.setSelectedFile}
                selectedPath={workspace.selectedFile}
              />
            )}
          </div>
        </ScrollArea>
      </aside>

      <div className="hidden shrink-0 lg:flex">
        <PaneResizeHandle
          isResizing={isResizing}
          label={t("workspace.resizeTree")}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={handleResizePointerDown}
        />
      </div>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {workspace.selectedFile ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
                {workspace.selectedFile}
                {isLoadingFile ? ` · ${t("workspace.loading")}` : ""}
              </code>
              {workspace.readOnly ? null : (
                <>
                  <Button
                    disabled={!workspace.isDirty || workspace.isBusy}
                    onClick={workspace.onSave}
                    size="sm"
                  >
                    {t("workspace.save")}
                  </Button>
                  <Button
                    aria-label={t("workspace.delete")}
                    className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={workspace.isBusy || workspace.isNewFile}
                    onClick={() => setDeleteOpen(true)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
            {readError ? (
              <p className="shrink-0 px-2 py-1 text-destructive text-xs">
                {readError}
              </p>
            ) : null}
            <WorkspaceCodeEditor
              filePath={workspace.selectedFile}
              onChange={workspace.setEditorBody}
              readOnly={workspace.readOnly}
              value={workspace.editorBody}
            />
            {workspace.errorMessage ? (
              <p className="shrink-0 px-2 py-1 text-destructive text-xs">
                {workspace.errorMessage}
              </p>
            ) : null}
          </>
        ) : (
          <p className="p-3 text-muted-foreground text-sm">
            {t("workspace.selectFile")}
          </p>
        )}
      </section>

      <WorkspaceNewFileDialog
        folderPaths={collectFolderPaths(workspace.tree)}
        onCreate={workspace.startNewFile}
        onOpenChange={setNewFileOpen}
        open={newFileOpen}
        t={t}
      />

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={workspace.isBusy}>
              {t("workspace.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={workspace.isBusy}
              onClick={(event) => {
                event.preventDefault();
                workspace.onDelete();
                setDeleteOpen(false);
              }}
            >
              {t("workspace.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
