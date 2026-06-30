import { useTranslation } from "@engenty/i18n/ui";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { Calendar } from "lucide-react";

interface ProjectDatesRowProps {
  endDate: string | null;
  locale?: string;
  startDate: string | null;
}

export function ProjectDatesRow({
  startDate,
  endDate,
  locale,
}: ProjectDatesRowProps) {
  const { t } = useTranslation("projects");
  const dateLocale = locale?.startsWith("de") ? de : enUS;

  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Calendar className="h-4 w-4 shrink-0" />
      <span>
        {startDate
          ? format(new Date(startDate), "PPP", { locale: dateLocale })
          : "—"}
        {startDate && endDate && " – "}
        {endDate ? (
          <span className="font-medium text-destructive">
            {t("detail.dueDate")}:{" "}
            {format(new Date(endDate), "PPP", { locale: dateLocale })}
          </span>
        ) : null}
      </span>
    </div>
  );
}
