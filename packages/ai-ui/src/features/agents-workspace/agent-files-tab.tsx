// Instruction files tab — same split as Workspace: resizable file list + Monaco.

import {
  PaneResizeHandle,
  usePersistedEwResizePaneWidth,
} from "@engenty/app-shell";
import { Badge, Button, ScrollArea } from "@engenty/ui-core";
import { Plus, Save } from "lucide-react";
import { type CSSProperties, useState } from "react";
import type {
  AiInstructionChange,
  AiInstructionFileDocument,
  InstructionEditScope,
} from "../../lib/admin/instruction-settings-api";
import type { InstructionOverrideFlags } from "../ai-settings/instruction-groups";
import { EditorOverflowMenu } from "./editor-overflow-menu";
import {
  InstructionBodyEditor,
  InstructionModeToggle,
} from "./instruction-body-editor";
import { InstructionFilesList } from "./instruction-files-list";
import { InstructionHistoryDialog } from "./instruction-history-dialog";
import type { InstructionEditorMode } from "./instruction-markdown-editor";
import { InstructionNewFileDialog } from "./instruction-new-file-dialog";
import { InstructionOverwriteDialog } from "./instruction-overwrite-dialog";

const TREE_WIDTH_STORAGE_KEY = "engenty.agent_instructions.tree_width_px";
const TREE_WIDTH_DEFAULT_PX = 220;
const TREE_WIDTH_MIN_PX = 160;
const TREE_WIDTH_MAX_PX = 420;
const SPLIT_TOOLBAR_CLASS =
  "flex h-10 shrink-0 items-center gap-2 overflow-hidden border-b px-2";

interface AgentFilesTabProps {
  canReset: boolean;
  createErrorMessage?: string | null;
  editorBody: string;
  errorMessage: string | null;
  files: AiInstructionFileDocument[];
  history: AiInstructionChange[];
  isBusy: boolean;
  isCreating?: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onChangeBody: (value: string) => void;
  onCreateFile: (filename: string) => void | Promise<void>;
  onCreateVersion: (reason: string) => void;
  onReset: () => void;
  onRollback: (changeId: string) => void;
  onSave: () => void;
  onSelectFile: (documentKey: string) => void;
  overrideFlagsByKey: Map<string, InstructionOverrideFlags>;
  scope: InstructionEditScope;
  selectedDocument: AiInstructionFileDocument | null;
  selectedKey: string;
  setScope: (scope: InstructionEditScope) => void;
  t: (key: string) => string;
  tenantOverrideActive: boolean;
  userOverrideActive: boolean;
}

export function AgentFilesTab({
  canReset,
  createErrorMessage = null,
  editorBody,
  errorMessage,
  files,
  history,
  isBusy,
  isCreating = false,
  isDirty,
  isSaving,
  onChangeBody,
  onCreateFile,
  onCreateVersion,
  onReset,
  onRollback,
  onSave,
  onSelectFile,
  overrideFlagsByKey,
  scope,
  selectedDocument,
  selectedKey,
  setScope,
  t,
  tenantOverrideActive,
  userOverrideActive,
}: AgentFilesTabProps) {
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [editorMode, setEditorMode] =
    useState<InstructionEditorMode>("wysiwyg");
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

  const filePath = selectedDocument?.filename ?? "instructions.md";
  const scopedOverrideActive =
    scope === "user" ? userOverrideActive : tenantOverrideActive;
  const selectedOverridden = tenantOverrideActive || userOverrideActive;
  const selectedOverrideLabel = userOverrideActive
    ? t("instructions.layerUser")
    : tenantOverrideActive
      ? t("instructions.layerTenant")
      : t("instructions.overriddenBadge");

  function handleSaveClick() {
    if (!(isDirty && !isBusy)) {
      return;
    }
    if (!scopedOverrideActive) {
      setOverwriteOpen(true);
      return;
    }
    onSave();
  }

  function overrideMarkerLabel(flags: InstructionOverrideFlags) {
    if (flags.user && flags.tenant) {
      return t("instructions.overriddenBoth");
    }
    if (flags.user) {
      return t("instructions.layerUser");
    }
    if (flags.tenant) {
      return t("instructions.layerTenant");
    }
    return t("instructions.overriddenBadge");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {createErrorMessage ? (
        <p className="shrink-0 text-destructive text-xs">
          {createErrorMessage}
        </p>
      ) : null}

      <div className="ui-card-elevated flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside
          className="relative flex min-h-0 w-full flex-col border-b lg:w-(--instructions-tree-width) lg:shrink-0 lg:border-r lg:border-b-0"
          style={
            {
              "--instructions-tree-width": `${displayedWidthPx}px`,
            } as CSSProperties
          }
        >
          <div className={SPLIT_TOOLBAR_CLASS}>
            <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground text-xs">
              {t("workspace.files")}
            </span>
            <Button
              aria-label={t("instructions.newFileTitle")}
              className="size-7 shrink-0"
              onClick={() => setNewFileOpen(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-1.5">
              <InstructionFilesList
                documents={files}
                emptyLabel={t("agents.filesEmpty")}
                onSelect={onSelectFile}
                openBadgeLabel={t("workspace.instructionFileOpenBadge")}
                overrideFlagsByKey={overrideFlagsByKey}
                overrideMarkerLabel={overrideMarkerLabel}
                selectedKey={selectedKey}
              />
            </div>
          </ScrollArea>
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
          {selectedDocument ? (
            <>
              <div className={SPLIT_TOOLBAR_CLASS}>
                <code className="min-w-0 truncate font-mono text-muted-foreground text-xs">
                  {selectedDocument.filename}
                </code>
                {selectedOverridden ? (
                  <Badge
                    className="hidden h-5 shrink-0 px-1.5 text-[10px] lg:inline-flex"
                    title={selectedOverrideLabel}
                  >
                    {t("instructions.overriddenBadge")}
                  </Badge>
                ) : null}
                <InstructionModeToggle
                  mode={editorMode}
                  onModeChange={setEditorMode}
                  t={t}
                />
                <div className="min-w-0 flex-1" />
                <div className="flex h-7 shrink-0 items-center rounded-md border bg-muted/20 p-px">
                  <Button
                    className="h-6 px-2 text-xs"
                    onClick={() => setScope("tenant")}
                    size="sm"
                    type="button"
                    variant={scope === "tenant" ? "secondary" : "ghost"}
                  >
                    {t("instructions.scopeTenant")}
                  </Button>
                  <Button
                    className="h-6 px-2 text-xs"
                    onClick={() => setScope("user")}
                    size="sm"
                    type="button"
                    variant={scope === "user" ? "secondary" : "ghost"}
                  >
                    {t("instructions.scopeUser")}
                  </Button>
                </div>
                <InstructionHistoryDialog
                  history={history}
                  isBusy={isBusy}
                  isDirty={isDirty}
                  isSaving={isSaving}
                  onCreateVersion={onCreateVersion}
                  onRollback={onRollback}
                  t={t}
                />
                <Button
                  className="h-7 shrink-0"
                  disabled={!isDirty || isBusy}
                  onClick={handleSaveClick}
                  size="sm"
                  type="button"
                >
                  <Save className="size-3.5" />
                  {isSaving ? t("actions.saving") : t("actions.save")}
                </Button>
                <EditorOverflowMenu
                  isBusy={isBusy}
                  moreActionsLabel={t("instructions.moreActions")}
                  onReset={onReset}
                  resetDisabled={!canReset || isBusy}
                  t={t}
                />
              </div>
              {errorMessage ? (
                <p className="shrink-0 px-2 py-1 text-destructive text-xs">
                  {errorMessage}
                </p>
              ) : null}
              <InstructionBodyEditor
                editorBody={editorBody}
                filePath={filePath}
                isBusy={isBusy}
                mode={editorMode}
                onChangeBody={onChangeBody}
                t={t}
              />
            </>
          ) : (
            <p className="p-3 text-muted-foreground text-sm">
              {t("instructions.selectHint")}
            </p>
          )}
        </section>
      </div>

      <InstructionNewFileDialog
        isPending={isCreating}
        onCreate={onCreateFile}
        onOpenChange={setNewFileOpen}
        open={newFileOpen}
        t={t}
      />
      <InstructionOverwriteDialog
        onConfirm={onSave}
        onOpenChange={setOverwriteOpen}
        open={overwriteOpen}
        t={t}
      />
    </div>
  );
}
