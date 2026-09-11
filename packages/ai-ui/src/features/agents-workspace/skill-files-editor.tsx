// Skill file editor — same split as agent instructions: resizable tree +
// WYSIWYG / source body. Scope/history controls stay on the instructions tab.

import {
  PaneResizeHandle,
  usePersistedEwResizePaneWidth,
} from "@engenty/app-shell";
import { Button } from "@engenty/ui-core";
import { Plus, Save } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { EditorOverflowMenu } from "./editor-overflow-menu";
import {
  InstructionBodyEditor,
  InstructionModeToggle,
} from "./instruction-body-editor";
import type { InstructionEditorMode } from "./instruction-markdown-editor";
import { InstructionNewFileDialog } from "./instruction-new-file-dialog";
import type { SkillDetailFileEntry } from "./skill-detail-file-entries.js";
import { SkillFilesTree } from "./skill-files-tree";

const TREE_WIDTH_STORAGE_KEY = "engenty.skill_files.tree_width_px";
const TREE_WIDTH_DEFAULT_PX = 220;
const TREE_WIDTH_MIN_PX = 160;
const TREE_WIDTH_MAX_PX = 420;
const SPLIT_TOOLBAR_CLASS =
  "flex h-10 shrink-0 items-center gap-2 overflow-hidden border-b px-2";

function isMarkdownPath(path: string): boolean {
  return /\.(md|mdx)$/i.test(path) || path === "SKILL.md";
}

export interface SkillFilesEditorProps {
  canCreate: boolean;
  canEdit: boolean;
  createErrorMessage?: string | null;
  editorBody: string;
  errorMessage: string | null;
  files: SkillDetailFileEntry[];
  isBusy: boolean;
  isCreating?: boolean;
  isDeleting?: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onChangeBody: (value: string) => void;
  onCreateFile: (filename: string) => void | Promise<void>;
  onDelete: () => void;
  onReset: () => void;
  onSave: () => void;
  onSelectFile: (path: string) => void;
  selectedPath: string;
  t: (key: string) => string;
}

export function SkillFilesEditor({
  canCreate,
  canEdit,
  createErrorMessage = null,
  editorBody,
  errorMessage,
  files,
  isBusy,
  isCreating = false,
  isDeleting = false,
  isDirty,
  isSaving,
  onChangeBody,
  onCreateFile,
  onDelete,
  onReset,
  onSave,
  onSelectFile,
  selectedPath,
  t,
}: SkillFilesEditorProps) {
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<InstructionEditorMode>(() =>
    isMarkdownPath(selectedPath) ? "wysiwyg" : "source"
  );
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

  useEffect(() => {
    setEditorMode(isMarkdownPath(selectedPath) ? "wysiwyg" : "source");
  }, [selectedPath]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {createErrorMessage ? (
        <p className="shrink-0 text-destructive text-xs">
          {createErrorMessage}
        </p>
      ) : null}

      <div className="ui-card-elevated flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside
          className="relative flex min-h-0 w-full flex-col border-b lg:w-(--skill-files-tree-width) lg:shrink-0 lg:border-r lg:border-b-0"
          style={
            {
              "--skill-files-tree-width": `${displayedWidthPx}px`,
            } as CSSProperties
          }
        >
          <div className={SPLIT_TOOLBAR_CLASS}>
            <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground text-xs">
              {t("workspace.files")}
            </span>
            {canCreate ? (
              <Button
                aria-label={t("skillsDetail.newFileTitle")}
                className="size-7 shrink-0"
                onClick={() => setNewFileOpen(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Plus className="size-3.5" />
              </Button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            <SkillFilesTree
              emptyLabel={t("skillsDetail.filesEmpty")}
              files={files}
              onSelect={onSelectFile}
              openBadgeLabel={t("workspace.instructionFileOpenBadge")}
              selectedPath={selectedPath}
            />
          </div>
          <div className="absolute inset-y-0 -right-1 z-10 hidden w-2 lg:flex">
            <PaneResizeHandle
              isResizing={isResizing}
              label={t("workspace.resizeTree")}
              onKeyDown={handleResizeKeyDown}
              onPointerDown={handleResizePointerDown}
            />
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className={SPLIT_TOOLBAR_CLASS}>
            <code className="min-w-0 truncate font-mono text-muted-foreground text-xs">
              {selectedPath}
            </code>
            <InstructionModeToggle
              mode={editorMode}
              onModeChange={setEditorMode}
              t={t}
            />
            <div className="min-w-0 flex-1" />
            {canEdit ? (
              <>
                <Button
                  className="h-7 shrink-0"
                  disabled={!isDirty || isBusy}
                  onClick={onSave}
                  size="sm"
                  type="button"
                >
                  <Save className="size-3.5" />
                  {isSaving ? t("actions.saving") : t("actions.save")}
                </Button>
                <EditorOverflowMenu
                  deleteAction={{
                    cancelLabel: t("skillsDetail.cancel"),
                    confirmDescription: t("skillsDetail.deleteDescription"),
                    confirmTitle: t("skillsDetail.deleteConfirm"),
                    isDeleting,
                    label: t("skillsCatalog.delete"),
                    onDelete,
                  }}
                  isBusy={isBusy}
                  moreActionsLabel={t("skillsDetail.moreActions")}
                  onReset={onReset}
                  resetDisabled={!isDirty || isBusy}
                  t={t}
                />
              </>
            ) : null}
          </div>
          {errorMessage ? (
            <p className="shrink-0 px-2 py-1 text-destructive text-xs">
              {errorMessage}
            </p>
          ) : null}
          <InstructionBodyEditor
            editorBody={editorBody}
            filePath={selectedPath}
            isBusy={isBusy || !canEdit}
            mode={editorMode}
            onChangeBody={onChangeBody}
            t={t}
          />
        </section>
      </div>

      <InstructionNewFileDialog
        copy={{
          create: t("skillsDetail.newFileCreate"),
          hint: t("skillsDetail.newFileHint"),
          name: t("skillsDetail.newFileName"),
          placeholder: t("skillsDetail.newFilePlaceholder"),
          title: t("skillsDetail.newFileTitle"),
        }}
        isPending={isCreating}
        onCreate={onCreateFile}
        onOpenChange={setNewFileOpen}
        open={newFileOpen}
        t={t}
      />
    </div>
  );
}
