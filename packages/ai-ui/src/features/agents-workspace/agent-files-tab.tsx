import { cn, Tabs, TabsList, TabsTrigger } from "@engenty/ui-core";
import { useState } from "react";
import type {
  AiInstructionChange,
  AiInstructionFileDocument,
  InstructionEditScope,
} from "../../lib/admin/instruction-settings-api";
import { InstructionEditorPanel } from "./instruction-editor-panel";
import type { InstructionEditorMode } from "./instruction-markdown-editor";
import { SkillDetailFileChooser } from "./skill-detail-file-chooser";
import type { SkillDetailFileEntry } from "./skill-detail-file-entries";
import { useSkillDetailStickyToolbar } from "./use-skill-detail-sticky-toolbar";

interface AgentFilesTabProps {
  canReset: boolean;
  editorBody: string;
  errorMessage: string | null;
  files: AiInstructionFileDocument[];
  history: AiInstructionChange[];
  isBusy: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onChangeBody: (value: string) => void;
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
  editorBody,
  errorMessage,
  files,
  history,
  isBusy,
  isDirty,
  isSaving,
  onChangeBody,
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
  const [mode, setMode] = useState<InstructionEditorMode>("wysiwyg");
  const toolbarLayoutKey = `${selectedKey}-${files.length}`;
  const {
    pinned,
    placeholderHeight,
    scrollRef,
    sentinelRef,
    toolbarRef,
    toolbarStyle,
  } = useSkillDetailStickyToolbar(toolbarLayoutKey);
  const fileEntries: SkillDetailFileEntry[] = files.map((document) => ({
    label: document.filename,
    path: document.document_key,
  }));
  return (
    <Tabs
      className="min-h-0 flex-1 overflow-hidden"
      onValueChange={(value) =>
        setMode(value === "source" ? "source" : "wysiwyg")
      }
      value={mode}
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        ref={scrollRef}
      >
        <div className="h-px shrink-0" ref={sentinelRef} />
        {pinned ? (
          <div
            aria-hidden
            className="shrink-0"
            style={{ height: placeholderHeight }}
          />
        ) : null}
        <div
          className={cn(
            "shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85",
            pinned ? "shadow-sm" : ""
          )}
          ref={toolbarRef}
          style={toolbarStyle}
        >
          <div className="flex items-end justify-between gap-4 px-4 py-2 md:px-5">
            <SkillDetailFileChooser
              chooseFileAriaLabel={t("workspace.fileChooserAriaLabel")}
              className="min-w-0 flex-1"
              files={fileEntries}
              onSelectFile={onSelectFile}
              selectedFile={selectedDocument?.document_key ?? selectedKey}
              selectedLabel={selectedDocument?.filename ?? selectedKey}
            />
            <TabsList
              className="-mb-px h-9 w-fit border-0 bg-transparent p-0"
              variant="line"
            >
              <TabsTrigger className="flex-none" value="wysiwyg">
                {t("instructions.modeWysiwyg")}
              </TabsTrigger>
              <TabsTrigger className="flex-none" value="source">
                {t("instructions.modeSource")}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-page">
          <InstructionEditorPanel
            canReset={canReset}
            editorBody={editorBody}
            errorMessage={errorMessage}
            history={history}
            isBusy={isBusy}
            isDirty={isDirty}
            isSaving={isSaving}
            mode={mode}
            onChangeBody={onChangeBody}
            onCreateVersion={onCreateVersion}
            onReset={onReset}
            onRollback={onRollback}
            onSave={onSave}
            scope={scope}
            selectedDocument={selectedDocument}
            setScope={setScope}
            t={t}
            tenantOverrideActive={tenantOverrideActive}
            userOverrideActive={userOverrideActive}
          />
        </div>
      </div>
    </Tabs>
  );
}
