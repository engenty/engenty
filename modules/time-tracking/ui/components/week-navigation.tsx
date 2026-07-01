import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { addDays, addWeeks, subWeeks } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface WeekNavigationProps {
  currentWeek: Date;
  onWeekChange: (week: Date) => void;
}

/** Format a date range using the browser's Intl API — no manual locale mapping needed. */
function formatWeekRange(weekStart: Date, locale: string) {
  const weekEnd = addDays(weekStart, 6);
  const dayMonth = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
  });
  const dayMonthYear = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${dayMonth.format(weekStart)} – ${dayMonthYear.format(weekEnd)}`;
}

export function WeekNavigation({
  currentWeek,
  onWeekChange,
}: WeekNavigationProps) {
  const { t, i18n } = useTranslation("time-tracking");
  const weekStart = new Date(currentWeek);
  weekStart.setDate(currentWeek.getDate() - currentWeek.getDay() + 1);

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={() => onWeekChange(subWeeks(currentWeek, 1))}
        size="icon"
        variant="outline"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="font-semibold text-lg">
        {formatWeekRange(weekStart, i18n.language)}
      </div>
      <Button
        onClick={() => onWeekChange(addWeeks(currentWeek, 1))}
        size="icon"
        variant="outline"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button onClick={() => onWeekChange(new Date())} variant="outline">
        {t("today")}
      </Button>
    </div>
  );
}
