/** Step 2 for the "manual" kind — paste or write the text yourself. */

import { useTranslation } from "@engenty/i18n/ui";
import { Input, Label, Textarea } from "@engenty/ui-core";
import { WizardStepHeader } from "./wizard-chrome.js";

export function WizardStepManual({
  body,
  onBodyChange,
  onTitleChange,
  title,
}: {
  body: string;
  onBodyChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  title: string;
}) {
  const { t } = useTranslation("kb");
  return (
    <div className="flex flex-col gap-4">
      <WizardStepHeader
        description={t("sources.wizard_manual_desc")}
        title={t("sources.wizard_manual_title")}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="kb-wizard-manual-title">
          {t("sources.manual_title_label")}
        </Label>
        <Input
          id="kb-wizard-manual-title"
          onChange={(event) => onTitleChange(event.target.value)}
          value={title}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="kb-wizard-manual-body">
          {t("sources.manual_body_label")}
        </Label>
        <Textarea
          className="min-h-[16rem] font-mono text-sm"
          id="kb-wizard-manual-body"
          onChange={(event) => onBodyChange(event.target.value)}
          value={body}
        />
      </div>
    </div>
  );
}
