import { useTranslation } from "@engenty/i18n/ui";
import { InlineEditableRichText } from "@engenty/tiptap-editor";
import { useLayoutEffect, useRef, useState } from "react";

interface ProjectBriefSectionProps {
  briefing: string | null;
  disabled?: boolean;
  onSave: (html: string | null) => void | Promise<void>;
  /** When set, overview shows a ~4-line preview and this opens the Notes tab. */
  onViewNotes?: () => void;
}

function hasBriefingText(html: string | null): boolean {
  if (!html) {
    return false;
  }
  return html.replace(/<[^>]*>?/g, "").trim().length > 0;
}

function persistBriefing(
  html: string,
  onSave: (html: string | null) => void | Promise<void>
) {
  void onSave(html.trim() === "" || html === "<p></p>" ? null : html);
}

export function ProjectBriefSection({
  briefing,
  disabled = false,
  onSave,
  onViewNotes,
}: ProjectBriefSectionProps) {
  const { t } = useTranslation("projects");
  const clipRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const hasContent = hasBriefingText(briefing);

  useLayoutEffect(() => {
    if (!(onViewNotes && hasContent)) {
      setOverflows(false);
      return;
    }
    const el = clipRef.current;
    if (!el) {
      return;
    }
    const update = () => {
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [briefing, hasContent, onViewNotes]);

  if (onViewNotes) {
    if (!hasContent) {
      return (
        <button
          className="text-primary text-sm underline underline-offset-2 hover:opacity-90"
          onClick={onViewNotes}
          type="button"
        >
          {t("detail.briefing.addNotes")}
        </button>
      );
    }

    return (
      <div className="min-w-0 space-y-1.5">
        <div
          className="relative max-h-20 overflow-hidden [&_.tiptap_ol]:my-0 [&_.tiptap_p]:my-0 [&_.tiptap_ul]:my-0"
          ref={clipRef}
        >
          <InlineEditableRichText
            className="min-w-0"
            content={briefing ?? ""}
            disabled
            placeholder={t("detail.briefing.placeholderIntro")}
            readOnlyFilledPreview
          />
          {overflows ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background to-transparent" />
          ) : null}
        </div>
        <button
          className="text-primary text-sm underline underline-offset-2 hover:opacity-90"
          onClick={onViewNotes}
          type="button"
        >
          {t("detail.briefing.viewNotes")}
        </button>
      </div>
    );
  }

  return (
    <InlineEditableRichText
      className="min-w-0"
      content={briefing ?? ""}
      disabled={disabled}
      filledPreviewEditLabel={t("detail.briefing.editAria")}
      onSave={(html: string) => persistBriefing(html, onSave)}
      placeholder={t("detail.briefing.placeholderIntro")}
      readOnlyFilledPreview
      toolbarVariant="floating"
    />
  );
}
