import { Label } from "@engenty/ui-core";
import Editor from "@monaco-editor/react";

interface ActionJsonEditorProps {
  description?: string;
  error?: string | null;
  label: string;
  onChange: (value: string) => void;
  value: string;
}

export function ActionJsonEditor({
  description,
  error,
  label,
  onChange,
  value,
}: ActionJsonEditorProps) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="min-h-[14rem] overflow-hidden rounded-md border bg-background">
        <Editor
          height="14rem"
          language="json"
          onChange={(nextValue) => onChange(nextValue || "")}
          options={{
            automaticLayout: true,
            fontSize: 13,
            lineNumbers: "on",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: "on",
          }}
          theme="vs-dark"
          value={value}
        />
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      {description ? (
        <p className="text-muted-foreground text-xs">{description}</p>
      ) : null}
    </div>
  );
}
