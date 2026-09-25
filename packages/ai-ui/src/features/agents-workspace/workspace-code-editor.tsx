// Monaco editor for workspace files — line numbers + light/dark via document
// `.dark` class (same approach as SkillFileCodeView).

import Editor, { type OnMount } from "@monaco-editor/react";
import { useDocumentDarkClass } from "../../lib/use-document-dark-class.js";

function languageFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) {
    return "markdown";
  }
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    return "yaml";
  }
  if (lower.endsWith(".json")) {
    return "json";
  }
  if (
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".mts") ||
    lower.endsWith(".cts")
  ) {
    return "typescript";
  }
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".mjs")
  ) {
    return "javascript";
  }
  if (lower.endsWith(".css")) {
    return "css";
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return "html";
  }
  if (lower.endsWith(".sh") || lower.endsWith(".bash")) {
    return "shell";
  }
  if (lower.endsWith(".py")) {
    return "python";
  }
  return "plaintext";
}

export interface WorkspaceCodeEditorProps {
  filePath: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  value: string;
}

export function WorkspaceCodeEditor({
  filePath,
  onChange,
  readOnly = false,
  value,
}: WorkspaceCodeEditorProps) {
  const isDark = useDocumentDarkClass();
  const language = languageFromPath(filePath);

  const handleMount: OnMount = (editor) => {
    editor.updateOptions({
      // Keep gutter compact for the split pane.
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: true,
      padding: { top: 8, bottom: 8 },
    });
  };

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <Editor
        height="100%"
        language={language}
        onChange={(next) => onChange(next ?? "")}
        onMount={handleMount}
        options={{
          automaticLayout: true,
          fontSize: 13,
          lineNumbers: "on",
          matchBrackets: "always",
          minimap: { enabled: false },
          readOnly,
          renderLineHighlight: readOnly ? "none" : "line",
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: "on",
          // Read-only mounts: no cursors / selection chrome noise.
          domReadOnly: readOnly,
          cursorStyle: readOnly ? "underline-thin" : "line",
        }}
        theme={isDark ? "vs-dark" : "vs"}
        value={value}
      />
    </div>
  );
}
