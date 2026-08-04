// Instruction files tab — same split as Workspace: resizable file list + Monaco.

import {
  PaneResizeHandle,
  usePersistedEwResizePaneWidth,
} from "@engenty/app-shell";
import {
  Badge,
  Button,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@engenty/ui-core";
import { History, Plus, RotateCcw, Save } from "lucide-react";
import { type CSSProperties, useState } from "react";
import type {
  AiInstructionChange,
  AiInstructionFileDocument,
  InstructionEditScope,
} from "../../lib/admin/instruction-settings-api";
import {
  InstructionBodyEditor,
  InstructionModeToggle,
} from "./instruction-body-editor";
import { InstructionFilesList } from "./instruction-files-list";
import type { InstructionEditorMode } from "./instruction-markdown-editor";
import { InstructionNewFileDialog } from "./instruction-new-file-dialog";
import { InstructionVersionDialog } from "./instruction-version-dialog";

const TREE_WIDTH_STORAGE_KEY = "engenty.agent_instructions.tree_width_px";
const TREE_WIDTH_DEFAULT_PX = 220;
const TREE_WIDTH_MIN_PX = 160;
const TREE_WIDTH_MAX_PX = 420;

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
  scope,
  selectedDocument,
  selectedKey,
  setScope,
  t,
  tenantOverrideActive,
  userOverrideActive,
}: AgentFilesTabProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-muted-foreground text-xs">
        {t("instructions.overlayHint")}
      </p>
      {createErrorMessage ? (
        <p className="shrink-0 text-destructive text-xs">
          {createErrorMessage}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card lg:h-[calc(100dvh-11rem)] lg:min-h-[28rem] lg:flex-row">
        <aside
          className="flex min-h-0 w-full flex-col border-b lg:w-(--instructions-tree-width) lg:shrink-0 lg:border-b-0"
          style={
            {
              "--instructions-tree-width": `${displayedWidthPx}px`,
            } as CSSProperties
          }
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5">
            <span className="font-medium text-muted-foreground text-xs">
              {t("workspace.files")}
            </span>
            <Button
              aria-label={t("instructions.newFileTitle")}
              className="size-7"
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
                selectedKey={selectedKey}
              />
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
          {selectedDocument ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1.5">
                <code className="min-w-0 truncate font-mono text-muted-foreground text-xs">
                  {selectedDocument.filename}
                </code>
                <InstructionModeToggle
                  mode={editorMode}
                  onModeChange={setEditorMode}
                  t={t}
                />
                <div className="min-w-0 flex-1" />
                <Badge className="h-5 px-1.5 text-[10px]" variant="secondary">
                  {t("instructions.layerBase")}
                </Badge>
                {tenantOverrideActive ? (
                  <Badge className="h-5 px-1.5 text-[10px]">
                    {t("instructions.layerTenant")}
                  </Badge>
                ) : null}
                {userOverrideActive ? (
                  <Badge className="h-5 px-1.5 text-[10px]">
                    {t("instructions.layerUser")}
                  </Badge>
                ) : null}
                <div className="flex rounded-md border bg-muted/20 p-0.5">
                  <Button
                    className="h-7 px-2 text-xs"
                    onClick={() => setScope("tenant")}
                    size="sm"
                    type="button"
                    variant={scope === "tenant" ? "secondary" : "ghost"}
                  >
                    {t("instructions.scopeTenant")}
                  </Button>
                  <Button
                    className="h-7 px-2 text-xs"
                    onClick={() => setScope("user")}
                    size="sm"
                    type="button"
                    variant={scope === "user" ? "secondary" : "ghost"}
                  >
                    {t("instructions.scopeUser")}
                  </Button>
                </div>
                <Sheet onOpenChange={setHistoryOpen} open={historyOpen}>
                  <SheetTrigger asChild>
                    <Button
                      aria-label={t("instructions.historyTitle")}
                      className="size-7"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <History className="size-3.5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="flex w-full flex-col sm:max-w-md">
                    <SheetHeader>
                      <SheetTitle>{t("instructions.historyTitle")}</SheetTitle>
                      <SheetDescription>
                        {t("instructions.historyDescription")}
                      </SheetDescription>
                    </SheetHeader>
                    <div className="flex items-center justify-end px-4">
                      <InstructionVersionDialog
                        disabled={!isDirty || isBusy}
                        isSubmitting={isSaving}
                        onConfirm={onCreateVersion}
                        t={t}
                      />
                    </div>
                    <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
                      {history.length ? (
                        <div className="space-y-2">
                          {history.map((change) => (
                            <div
                              className="rounded-md border p-3"
                              key={change.id}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="font-medium text-sm">
                                    {change.created_at}
                                  </p>
                                  <p className="text-muted-foreground text-xs">
                                    {change.change_reason ||
                                      t("instructions.noReason")}
                                  </p>
                                </div>
                                <Button
                                  disabled={!change.previous_body || isBusy}
                                  onClick={() => onRollback(change.id)}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  <RotateCcw className="size-3.5" />
                                  {t("instructions.rollback")}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          {t("instructions.noHistory")}
                        </p>
                      )}
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
                <Button
                  disabled={!canReset || isBusy}
                  onClick={onReset}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw className="size-3.5" />
                  {t("actions.reset")}
                </Button>
                <Button
                  disabled={!isDirty || isBusy}
                  onClick={onSave}
                  size="sm"
                  type="button"
                >
                  <Save className="size-3.5" />
                  {isSaving ? t("actions.saving") : t("actions.save")}
                </Button>
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
    </div>
  );
}
