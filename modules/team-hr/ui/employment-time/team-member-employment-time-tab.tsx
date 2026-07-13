import { useTranslation } from "@engenty/i18n/ui";
import type { TeamMemberListItem } from "@engenty/team/ui";
import { useMemo, useState } from "react";
import { useEmployeeQuery } from "../employee-queries.js";
import {
  useDeletePublicHolidayMutation,
  usePublicHolidaysQuery,
  useTimeRecordsQuery,
  useTimeSummaryQuery,
  useUpsertPublicHolidayMutation,
  useUpsertTimeRecordMutation,
  useWorkingHoursQuery,
} from "../employment-time-queries.js";
import { AbsencesSummary } from "./absences-summary.js";
import { HolidayCalendar } from "./holiday-calendar.js";
import { getMonday, WeeklyTimesheetGrid } from "./weekly-timesheet-grid.js";

interface TeamMemberEmploymentTimeTabProps {
  member: TeamMemberListItem;
}

export function TeamMemberEmploymentTimeTab({
  member,
}: TeamMemberEmploymentTimeTabProps) {
  const { t, i18n } = useTranslation("team");
  const isDe = i18n.language === "de";

  const [currentDate, setCurrentDate] = useState(new Date());
  const selectedYear = currentDate.getFullYear();

  // Helper date strings for query (selected week range)
  const { startDateStr, endDateStr } = useMemo(() => {
    const monday = getMonday(currentDate);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const pad = (n: number) => String(n).padStart(2, "0");
    const startStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
    const endStr = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;

    return { startDateStr: startStr, endDateStr: endStr };
  }, [currentDate]);

  // HR fields come from team-hr's employee endpoint, not the core member.
  const employee = useEmployeeQuery(member.id).data;
  const jurisdiction = employee?.jurisdiction || "AT";

  // 1. Fetch time records for the selected week
  const recordsQuery = useTimeRecordsQuery(member.id, startDateStr, endDateStr);
  const upsertRecordMutation = useUpsertTimeRecordMutation(
    member.id,
    startDateStr,
    endDateStr
  );

  // 2. Fetch public holidays for the selected year
  const holidaysQuery = usePublicHolidaysQuery(selectedYear, jurisdiction);
  const addHolidayMutation = useUpsertPublicHolidayMutation(
    selectedYear,
    jurisdiction
  );
  const deleteHolidayMutation = useDeletePublicHolidayMutation(
    selectedYear,
    jurisdiction
  );

  // 3. Fetch summary stats for the selected year
  const summaryQuery = useTimeSummaryQuery(member.id, selectedYear);

  // 4. Fetch versioned working hours (Normalarbeitszeit)
  const workingHoursQuery = useWorkingHoursQuery(member.id);

  return (
    <div className="space-y-6">
      {/* Jurisdiction banner */}
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/10 p-3.5 text-muted-foreground text-xs">
        <span>
          {isDe
            ? `Jurisdiktion: ${jurisdiction} (Regelarbeitszeit unterliegt österreichischem Arbeitszeitgesetz)`
            : `Jurisdiction: ${jurisdiction} (Regular work hours configured under Austrian AZG)`}
        </span>
      </div>

      {/* Absences and balances dashboard summary */}
      <AbsencesSummary
        loading={summaryQuery.isLoading}
        summary={summaryQuery.data || null}
      />

      {/* Timesheet main weekly grid */}
      <WeeklyTimesheetGrid
        currentDate={currentDate}
        holidays={holidaysQuery.data || []}
        isLoading={
          recordsQuery.isLoading ||
          upsertRecordMutation.isPending ||
          workingHoursQuery.isLoading
        }
        onChangeDate={setCurrentDate}
        onUpsertRecord={async (rec) =>
          await upsertRecordMutation.mutateAsync(rec)
        }
        profileId={member.id}
        targetHoursByDay={employee?.target_hours_by_day ?? null}
        timeRecords={recordsQuery.data || []}
        workingHours={workingHoursQuery.data || []}
      />

      {/* Holidays calendar management panel */}
      <HolidayCalendar
        holidays={holidaysQuery.data || []}
        jurisdiction={jurisdiction}
        loading={holidaysQuery.isLoading}
        onAddHoliday={async (hol) => await addHolidayMutation.mutateAsync(hol)}
        onDeleteHoliday={async (id) =>
          await deleteHolidayMutation.mutateAsync(id)
        }
        year={selectedYear}
      />
    </div>
  );
}
