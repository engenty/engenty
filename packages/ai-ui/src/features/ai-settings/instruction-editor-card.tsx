import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@engenty/ui-core";
import { RotateCcw, Save } from "lucide-react";
import { MessageResponse } from "../../components/presentation.js";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../lib/admin/compact-markdown-prose-classname";
import type {
  AiInstructionChange,
  AiInstructionFileDocument,
  InstructionEditScope,
} from "../../lib/admin/instruction-settings-api";

interface InstructionEditorCardProps {
  canReset: boolean;
  editorBody: string;
  errorMessage: string | null;
  history: AiInstructionChange[];
  isBusy: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onChangeBody: (value: string) => void;
  onChangeReason: (value: string) => void;
  onReset: () => void;
  onRollback: (changeId: string) => void;
  onSave: () => void;
  reason: string;
  resolvedBody: string;
  scope: InstructionEditScope;
  selectedDocument: AiInstructionFileDocument | null;
  setScope: (scope: InstructionEditScope) => void;
  t: (key: string) => string;
  tenantOverrideActive: boolean;
  userOverrideActive: boolean;
}

export function InstructionEditorCard({
  canReset,
  editorBody,
  errorMessage,
  history,
  isBusy,
  isDirty,
  isSaving,
  onChangeBody,
  onChangeReason,
  onReset,
  onRollback,
  onSave,
  reason,
  resolvedBody,
  scope,
  selectedDocument,
  setScope,
  t,
  tenantOverrideActive,
  userOverrideActive,
}: InstructionEditorCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>
              {selectedDocument?.filename ?? t("instructions.title")}
            </CardTitle>
            <CardDescription>
              {selectedDocument
                ? `${selectedDocument.owner_id} · ${selectedDocument.document_key}`
                : t("instructions.selectHint")}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              onValueChange={(value) => {
                if (value === "tenant" || value === "user") {
                  setScope(value);
                }
              }}
              value={scope}
            >
              <TabsList>
                <TabsTrigger value="tenant">
                  {t("instructions.scopeTenant")}
                </TabsTrigger>
                <TabsTrigger value="user">
                  {t("instructions.scopeUser")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              disabled={!canReset || isBusy}
              onClick={onReset}
              size="sm"
              variant="outline"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("actions.reset")}
            </Button>
            <Button
              disabled={!isDirty || isBusy || !selectedDocument}
              onClick={onSave}
              size="sm"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? t("actions.saving") : t("actions.save")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{t("instructions.layerBase")}</Badge>
          {tenantOverrideActive ? (
            <Badge>{t("instructions.layerTenant")}</Badge>
          ) : null}
          {userOverrideActive ? (
            <Badge>{t("instructions.layerUser")}</Badge>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="font-medium text-sm">
              {t("instructions.effectivePreview")}
            </p>
            <div className="rounded-md border bg-muted/30 p-3">
              {resolvedBody.trim() ? (
                <MessageResponse className={COMPACT_MARKDOWN_PROSE_CLASSNAME}>
                  {resolvedBody}
                </MessageResponse>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t("instructions.noResolvedBody")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label
              className="font-medium text-sm"
              htmlFor="ai-instruction-reason"
            >
              {t("instructions.reasonLabel")}
            </label>
            <Input
              id="ai-instruction-reason"
              onChange={(event) => onChangeReason(event.target.value)}
              placeholder={t("instructions.reasonPlaceholder")}
              value={reason}
            />
            <p className="text-muted-foreground text-xs">
              {t("instructions.overlayHint")}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label
            className="font-medium text-sm"
            htmlFor="ai-instruction-editor"
          >
            {t("instructions.editorLabel")}
          </label>
          <Textarea
            className="min-h-88 font-mono text-sm"
            id="ai-instruction-editor"
            onChange={(event) => onChangeBody(event.target.value)}
            value={editorBody}
          />
        </div>

        {errorMessage ? (
          <p className="text-destructive text-sm">{errorMessage}</p>
        ) : null}

        <div className="space-y-3">
          <div>
            <p className="font-medium text-sm">
              {t("instructions.historyTitle")}
            </p>
            <p className="text-muted-foreground text-sm">
              {t("instructions.historyDescription")}
            </p>
          </div>
          {history.length ? (
            history.map((change) => (
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
                    variant="outline"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("instructions.rollback")}
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("instructions.noHistory")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
