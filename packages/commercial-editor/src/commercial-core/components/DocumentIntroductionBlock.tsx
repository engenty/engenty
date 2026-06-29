import { useTranslation } from "@engenty/i18n/ui";
import {
  DOCUMENT_EDITABLE_FORMATS,
  PROSE_LIST_CLASS,
} from "../constants/editableFormats";
import { EditableContent } from "../shared/EditableContent";
import { createBlurCloseHandler } from "../utils/editableBlur";

export type DocumentType = "offer" | "invoice";

interface DocumentIntroductionBlockProps {
  content: string;
  documentType: DocumentType;
  isEditing?: boolean;
  isReadOnly?: boolean;
  onChange: (content: string) => void;
  onEditingChange: (editing: boolean) => void;
  /** Resolved content for preview (placeholders replaced). Offer only. */
  resolvedContent?: string;
  /** Show placeholder helper to insert document placeholders. Offer only. */
  showPlaceholderHelper?: boolean;
}

/**
 * Shared introduction block for offer/invoice document body.
 * Click-to-edit rich text with blur handling to avoid closing when focus moves to dialogs.
 */
export const DocumentIntroductionBlock = ({
  documentType,
  content,
  onChange,
  isReadOnly = false,
  isEditing = false,
  onEditingChange,
  resolvedContent,
  showPlaceholderHelper = false,
}: DocumentIntroductionBlockProps) => {
  const { t } = useTranslation("offers");
  const placeholderKey =
    documentType === "invoice"
      ? "invoices.writeIntroduction"
      : "offers.writeIntroduction";

  const isPreview = isReadOnly || !isEditing;

  return (
    <div className="mb-8">
      <div
        onBlur={createBlurCloseHandler(() => onEditingChange(false))}
        role="group"
      >
        <EditableContent
          allowedFormats={DOCUMENT_EDITABLE_FORMATS}
          autoFocus={isEditing}
          content={content}
          disabled={isPreview}
          editorContainerClassName="bg-input/30 transition-colors hover:bg-input/60 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0"
          hideHeadings
          isPreview={isPreview}
          onChange={onChange}
          onPreviewClick={() => !isReadOnly && onEditingChange(true)}
          placeholder={t(placeholderKey)}
          placeholderDocumentType={documentType}
          previewClassName={PROSE_LIST_CLASS}
          resolvedContent={resolvedContent}
          showPlaceholderHelper={showPlaceholderHelper}
        />
      </div>
    </div>
  );
};
