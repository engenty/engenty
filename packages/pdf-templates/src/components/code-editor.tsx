import { Button } from "@engenty/ui-core";
import Editor from "@monaco-editor/react";
import { RotateCcw, Search } from "lucide-react";
import { useRef } from "react";

interface CodeEditorProps {
  language: "json" | "xml";
  onChange: (value: string) => void;
  readOnly?: boolean;
  value: string;
}

export function CodeEditor({
  language,
  onChange,
  readOnly = false,
  value,
}: CodeEditorProps) {
  const editorRef = useRef<{
    focus: () => void;
    getAction: (id: string) => { run: () => void } | null | undefined;
    getValue: () => string;
    setValue: (nextValue: string) => void;
  } | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1">
        <Button
          disabled={readOnly}
          onClick={() => {
            editorRef.current?.focus();
            editorRef.current?.getAction("actions.find")?.run();
          }}
          size="sm"
          variant="ghost"
        >
          <Search className="h-4 w-4" />
          Search
        </Button>
        <Button
          disabled={readOnly}
          onClick={() => {
            const editor = editorRef.current;
            if (!editor) {
              return;
            }

            if (language === "json") {
              const parsed = JSON.parse(editor.getValue() || "{}");
              const nextValue = JSON.stringify(parsed, null, 2);
              editor.setValue(nextValue);
              onChange(nextValue);
              return;
            }

            editor.getAction("editor.action.formatDocument")?.run();
          }}
          size="sm"
          variant="ghost"
        >
          <RotateCcw className="h-4 w-4" />
          Format
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language={language}
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
            readOnly,
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
