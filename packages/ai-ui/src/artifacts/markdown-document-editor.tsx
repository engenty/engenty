/**
 * Notion-like markdown page: large inline title + TipTap RichEditor.
 *
 * Lifted from the knowledge-base article chrome (title typography, centered
 * column, slash commands) so Space Artifacts can edit markdown without the
 * KB module being mounted. Toolbar stays off — edit uses slash + block
 * handles, matching the KB article editor. Default body size is Normal
 * (TipTap package); Large / Reader enlarge via `readingStyle`.
 *
 * Normal / Large fill the pane with `--card`. Reader paints the shell the
 * same cream paper Knowledge Base uses.
 */
import { RichEditor } from "@engenty/tiptap-editor/rich";
import "@engenty/tiptap-editor/styles.css";
import { cn } from "@engenty/ui-core";
import type { ReactNode } from "react";
import "./markdown-document-editor.css";
import {
  type MarkdownReadingStyle,
  markdownDocumentColumnClassName,
  markdownReadingWrapClassName,
  useMarkdownReaderPaperSurface,
} from "./markdown-reading-style.js";

const TITLE_CLASS =
  "w-full min-w-0 border-0 bg-transparent p-0 font-heading font-medium text-[28px] leading-9 tracking-tight shadow-none outline-none ring-0 placeholder:text-muted-foreground focus:ring-0";

export function MarkdownDocumentEditor({
  editable = false,
  markdown,
  onChange,
  onTitleChange,
  placeholder,
  properties,
  readingStyle = "normal",
  title,
  titlePlaceholder = "Untitled",
}: {
  editable?: boolean;
  markdown: string;
  onChange?: (markdown: string) => void;
  onTitleChange?: (title: string) => void;
  placeholder?: string;
  /** Notion-style metadata rows under the title (last edited, type, …). */
  properties?: ReactNode;
  readingStyle?: MarkdownReadingStyle;
  title: string;
  titlePlaceholder?: string;
}) {
  const reader = readingStyle === "tone";
  useMarkdownReaderPaperSurface(reader);
  const titleClassName = cn(TITLE_CLASS, reader && "!font-serif");

  return (
    <div
      className={cn(
        "markdown-document-editor mx-auto w-full space-y-6 p-2",
        markdownDocumentColumnClassName(readingStyle),
        reader
          ? [
              "pt-10 pb-2 sm:pt-14 sm:pb-4",
              "text-stone-900 dark:text-stone-100",
              "[&_.text-muted-foreground]:text-stone-600 dark:[&_.text-muted-foreground]:text-stone-400",
            ].join(" ")
          : null,
        markdownReadingWrapClassName(readingStyle)
      )}
      data-reading-style={readingStyle}
    >
      {editable && onTitleChange ? (
        <input
          className={titleClassName}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={titlePlaceholder}
          value={title}
        />
      ) : (
        <h1 className={cn(titleClassName, "cursor-default")}>{title}</h1>
      )}
      {properties}
      <RichEditor
        editable={editable}
        markdown={markdown}
        onChange={
          onChange ? (_json, nextMarkdown) => onChange(nextMarkdown) : undefined
        }
        placeholder={placeholder}
        showBlockChrome={editable}
        showToolbar={false}
      />
    </div>
  );
}
