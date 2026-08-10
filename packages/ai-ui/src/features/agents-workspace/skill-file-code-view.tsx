// Ambient declarations for react-syntax-highlighter's untyped subpaths only
// enter a compilation via this reference (types -> src consumers included).
/// <reference path="./react-syntax-highlighter.d.ts" />
import { cn } from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";

SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("typescript", typescript);

function syntaxLanguageFromPath(path: string): string {
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
  return "markdown";
}

function useDocumentDarkClass() {
  const [isDark, setIsDark] = useState(() =>
    typeof document === "undefined"
      ? false
      : document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export interface SkillFileCodeViewProps {
  className?: string;
  content: string;
  filePath: string;
}

/**
 * Read-only highlighted source for skill files (no border; height follows content).
 */
export function SkillFileCodeView({
  className,
  content,
  filePath,
}: SkillFileCodeViewProps) {
  const isDark = useDocumentDarkClass();
  const language = syntaxLanguageFromPath(filePath);
  const style = isDark ? oneDark : oneLight;
  const lineNumberStyle = {
    minWidth: "2.75rem",
    paddingRight: "1rem",
    textAlign: "right" as const,
    userSelect: "none" as const,
    color: isDark ? "hsl(215 14% 55%)" : "hsl(215 16% 47%)",
    fontSize: "12px",
  };

  return (
    <div className={cn("min-h-0 w-full", className)}>
      <SyntaxHighlighter
        codeTagProps={{
          className: "font-mono text-[13px] leading-relaxed",
        }}
        customStyle={{
          margin: 0,
          padding: "0.75rem 0",
          border: "none",
          borderRadius: 0,
          background: "transparent",
        }}
        language={language}
        lineNumberStyle={lineNumberStyle}
        PreTag="div"
        showLineNumbers
        style={style}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  );
}
