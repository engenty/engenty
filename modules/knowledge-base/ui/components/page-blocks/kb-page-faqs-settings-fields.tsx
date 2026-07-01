/**
 * FAQs block settings fields.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Checkbox, Label, NumberStepper } from "@engenty/ui-core";
import type { ReactNode } from "react";
import type { KbPageFaqsBlock } from "../../../src/schema/types.js";

function FieldRow({
  children,
  label,
  labelFor,
}: {
  children: ReactNode;
  label: string;
  labelFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={labelFor}>{label}</Label>
      {children}
    </div>
  );
}

export interface KbPageFaqsSettingsFieldsProps {
  block: KbPageFaqsBlock;
  onChange: (updater: (prev: KbPageFaqsBlock) => KbPageFaqsBlock) => void;
}

export function KbPageFaqsSettingsFields({
  block,
  onChange,
}: KbPageFaqsSettingsFieldsProps) {
  const { t } = useTranslation("kb");

  return (
    <div className="space-y-4">
      <FieldRow label={t("page_blocks.faqs.max_items")} labelFor="faqs-max">
        <NumberStepper
          id="faqs-max"
          max={200}
          min={1}
          onChange={(v) => onChange((prev) => ({ ...prev, max_items: v }))}
          value={block.max_items}
        />
      </FieldRow>

      <div className="space-y-2">
        <Label>{t("page_blocks.faqs.display")}</Label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={block.include_drafts}
              onCheckedChange={(v) =>
                onChange((prev) => ({ ...prev, include_drafts: v === true }))
              }
            />
            {t("page_blocks.include_drafts")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={block.show_view_all_link}
              onCheckedChange={(v) =>
                onChange((prev) => ({
                  ...prev,
                  show_view_all_link: v === true,
                }))
              }
            />
            {t("page_blocks.faqs.show_view_all_link")}
          </label>
        </div>
      </div>
    </div>
  );
}
