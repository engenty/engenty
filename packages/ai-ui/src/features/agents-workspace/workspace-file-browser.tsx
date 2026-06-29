// File tree + text editor for the selected workspace mount. Actions live at the
// top: a "+" in the tree header opens the new-file modal; Save + a red trash
// (with a confirm modal) sit in the editor header. The whole tree is cached
// (see use-agent-workspace-tab); writes/deletes are also rejected server-side.
//
// Height is capped to the viewport (with a min for small screens) so the tree
// scrolls within its card and the editor fills the height (no collapse on load).

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
  Card,
  CardContent,
  ScrollArea,
  Textarea,
} from "@engenty/ui-core";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { useAgentWorkspaceTab } from "./use-agent-workspace-tab";
import { WorkspaceFileTree } from "./workspace-file-tree";
import { WorkspaceNewFileDialog } from "./workspace-new-file-dialog";
import { collectFolderPaths } from "./workspace-tree-utils";

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

  return (
    <div className="grid gap-4 lg:h-[calc(100dvh-16rem)] lg:min-h-[34rem] lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Card className="ui-canvas-elevated flex min-h-0 flex-col">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div className="flex shrink-0 items-center justify-between gap-2">
            <span className="font-medium text-sm">{t("workspace.files")}</span>
            {workspace.readOnly ? (
              <Badge variant="secondary">{t("workspace.readOnly")}</Badge>
            ) : (
              <Button
                aria-label={t("workspace.newFileTitle")}
                onClick={() => setNewFileOpen(true)}
                size="icon"
                variant="ghost"
              >
                <Plus className="size-4" />
              </Button>
            )}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            {workspace.treeQuery.isLoading ? (
              <p className="p-2 text-muted-foreground text-sm">
                {t("workspace.loading")}
              </p>
            ) : workspace.tree.length === 0 ? (
              <p className="p-2 text-muted-foreground text-sm">
                {t("workspace.empty")}
              </p>
            ) : (
              <WorkspaceFileTree
                nodes={workspace.tree}
                onSelect={workspace.setSelectedFile}
                selectedPath={workspace.selectedFile}
              />
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="ui-canvas-elevated flex min-h-0 flex-col">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          {workspace.selectedFile ? (
            <>
              <div className="flex shrink-0 items-center gap-2">
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
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={workspace.isBusy || workspace.isNewFile}
                      onClick={() => setDeleteOpen(true)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </div>
              {readError ? (
                <p className="shrink-0 text-destructive text-sm">{readError}</p>
              ) : null}
              <Textarea
                className="min-h-[16rem] flex-1 resize-none font-mono text-sm"
                onChange={(event) =>
                  workspace.setEditorBody(event.target.value)
                }
                readOnly={workspace.readOnly}
                value={workspace.editorBody}
              />
              {workspace.errorMessage ? (
                <p className="shrink-0 text-destructive text-sm">
                  {workspace.errorMessage}
                </p>
              ) : null}
            </>
          ) : (
            <p className="p-2 text-muted-foreground text-sm">
              {t("workspace.selectFile")}
            </p>
          )}
        </CardContent>
      </Card>

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
