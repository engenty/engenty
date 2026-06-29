/**
 * Editor surface with optional Notion-style block gutter (+, drag, menu).
 */

import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { BlockGutter } from "./block-gutter.jsx";
import { RichInlineBubbleMenu } from "./inline-bubble-menu.jsx";
import type { InlineBubbleMenuOptions } from "./inline-bubble-types.js";

export type { BlockMenuLabels } from "./block-menu-labels.js";

export interface RichEditorContentProps {
  blockMenuLabels?: Partial<import("./block-menu-labels.js").BlockMenuLabels>;
  /** Extra class on the chrome wrapper */
  className?: string;
  editor: Editor | null;
  /** Class merged onto the ProseMirror wrapper (EditorContent) */
  editorContentClassName?: string;
  /**
   * Floating bubble for bold/italic/link etc. Pass `false` to disable.
   * Pass an object to register link search sources and custom mark buttons.
   */
  inlineBubbleMenu?: boolean | InlineBubbleMenuOptions;
  /** When false, hides + / drag / menu (still respects `editor.isEditable`) */
  showBlockChrome?: boolean;
}

export function RichEditorContent({
  editor,
  className = "",
  editorContentClassName = "",
  showBlockChrome = true,
  blockMenuLabels,
  inlineBubbleMenu,
}: RichEditorContentProps) {
  if (!editor) {
    return null;
  }

  const chrome =
    showBlockChrome !== false && editor.isEditable
      ? "tiptap-editor-chrome--with-gutter"
      : "";

  const bubble =
    inlineBubbleMenu === false
      ? null
      : editor.isEditable && (
          <RichInlineBubbleMenu editor={editor} options={inlineBubbleMenu} />
        );

  return (
    <div className={`tiptap-editor-chrome ${chrome} ${className}`.trim()}>
      {showBlockChrome !== false && editor.isEditable ? (
        <BlockGutter editor={editor} labels={blockMenuLabels} />
      ) : null}
      {bubble}
      <EditorContent
        className={`tiptap-editor-chrome-content ${editorContentClassName}`.trim()}
        editor={editor}
      />
    </div>
  );
}
