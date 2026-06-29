import { useTranslation } from "@engenty/i18n/ui";
import { useEffect, useRef } from "react";
import { type CommercialBlock as OfferBlock, stripHtmlTags } from "../../types";
import { EditableContent } from "../shared/EditableContent";

interface TextBlockProps {
  block: OfferBlock;
  documentStatus: string;
  documentType?: "offer" | "invoice";
  editingBlockId: string | null;
  index: number;
  isReadOnly: boolean;
  onDelete?: (index: number) => void;
  onEdit: (index: number, content: any) => void;
  onSetEditingBlockId: (id: string | null) => void;
}

export const TextBlock = ({
  block,
  index,
  isReadOnly,
  documentStatus,
  documentType = "offer",
  editingBlockId,
  onDelete,
  onEdit,
  onSetEditingBlockId,
}: TextBlockProps) => {
  const { t } = useTranslation("offers");
  const isEditing = editingBlockId === block.id && documentStatus === "draft";
  const pfx = documentType === "invoice" ? "invoices" : "offers";
  const hasContent =
    stripHtmlTags(block.content.content || "").trim().length > 0;
  const wasEditingRef = useRef(isEditing);

  useEffect(() => {
    const wasEditing = wasEditingRef.current;
    const endedEditing = wasEditing && !isEditing;
    // If a standalone text block is left empty after editing, remove it.
    if (endedEditing && !isReadOnly && !hasContent) {
      onDelete?.(index);
    }
    wasEditingRef.current = isEditing;
  }, [hasContent, index, isEditing, isReadOnly, onDelete]);

  return (
    <div className="my-3">
      <EditableContent
        allowedFormats={{
          bold: true,
          italic: true,
          underline: true,
          strikethrough: true,
          headings: false,
          lists: true,
          links: true,
        }}
        autoFocus={isEditing}
        content={block.content.content || ""}
        disabled={isReadOnly || !isEditing}
        editorContainerClassName="w-full max-w-none prose [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:my-2 [&>ol]:my-2 [&>ul>li]:my-1 [&>ol>li]:my-1"
        hideHeadings
        isPreview={isReadOnly || !isEditing}
        onChange={(content) => onEdit(index, { content })}
        onPreviewClick={() => !isReadOnly && onSetEditingBlockId(block.id)}
        placeholder={t(`${pfx}.writeContent`)}
        previewClassName="prose max-w-none text-foreground [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:my-2 [&>ol]:my-2 [&>ul>li]:my-1 [&>ol>li]:my-1"
      />
    </div>
  );
};
