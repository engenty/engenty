import { EditorContent, type Extensions, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

// Shared extensions configuration to prevent duplicate registration warnings
// when multiple RichTextEditor instances are rendered on the same page.
// StarterKit v3 already includes Link and Underline - configure them here
// instead of adding them separately to avoid duplicate plugin warnings.
const sharedExtensions: Extensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3, 4],
    },
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      autolink: false,
      HTMLAttributes: {
        class: "text-primary underline",
      },
    },
  }),
];

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@engenty/ui-core";
import {
  Bold,
  ChevronDown,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Strikethrough,
  Underline as UnderlineIcon,
  Unlink,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlaceholderHelperDialog } from "./shared/PlaceholderHelperDialog";
import "./RichTextEditor.css";

interface RichTextEditorProps {
  autoFocus?: boolean;
  /** Optional classes for the editor container */
  containerClassName?: string;
  content: string;
  disabled?: boolean;
  /** Hide heading options from the toolbar */
  hideHeadings?: boolean;
  onChange: (content: string) => void;
  placeholder?: string;
  /** Document type for placeholder list. Default "offer". */
  placeholderDocumentType?: "offer" | "invoice";
  /** Show placeholder helper (i) to insert document placeholders like {{recipient_company_name}} */
  placeholderHelper?: boolean;
  /** "top" = fixed toolbar above editor, "floating" = toolbar on text selection */
  toolbarVariant?: "top" | "floating";
}

export const RichTextEditor = ({
  content,
  onChange,
  placeholder,
  disabled,
  autoFocus,
  hideHeadings = false,
  containerClassName,
  placeholderHelper = false,
  placeholderDocumentType = "offer",
  toolbarVariant = "floating",
}: RichTextEditorProps) => {
  const { t } = useTranslation("offers");
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 });
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const hasAutoFocusedRef = useRef(false);
  const editor = useEditor({
    extensions: sharedExtensions,
    content,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose dark:prose-invert max-w-none focus:outline-none h-full min-h-[50px]",
      },
      handleKeyDown: (view, event) => {
        if (event.key === "Enter") {
          const { state } = view;
          const { $from } = state.selection;
          const textBefore = $from.parent.textContent;

          // Check if the line starts with markdown heading syntax
          if (textBefore.match(/^#{1,2}\s/)) {
            // Let TipTap's input rules handle this naturally
            return false;
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  useEffect(() => {
    if (editor && autoFocus && !hasAutoFocusedRef.current) {
      editor.commands.focus();
      hasAutoFocusedRef.current = true;
    }
  }, [editor, autoFocus]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateToolbar = () => {
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;

      if (hasSelection && !disabled) {
        const domSelection = window.getSelection();
        if (domSelection && domSelection.rangeCount > 0) {
          const range = domSelection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const editorRect = editorRef.current?.getBoundingClientRect();

          if (editorRect) {
            const toolbarWidth = 450;
            const toolbarHeight = 50;
            const padding = 10;

            // Calculate position relative to editor
            let top = rect.top - editorRect.top - toolbarHeight - 10;
            let left =
              rect.left - editorRect.left + rect.width / 2 - toolbarWidth / 2;

            // If toolbar goes above viewport, position it below selection
            if (top < padding) {
              top = rect.bottom - editorRect.top + 10;
            }

            // Constrain horizontal position within editor bounds
            const minLeft = padding;
            const maxLeft = editorRect.width - toolbarWidth - padding;

            if (left < minLeft) {
              left = minLeft;
            }
            if (left > maxLeft) {
              left = maxLeft;
            }

            setToolbarPosition({ top, left });
            setShowToolbar(true);
          }
        }
      } else {
        setShowToolbar(false);
      }
    };

    editor.on("selectionUpdate", updateToolbar);
    editor.on("update", updateToolbar);

    return () => {
      editor.off("selectionUpdate", updateToolbar);
      editor.off("update", updateToolbar);
    };
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    editor.on("focus", handleFocus);
    editor.on("blur", handleBlur);

    return () => {
      editor.off("focus", handleFocus);
      editor.off("blur", handleBlur);
    };
  }, [editor]);

  if (!editor) {
    return (
      <div className="rich-text-editor relative">
        <div className="relative bg-transparent">
          <div className="prose dark:prose-invert min-h-[50px] max-w-none p-4">
            <span className="text-muted-foreground/50">{placeholder}</span>
          </div>
        </div>
      </div>
    );
  }

  const handleSetLink = () => {
    const selection = savedSelectionRef.current;
    console.log("[RichTextEditor] handleSetLink called", {
      linkUrl,
      selection,
      hasEditor: !!editor,
    });

    if (linkUrl && editor && selection && selection.from !== selection.to) {
      // Ensure URL has protocol
      let url = linkUrl.trim();
      if (url && !url.match(/^https?:\/\//i) && !url.startsWith("mailto:")) {
        url = `https://${url}`;
      }
      console.log("[RichTextEditor] Applying link:", { url, selection });

      // Restore selection and apply link
      const success = editor
        .chain()
        .focus()
        .setTextSelection({ from: selection.from, to: selection.to })
        .setLink({ href: url })
        .run();

      console.log("[RichTextEditor] Link applied:", success);
    }
    setShowLinkDialog(false);
    setLinkUrl("");
    savedSelectionRef.current = null;
  };

  const handleRemoveLink = () => {
    const selection = savedSelectionRef.current;
    if (editor && selection) {
      editor.chain().focus().setTextSelection(selection).unsetLink().run();
    }
    setShowLinkDialog(false);
    setLinkUrl("");
    savedSelectionRef.current = null;
  };

  const handleOpenLinkDialog = () => {
    // Save the current selection before opening the dialog
    if (editor) {
      const { from, to } = editor.state.selection;
      savedSelectionRef.current = { from, to };
      console.log("[RichTextEditor] Saved selection:", { from, to });
    }
    const previousUrl = editor?.getAttributes("link").href || "";
    setLinkUrl(previousUrl);
    setShowLinkDialog(true);
  };

  return (
    <>
      <div
        className={cn(
          "rich-text-editor relative bg-input/30 transition-colors hover:bg-input/60",
          isFocused && "bg-input/60 ring-1 ring-ring ring-offset-0",
          containerClassName
        )}
        ref={editorRef}
      >
        {placeholderHelper && (
          <div className="absolute top-2 right-2 z-10">
            <PlaceholderHelperDialog
              documentType={placeholderDocumentType}
              onInsert={(text) => editor?.commands.insertContent(text)}
            />
          </div>
        )}
        {(toolbarVariant === "top" || showToolbar) && (
          <div
            className={cn(
              "flex items-center gap-px rounded border bg-muted/50 px-1 py-0.5",
              toolbarVariant === "top"
                ? "mb-1 border-b"
                : "absolute z-50 shadow-lg"
            )}
            onMouseDown={(e) => e.preventDefault()}
            role="toolbar"
            // Prevent mousedown from stealing focus from the editor
            style={
              toolbarVariant === "floating"
                ? {
                    top: `${toolbarPosition.top}px`,
                    left: `${toolbarPosition.left}px`,
                  }
                : undefined
            }
          >
            {!hideHeadings && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className={cn(
                        "h-7 w-7 min-w-0 shrink-0 p-0",
                        editor.isActive("heading") && "bg-muted"
                      )}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {editor.isActive("heading", { level: 1 }) ? (
                        <Heading1 className="h-3.5 w-3.5" />
                      ) : editor.isActive("heading", { level: 2 }) ? (
                        <Heading2 className="h-3.5 w-3.5" />
                      ) : editor.isActive("heading", { level: 3 }) ? (
                        <Heading3 className="h-3.5 w-3.5" />
                      ) : editor.isActive("heading", { level: 4 }) ? (
                        <Heading4 className="h-3.5 w-3.5" />
                      ) : (
                        <Heading2 className="h-3.5 w-3.5" />
                      )}
                      <ChevronDown className="ml-0.5 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-popover">
                    <DropdownMenuItem
                      onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 1 }).run()
                      }
                    >
                      <Heading1 className="mr-2 h-4 w-4" />
                      Heading 1
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 2 }).run()
                      }
                    >
                      <Heading2 className="mr-2 h-4 w-4" />
                      Heading 2
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 3 }).run()
                      }
                    >
                      <Heading3 className="mr-2 h-4 w-4" />
                      Heading 3
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 4 }).run()
                      }
                    >
                      <Heading4 className="mr-2 h-4 w-4" />
                      Heading 4
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="mx-0.5 h-4 w-px bg-border" />
              </>
            )}
            <Button
              className={cn(
                "h-7 w-7 min-w-0 shrink-0 p-0",
                editor.isActive("bold") && "bg-muted"
              )}
              onClick={() => editor.chain().focus().toggleBold().run()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button
              className={cn(
                "h-7 w-7 min-w-0 shrink-0 p-0",
                editor.isActive("italic") && "bg-muted"
              )}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Italic className="h-3.5 w-3.5" />
            </Button>
            <Button
              className={cn(
                "h-7 w-7 min-w-0 shrink-0 p-0",
                editor.isActive("underline") && "bg-muted"
              )}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <UnderlineIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              className={cn(
                "h-7 w-7 min-w-0 shrink-0 p-0",
                editor.isActive("strike") && "bg-muted"
              )}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Strikethrough className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <Button
              className={cn(
                "h-7 w-7 min-w-0 shrink-0 p-0",
                editor.isActive("bulletList") && "bg-muted"
              )}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button
              className={cn(
                "h-7 w-7 min-w-0 shrink-0 p-0",
                editor.isActive("orderedList") && "bg-muted"
              )}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <Button
              className={cn(
                "h-7 w-7 min-w-0 shrink-0 p-0",
                editor.isActive("link") && "bg-muted"
              )}
              onClick={handleOpenLinkDialog}
              size="sm"
              type="button"
              variant="ghost"
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </Button>
            {editor.isActive("link") && (
              <Button
                className="h-7 w-7 min-w-0 shrink-0 p-0"
                onClick={handleRemoveLink}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Unlink className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
        <div className="relative bg-transparent">
          <EditorContent editor={editor} />
          {!content && (
            <div className="pointer-events-none absolute top-0 left-0 text-muted-foreground/50">
              {placeholder}
            </div>
          )}
        </div>
      </div>

      <Dialog
        onOpenChange={(open) => {
          setShowLinkDialog(open);
          if (!open) {
            savedSelectionRef.current = null;
            setLinkUrl("");
          }
        }}
        open={showLinkDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor?.isActive("link") ? "Edit Link" : "Add Link"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                autoFocus
                id="link-url"
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSetLink();
                  }
                }}
                placeholder={t("offers.linkPlaceholder")}
                value={linkUrl}
              />
            </div>
          </div>
          <DialogFooter>
            {editor?.isActive("link") && (
              <Button
                onClick={handleRemoveLink}
                type="button"
                variant="destructive"
              >
                Remove Link
              </Button>
            )}
            <Button
              onClick={() => {
                setShowLinkDialog(false);
                savedSelectionRef.current = null;
                setLinkUrl("");
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleSetLink} type="button">
              {editor?.isActive("link") ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
