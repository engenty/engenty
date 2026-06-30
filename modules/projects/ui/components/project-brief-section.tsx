import { useTranslation } from "@engenty/i18n/ui";
import { InlineEditableRichText } from "@engenty/tiptap-editor";

interface ProjectBriefSectionProps {
  briefing: string | null;
  disabled?: boolean;
  onSave: (html: string | null) => void | Promise<void>;
}

export function ProjectBriefSection({
  briefing,
  disabled = false,
  onSave,
}: ProjectBriefSectionProps) {
  const { t } = useTranslation("projects");

  return (
    <InlineEditableRichText
      className="min-w-0"
      content={briefing ?? ""}
      disabled={disabled}
      filledPreviewEditLabel={t("detail.briefing.editAria")}
      onSave={(html: string) =>
        void onSave(html.trim() === "" || html === "<p></p>" ? null : html)
      }
      placeholder={t("detail.briefing.placeholderIntro")}
      readOnlyFilledPreview
      toolbarVariant="floating"
    />
  );
}
