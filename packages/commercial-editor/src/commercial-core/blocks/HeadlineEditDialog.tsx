import { useTranslation } from "@engenty/i18n/ui";
import { Input, Label } from "@engenty/ui-core";
import { useEffect, useState } from "react";
import type { CommercialBlock as OfferBlock } from "../../types";
import { RichTextEditor } from "../RichTextEditor";
import { EditDialog } from "../shared/EditDialog";

interface HeadlineEditDialogProps {
  block: OfferBlock | null;
  documentType?: "offer" | "invoice";
  onOpenChange: (open: boolean) => void;
  onSave: (content: Record<string, unknown>) => void;
  open: boolean;
}

export const HeadlineEditDialog = ({
  block,
  documentType = "offer",
  open,
  onOpenChange,
  onSave,
}: HeadlineEditDialogProps) => {
  const { t } = useTranslation("offers");
  const pfx = documentType === "invoice" ? "invoices" : "offers";
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (block?.content && open) {
      setTitle(String(block.content.title ?? ""));
      setContent(String(block.content.content ?? ""));
    }
  }, [block, open]);

  const handleSave = () => {
    if (!block) {
      return;
    }
    onSave({
      ...block.content,
      title: title.trim(),
      content,
    });
    onOpenChange(false);
  };

  if (!block) {
    return null;
  }

  const dialogTitle = t(`${pfx}.headline`, "Headline");

  return (
    <EditDialog
      contentClassName="gap-3"
      onOpenChange={onOpenChange}
      onSave={handleSave}
      open={open}
      title={dialogTitle}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="headline-title">
          {t(`${pfx}.headline`, "Headline")}
        </Label>
        <Input
          className="h-9"
          id="headline-title"
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t(`${pfx}.headlinePlaceholder`, "Headline...")}
          value={title}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="headline-content">
          {t(`${pfx}.headlineContentPlaceholder`, "Headline content...")}
        </Label>
        <div className="min-h-[100px] w-full overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <RichTextEditor
            containerClassName="min-h-[100px] rounded-none border-0 focus-within:ring-0"
            content={content}
            hideHeadings
            onChange={setContent}
            placeholder={t(
              `${pfx}.headlineContentPlaceholder`,
              "Headline content..."
            )}
            toolbarVariant="top"
          />
        </div>
      </div>
    </EditDialog>
  );
};
