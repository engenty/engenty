import { sanitizeHtml, stripHtmlTags } from "../../types";
import { RichTextEditor } from "../RichTextEditor";

interface EditableContentProps {
  /** Allowed formatting options */
  allowedFormats?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    headings?: boolean;
    lists?: boolean;
    links?: boolean;
  };
  /** Auto focus on mount */
  autoFocus?: boolean;
  /** The current HTML content */
  content: string;
  /** Whether editing is disabled */
  disabled?: boolean;
  /** Additional CSS classes for editor container */
  editorContainerClassName?: string;
  /** Hide heading options from toolbar */
  hideHeadings?: boolean;
  /** Preview mode - shows content with same styling as editor */
  isPreview?: boolean;
  /** Callback when content changes */
  onChange: (content: string) => void;
  /** Callback when preview is clicked (to enter edit mode) */
  onPreviewClick?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Document type for placeholder list. Default "offer". */
  placeholderDocumentType?: "offer" | "invoice";
  /** Additional CSS classes for preview */
  previewClassName?: string;
  /** Resolved content for preview (placeholders replaced). When provided and isPreview, used for display. */
  resolvedContent?: string;
  /** Show placeholder helper (i) to insert document placeholders */
  showPlaceholderHelper?: boolean;
}

export const EditableContent = ({
  content,
  onChange,
  placeholder,
  resolvedContent,
  showPlaceholderHelper = false,
  placeholderDocumentType = "offer",
  disabled = false,
  autoFocus = false,
  hideHeadings = false,
  allowedFormats = {
    bold: true,
    italic: true,
    underline: true,
    strikethrough: true,
    headings: !hideHeadings,
    lists: true,
    links: true,
  },
  isPreview = false,
  onPreviewClick,
  previewClassName = "",
  editorContainerClassName = "",
}: EditableContentProps) => {
  const willAutoFocus = autoFocus;

  if (isPreview) {
    const displayContent = resolvedContent ?? content;
    const hasContent =
      displayContent && stripHtmlTags(displayContent).trim().length > 0;
    return (
      <button
        aria-label="Edit content"
        className={`rich-text-preview prose dark:prose-invert w-full max-w-none cursor-pointer bg-input/30 text-left transition-colors hover:bg-input/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 [&_*:last-child]:mb-0 [&_p:last-child]:mb-0 ${previewClassName}`}
        onMouseDown={(e) => {
          e.preventDefault();
          onPreviewClick?.();
        }}
        type="button"
      >
        <span
          className="block [&>*:last-child]:mb-0 [&>p:last-child]:mb-0"
          dangerouslySetInnerHTML={{
            __html: hasContent
              ? sanitizeHtml(displayContent)
              : `<p class='text-muted-foreground'>${placeholder || "Click to add content..."}</p>`,
          }}
        />
      </button>
    );
  }

  return (
    <RichTextEditor
      autoFocus={willAutoFocus}
      containerClassName={editorContainerClassName}
      content={content}
      disabled={disabled}
      hideHeadings={hideHeadings || !allowedFormats.headings}
      onChange={onChange}
      placeholder={placeholder}
      placeholderDocumentType={placeholderDocumentType}
      placeholderHelper={showPlaceholderHelper}
    />
  );
};
