import { useTranslation } from "@engenty/i18n/ui";
import {
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import type { CommercialBlock as OfferBlock } from "../../types";
import { RichTextEditor } from "../RichTextEditor";
import { EditDialog } from "../shared/EditDialog";

function parseDate(val: string | null | undefined): Date | null {
  if (!val) {
    return null;
  }
  try {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

function toIsoDate(d: Date | null): string | null {
  if (!d) {
    return null;
  }
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

interface HeadlineBlockSettingsDialogProps {
  block: OfferBlock | null;
  documentType?: "offer" | "invoice";
  onOpenChange: (open: boolean) => void;
  onSave: (content: Record<string, unknown>) => void;
  open: boolean;
}

export const HeadlineBlockSettingsDialog = ({
  block,
  documentType = "offer",
  open,
  onOpenChange,
  onSave,
}: HeadlineBlockSettingsDialogProps) => {
  const { t } = useTranslation("offers");
  const pfx = documentType === "invoice" ? "invoices" : "offers";
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [timeframeFrom, setTimeframeFrom] = useState<Date | null>(null);
  const [timeframeUntil, setTimeframeUntil] = useState<Date | null>(null);
  const [billingType, setBillingType] = useState<string | null>(null);

  useEffect(() => {
    if (block?.content && open) {
      setTitle(String(block.content.title ?? ""));
      setContent(String(block.content.content ?? ""));
      setTimeframeFrom(parseDate(block.content.timeframe_from));
      setTimeframeUntil(parseDate(block.content.timeframe_until));
      setBillingType(block.content.billing_type ?? null);
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
      timeframe_from: toIsoDate(timeframeFrom),
      timeframe_until: toIsoDate(timeframeUntil),
      billing_type: billingType || null,
    });
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
      title={t(`${pfx}.phase`)}
    >
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t(`${pfx}.sectionContents`)}
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="phase-title">{t(`${pfx}.headline`, "Headline")}</Label>
        <Input
          className="h-9"
          id="phase-title"
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t(`${pfx}.phaseTitle`)}
          value={title}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="phase-content">
          {t(`${pfx}.headlineContentPlaceholder`, "Headline content...")}
        </Label>
        <div className="min-h-[100px] w-full overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <RichTextEditor
            containerClassName="min-h-[100px] rounded-none border-0 focus-within:ring-0"
            content={content}
            hideHeadings
            onChange={setContent}
            placeholder={t(`${pfx}.phaseContent`, "Phase description...")}
            toolbarVariant="top"
          />
        </div>
      </div>
      <p className="pt-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t(`${pfx}.sectionSettings`)}
      </p>
      <div className="flex items-center gap-x-3">
        <Label className="w-40 shrink-0 text-sm" htmlFor="phase-timeframe-from">
          {t(`${pfx}.settings.timeframeFrom`, "Start Date")}
        </Label>
        <div className="min-w-0 flex-1">
          <DatePicker
            className="w-full"
            onChange={(value) => setTimeframeFrom(parseDate(value))}
            placeholder={t(`${pfx}.settings.pickDate`, "Pick date")}
            value={toIsoDate(timeframeFrom)}
          />
        </div>
      </div>
      <div className="flex items-center gap-x-3">
        <Label
          className="w-40 shrink-0 text-sm"
          htmlFor="phase-timeframe-until"
        >
          {t(`${pfx}.settings.timeframeUntil`, "End Date")}
        </Label>
        <div className="min-w-0 flex-1">
          <DatePicker
            className="w-full"
            onChange={(value) => setTimeframeUntil(parseDate(value))}
            placeholder={t(`${pfx}.settings.pickDate`, "Pick date")}
            value={toIsoDate(timeframeUntil)}
          />
        </div>
      </div>
      <div className="flex items-center gap-x-3">
        <Label className="w-40 shrink-0 text-sm" htmlFor="phase-billing-type">
          {t(`${pfx}.settings.billingType`)}
        </Label>
        <div className="min-w-0 flex-1">
          <Select
            onValueChange={(v) => setBillingType(v || null)}
            value={billingType ?? ""}
          >
            <SelectTrigger className="h-9 w-full" id="phase-billing-type">
              <SelectValue
                placeholder={t(`${pfx}.settings.billingTypePlaceholder`)}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed_price">
                {t(`${pfx}.settings.billingTypeFixed`)}
              </SelectItem>
              <SelectItem value="time_and_materials">
                {t(`${pfx}.settings.billingTypeTime`)}
              </SelectItem>
              <SelectItem value="retainer">
                {t(`${pfx}.settings.billingTypeRetainer`)}
              </SelectItem>
              <SelectItem value="recurring">
                {t(`${pfx}.settings.billingTypeRecurring`)}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </EditDialog>
  );
};
