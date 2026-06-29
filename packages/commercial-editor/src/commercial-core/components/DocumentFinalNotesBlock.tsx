import { useTranslation } from "@engenty/i18n/ui";
import {
  DOCUMENT_EDITABLE_FORMATS,
  PROSE_LIST_CLASS,
} from "../constants/editableFormats";
import { EditableContent } from "../shared/EditableContent";
import { createBlurCloseHandler } from "../utils/editableBlur";
import type { DocumentType } from "./DocumentIntroductionBlock";

interface DocumentFinalNotesBlockProps {
  content: string;
  documentType: DocumentType;
  isEditing?: boolean;
  isReadOnly?: boolean;
  onChange: (content: string) => void;
  onEditingChange: (editing: boolean) => void;
  /** Resolved content for preview (placeholders replaced). Offer only. */
  resolvedContent?: string;
  /** Show top border (invoice style). Default true. */
  showBorder?: boolean;
  /** Show placeholder helper to insert document placeholders. Offer only. */
  showPlaceholderHelper?: boolean;
}

/**
 * Shared final notes block for offer/invoice document body.
 * Click-to-edit rich text with blur handling to avoid closing when focus moves to dialogs.
 */
export const DocumentFinalNotesBlock = ({
  documentType,
  content,
  onChange,
  isReadOnly = false,
  isEditing = false,
  onEditingChange,
  resolvedContent,
  showPlaceholderHelper = false,
  showBorder = true,
}: DocumentFinalNotesBlockProps) => {
  const { t } = useTranslation("offers");
  const placeholderKey =
    documentType === "invoice"
      ? "invoices.writeFinalNotes"
      : "offers.addFinalNotes";

  const isPreview = isReadOnly || !isEditing;

  return (
    <div className={showBorder ? "mt-8 border-border border-t pt-6" : "mt-8"}>
      <div
        onBlur={createBlurCloseHandler(() => onEditingChange(false))}
        role="group"
      >
        <EditableContent
          allowedFormats={DOCUMENT_EDITABLE_FORMATS}
          content={content}
          disabled={isPreview}
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
