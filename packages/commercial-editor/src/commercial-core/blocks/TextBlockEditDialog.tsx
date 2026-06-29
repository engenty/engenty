import { useTranslation } from "@engenty/i18n/ui";
import { Label } from "@engenty/ui-core";
import { useEffect, useState } from "react";
import type { CommercialBlock as OfferBlock } from "../../types";
import { RichTextEditor } from "../RichTextEditor";
import { EditDialog } from "../shared/EditDialog";
import { PlaceholderHelperDialog } from "../shared/PlaceholderHelperDialog";

interface TextBlockEditDialogProps {
  block: OfferBlock | null;
  documentType?: "offer" | "invoice";
  onOpenChange: (open: boolean) => void;
  onSave: (content: Record<string, unknown>) => void;
  open: boolean;
}

export const TextBlockEditDialog = ({
  block,
  documentType = "offer",
  open,
  onOpenChange,
  onSave,
}: TextBlockEditDialogProps) => {
  const { t } = useTranslation("offers");
  const pfx = documentType === "invoice" ? "invoices" : "offers";
  const [content, setContent] = useState("");

  useEffect(() => {
    if (block?.content && open) {
      setContent(String(block.content.content ?? ""));
    }
  }, [block, open]);

  const handleSave = () => {
    if (!block) {
      return;
    }
    onSave({ content });
    onOpenChange(false);
  };

  if (!block) {
    return null;
  }

  return (
    <EditDialog
      contentClassName="gap-3"
      onOpenChange={onOpenChange}
      onSave={handleSave}
      open={open}
      title={t("common.edit")}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="text-block-content">{t(`${pfx}.writeContent`)}</Label>
        <div className="min-h-[160px] w-full overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <RichTextEditor
            containerClassName="min-h-[160px] rounded-none border-0 focus-within:ring-0"
            content={content}
            hideHeadings
            onChange={setContent}
            placeholder={t(`${pfx}.writeContent`)}
            placeholderHelper
            toolbarVariant="top"
          />
        </div>
        <PlaceholderHelperDialog variant="expandable" />
      </div>
    </EditDialog>
  );
};
