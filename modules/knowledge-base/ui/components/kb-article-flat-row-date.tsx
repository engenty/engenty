import { useTranslation } from "@engenty/i18n/ui";
import { formatKbListDate } from "../article-datetime.js";

export function KbArticleFlatRowDate({ iso }: { iso: string }) {
  const { i18n } = useTranslation("kb");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { label, title } = formatKbListDate(iso, locale);

  return (
    <time
      className="shrink-0 text-muted-foreground text-xs"
      dateTime={iso}
      title={title}
    >
      {label}
    </time>
  );
}
