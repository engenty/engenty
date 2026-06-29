import { RichEditor } from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import { Badge, Button } from "@engenty/ui-core";
import { RotateCcw, Save } from "lucide-react";
import { useMemo } from "react";
import type {
  AiInstructionChange,
  AiInstructionFileDocument,
  InstructionEditScope,
} from "../../lib/admin/instruction-settings-api";
import type { InstructionEditorMode } from "./instruction-markdown-editor";
import { InstructionVersionDialog } from "./instruction-version-dialog";
import { SkillSourceEditor } from "./skill-source-editor";

interface InstructionEditorPanelProps {
  canReset: boolean;
  editorBody: string;
  errorMessage: string | null;
  history: AiInstructionChange[];
  isBusy: boolean;
  isDirty: boolean;
  isSaving: boolean;
  mode: InstructionEditorMode;
  onChangeBody: (value: string) => void;
  onCreateVersion: (reason: string) => void;
  onReset: () => void;
  onRollback: (changeId: string) => void;
  onSave: () => void;
  scope: InstructionEditScope;
  selectedDocument: AiInstructionFileDocument | null;
  setScope: (scope: InstructionEditScope) => void;
  t: (key: string) => string;
  tenantOverrideActive: boolean;
  userOverrideActive: boolean;
}

export function InstructionEditorPanel({
  canReset,
  editorBody,
  errorMessage,
  history,
  isBusy,
  isDirty,
  isSaving,
  mode,
  onChangeBody,
  onCreateVersion,
  onReset,
  onRollback,
  onSave,
  scope,
  selectedDocument,
  setScope,
  t,
  tenantOverrideActive,
  userOverrideActive,
}: InstructionEditorPanelProps) {
  const blockMenuLabels = useMemo(
    () => ({
      searchPlaceholder: t("instructions.blockMenu.searchPlaceholder"),
      transformInto: t("instructions.blockMenu.transformInto"),
      paragraph: t("instructions.blockMenu.paragraph"),
      heading1: t("instructions.blockMenu.heading1"),
      heading2: t("instructions.blockMenu.heading2"),
      heading3: t("instructions.blockMenu.heading3"),
      bulletList: t("instructions.blockMenu.bulletList"),
      orderedList: t("instructions.blockMenu.orderedList"),
      blockquote: t("instructions.blockMenu.blockquote"),
      duplicate: t("instructions.blockMenu.duplicate"),
      deleteBlock: t("instructions.blockMenu.deleteBlock"),
      addBlock: t("instructions.blockMenu.addBlock"),
      dragHandle: t("instructions.blockMenu.dragHandle"),
    }),
    [t]
  );

  if (!selectedDocument) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-1">
          <p className="font-semibold text-base">{t("instructions.title")}</p>
          <p className="text-muted-foreground text-sm">
            {t("instructions.selectHint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-4 border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-semibold text-base">
              {selectedDocument.filename}
            </p>
            <p className="text-muted-foreground text-sm">
              {selectedDocument.owner_id} · {selectedDocument.document_key}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border bg-muted/20 p-1">
              <Button
                onClick={() => setScope("tenant")}
                size="sm"
                type="button"
                variant={scope === "tenant" ? "secondary" : "ghost"}
              >
                {t("instructions.scopeTenant")}
              </Button>
              <Button
                onClick={() => setScope("user")}
                size="sm"
                type="button"
                variant={scope === "user" ? "secondary" : "ghost"}
              >
                {t("instructions.scopeUser")}
              </Button>
            </div>
            <Button
              disabled={!canReset || isBusy}
              onClick={onReset}
              size="sm"
              type="button"
              variant="outline"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("actions.reset")}
            </Button>
            <Button
              disabled={!isDirty || isBusy}
              onClick={onSave}
              size="sm"
              type="button"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? t("actions.saving") : t("actions.save")}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{t("instructions.layerBase")}</Badge>
          {tenantOverrideActive ? (
            <Badge>{t("instructions.layerTenant")}</Badge>
          ) : null}
          {userOverrideActive ? (
            <Badge>{t("instructions.layerUser")}</Badge>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 pt-4">
        <div className="space-y-2">
          {mode === "source" ? (
            <SkillSourceEditor
              disabled={isBusy}
              formatLabel={t("instructions.formatSource")}
              onChange={onChangeBody}
              searchLabel={t("instructions.searchSource")}
              value={editorBody}
            />
          ) : (
            // Reserve left space for Notion-style gutter (absolute `left: -3.375rem` in
            // tiptap-editor styles). Do not use overflow-hidden here — it clips the gutter.
            <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-background">
              <div className="min-h-0 flex-1 px-[3.5rem] py-2">
                <RichEditor
                  autoFocus={false}
                  blockMenuLabels={blockMenuLabels}
                  className="flex min-h-0 flex-1 flex-col"
                  editable={!isBusy}
                  editorContentClassName="min-h-[12rem] flex-1"
                  markdown={editorBody}
                  onChange={(_json, md) => onChangeBody(md)}
                  placeholder={t("instructions.editorPlaceholder")}
                  showToolbar={false}
                />
              </div>
            </div>
          )}
        </div>

        {errorMessage ? (
          <p className="text-destructive text-sm">{errorMessage}</p>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-sm">
                {t("instructions.historyTitle")}
              </p>
              <p className="text-muted-foreground text-sm">
                {t("instructions.historyDescription")}
              </p>
            </div>
            <InstructionVersionDialog
              disabled={!isDirty || isBusy}
              isSubmitting={isSaving}
              onConfirm={onCreateVersion}
              t={t}
            />
          </div>
          {history.length ? (
            <div className="space-y-2">
              {history.map((change) => (
                <div className="rounded-md border p-3" key={change.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{change.created_at}</p>
                      <p className="text-muted-foreground text-xs">
                        {change.change_reason || t("instructions.noReason")}
                      </p>
                    </div>
                    <Button
                      disabled={!change.previous_body || isBusy}
                      onClick={() => onRollback(change.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
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
        </div>
      </div>
    </div>
  );
}
