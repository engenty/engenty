// Markdown body editor for instruction files — WYSIWYG (TipTap) or source (Monaco).

import { RichEditor } from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import { Button } from "@engenty/ui-core";
import { useMemo } from "react";
import type { InstructionEditorMode } from "./instruction-markdown-editor";
import { WorkspaceCodeEditor } from "./workspace-code-editor";

export function InstructionModeToggle({
  mode,
  onModeChange,
  t,
}: {
  mode: InstructionEditorMode;
  onModeChange: (mode: InstructionEditorMode) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex rounded-md border bg-muted/20 p-0.5">
      <Button
        className="h-7 px-2 text-xs"
        onClick={() => onModeChange("wysiwyg")}
        size="sm"
        type="button"
        variant={mode === "wysiwyg" ? "secondary" : "ghost"}
      >
        {t("instructions.modeWysiwyg")}
      </Button>
      <Button
        className="h-7 px-2 text-xs"
        onClick={() => onModeChange("source")}
        size="sm"
        type="button"
        variant={mode === "source" ? "secondary" : "ghost"}
      >
        {t("instructions.modeSource")}
      </Button>
    </div>
  );
}

interface InstructionBodyEditorProps {
  editorBody: string;
  filePath: string;
  isBusy: boolean;
  mode: InstructionEditorMode;
  onChangeBody: (value: string) => void;
  t: (key: string) => string;
}

export function InstructionBodyEditor({
  editorBody,
  filePath,
  isBusy,
  mode,
  onChangeBody,
  t,
}: InstructionBodyEditorProps) {
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

  if (mode === "source") {
    return (
      <WorkspaceCodeEditor
        filePath={filePath}
        onChange={onChangeBody}
        readOnly={isBusy}
        value={editorBody}
      />
    );
  }

  // Reserve left space for Notion-style gutter (absolute `left: -3.375rem`
  // in tiptap-editor styles). Avoid overflow-hidden — it clips the gutter.
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="min-h-full px-[3.5rem] py-3">
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
  );
}
