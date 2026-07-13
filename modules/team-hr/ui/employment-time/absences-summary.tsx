import { useTranslation } from "@engenty/i18n/ui";
import { Card } from "@engenty/ui-core";
import { Calendar, Clock, Heart } from "lucide-react";
import type { TimeSummary } from "../employment-time-queries.js";

interface AbsencesSummaryProps {
  loading: boolean;
  summary: TimeSummary | null;
}

export function AbsencesSummary({ summary, loading }: AbsencesSummaryProps) {
  const { t } = useTranslation("team");

  if (loading || !summary) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card className="h-32 animate-pulse bg-card/50 p-5" key={i} />
        ))}
      </div>
    );
  }

  const { vacation, absences, overtime } = summary;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Vacation Balance Card */}
      <Card className="relative overflow-hidden border-border/80 bg-card/60 p-5 shadow-sm backdrop-blur-md transition hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              {t("employmentTime.vacation")}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-3xl text-primary tracking-tight">
                {vacation.remaining}
              </span>
              <span className="font-medium text-muted-foreground text-sm">
                {t("employmentTime.days")} {t("employmentTime.remaining")}
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-500">
            <Calendar className="h-5.5 w-5.5" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-border/60 border-t pt-4 font-medium text-muted-foreground text-xs">
          <div>
            Entitlement:{" "}
            <span className="font-semibold text-foreground">
              {vacation.entitlement}d
            </span>
          </div>
          <div className="h-1.5 w-1.5 rounded-full bg-border" />
          <div>
            Carryover:{" "}
            <span className="font-semibold text-foreground">
              +{vacation.carryover}d
            </span>
          </div>
          <div className="h-1.5 w-1.5 rounded-full bg-border" />
          <div>
            Consumed:{" "}
            <span className="font-semibold text-foreground">
              {vacation.consumed}d
            </span>
          </div>
        </div>
      </Card>

      {/* Overtime Balance Card */}
      <Card className="relative overflow-hidden border-border/80 bg-card/60 p-5 shadow-sm backdrop-blur-md transition hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              {t("employmentTime.overtime")}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`font-extrabold text-3xl tracking-tight ${overtime.total_balance >= 0 ? "text-primary" : "text-destructive"}`}
              >
                {overtime.total_balance > 0
                  ? `+${overtime.total_balance}`
                  : overtime.total_balance}
              </span>
              <span className="font-medium text-muted-foreground text-sm">
                {t("employmentTime.hours")}
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-500">
            <Clock className="h-5.5 w-5.5" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-border/60 border-t pt-4 font-medium text-muted-foreground text-xs">
          <div>
            Start Balance:{" "}
            <span className="font-semibold text-foreground">
              {overtime.starting_balance}h
            </span>
          </div>
          <div className="h-1.5 w-1.5 rounded-full bg-border" />
          <div>
            Year Target:{" "}
            <span className="font-semibold text-foreground">
              {overtime.target_hours}h
            </span>
          </div>
          <div className="h-1.5 w-1.5 rounded-full bg-border" />
          <div>
            Year Actual:{" "}
            <span className="font-semibold text-foreground">
              {overtime.actual_hours}h
            </span>
          </div>
        </div>
      </Card>

      {/* Sick Leave & Absences Card */}
      <Card className="relative overflow-hidden border-border/80 bg-card/60 p-5 shadow-sm backdrop-blur-md transition hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              {t("employmentTime.sickLeave")}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-3xl text-primary tracking-tight">
                {absences.sick_leave}
              </span>
              <span className="font-medium text-muted-foreground text-sm">
                {t("employmentTime.days")} this year
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-500">
            <Heart className="h-5.5 w-5.5" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-border/60 border-t pt-4 font-medium text-muted-foreground text-xs">
          <div>
            Carer Leave:{" "}
            <span className="font-semibold text-foreground">
              {absences.carer_leave}d
            </span>
          </div>
          <div className="h-1.5 w-1.5 rounded-full bg-border" />
          <div>
            Special:{" "}
            <span className="font-semibold text-foreground">
              {absences.special_leave}d
            </span>
          </div>
          <div className="h-1.5 w-1.5 rounded-full bg-border" />
          <div>
            Unpaid:{" "}
            <span className="font-semibold text-foreground">
              {absences.unpaid_leave}d
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
