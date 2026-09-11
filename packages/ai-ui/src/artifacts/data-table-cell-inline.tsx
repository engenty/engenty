import { type TableColumn, textColumnStyle } from "@engenty/ai-core/browser";
import { Input, Textarea } from "@engenty/ui-core";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { CellField, toCommitValue } from "./data-table-cell-editor.js";
import { TableMarkdownEditor } from "./data-table-markdown-editor.js";
import { formValueFromCell } from "./table-workspace-model.js";

const IN_FIELD =
  "h-7 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-1";

export function DataTableInlineEditor({
  column,
  onCancel,
  onCommit,
  value,
}: {
  column: TableColumn;
  onCancel: () => void;
  onCommit: (value: unknown) => void;
  value: unknown;
}) {
  const [draft, setDraft] = useState(() => formValueFromCell(column, value));
  const committed = useRef(false);

  useEffect(() => {
    committed.current = false;
    setDraft(formValueFromCell(column, value));
  }, [column, value]);

  function commit() {
    if (committed.current) {
      return;
    }
    committed.current = true;
    onCommit(toCommitValue(column, draft));
  }

  function cancel() {
    committed.current = true;
    onCancel();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
    if (event.key === "Enter" && !event.shiftKey) {
      if (
        column.type === "text" &&
        textColumnStyle(column) !== "single" &&
        !(event.metaKey || event.ctrlKey)
      ) {
        return;
      }
      event.preventDefault();
      commit();
    }
  }

  if (column.type === "text") {
    const style = textColumnStyle(column);
    const text = typeof draft === "string" ? draft : "";
    if (style === "markdown") {
      return (
        <TableMarkdownEditor
          autoFocus
          className="w-full min-w-0"
          minHeightClassName="min-h-8"
          onBlur={commit}
          onChange={setDraft}
          onCommitKey={commit}
          placeholder={column.name}
          value={text}
        />
      );
    }
    if (style === "multiline") {
      return (
        <Textarea
          autoFocus
          className="min-h-16 resize-y border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-1"
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          value={text}
        />
      );
    }
    return (
      <Input
        autoFocus
        className={IN_FIELD}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        value={text}
      />
    );
  }

  return (
    <div
      className="w-full min-w-0"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) {
          return;
        }
        commit();
      }}
      onKeyDown={onKeyDown}
    >
      <CellField column={column} onChange={setDraft} value={draft} />
    </div>
  );
}
