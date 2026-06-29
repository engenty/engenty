import { Button } from "@engenty/ui-core";
import Editor from "@monaco-editor/react";
import { RotateCcw, Search } from "lucide-react";
import { useRef } from "react";

interface SkillSourceEditorProps {
  disabled?: boolean;
  formatLabel: string;
  onChange: (value: string) => void;
  searchLabel: string;
  value: string;
}

export function SkillSourceEditor({
  disabled = false,
  formatLabel,
  onChange,
  searchLabel,
  value,
}: SkillSourceEditorProps) {
  const editorRef = useRef<{
    focus: () => void;
    getAction: (id: string) => { run: () => void } | undefined;
    getValue: () => string;
    setValue: (nextValue: string) => void;
  } | null>(null);

  return (
    <div className="flex min-h-[32rem] flex-col overflow-hidden rounded-md border bg-background">
      <div className="flex items-center gap-2 border-b px-2 py-1">
        <Button
          disabled={disabled}
          onClick={() => {
            editorRef.current?.focus();
            editorRef.current?.getAction("actions.find")?.run();
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Search className="mr-2 h-4 w-4" />
          {searchLabel}
        </Button>
        <Button
          disabled={disabled}
          onClick={() => {
            const editor = editorRef.current;
            if (!editor) {
              return;
            }
            editor.getAction("editor.action.formatDocument")?.run();
            onChange(editor.getValue());
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          {formatLabel}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language="markdown"
          onChange={(nextValue) => onChange(nextValue || "")}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
          options={{
            automaticLayout: true,
            fontSize: 13,
            lineNumbers: "on",
            matchBrackets: "always",
            minimap: { enabled: false },
            readOnly: disabled,
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: "on",
          }}
          theme="vs-dark"
          value={value}
        />
      </div>
    </div>
  );
}
