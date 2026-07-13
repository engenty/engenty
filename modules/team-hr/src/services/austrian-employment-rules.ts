export interface DailyValidationResult {
  actualHours: number;
  warnings: string[];
}

export function parseTimeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) {
    return null;
  }
  const parts = timeStr.split(":");
  if (parts.length < 2) {
    return null;
  }
  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

export function formatMinutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function validateDailyRecord(
  clockIn: string | null,
  clockOut: string | null,
  breakMinutes: number,
  targetHours: number
): DailyValidationResult {
  const warnings: string[] = [];
  if (!(clockIn && clockOut)) {
    return { actualHours: 0, warnings };
  }

  const startMins = parseTimeToMinutes(clockIn);
  const endMins = parseTimeToMinutes(clockOut);

  if (startMins === null || endMins === null) {
    return {
      actualHours: 0,
      warnings: ["Invalid clock-in or clock-out format."],
    };
  }

  let durationMins = endMins - startMins;
  if (durationMins < 0) {
    // Shift goes past midnight
    durationMins += 24 * 60;
  }

  const actualMins = Math.max(0, durationMins - breakMinutes);
  const actualHours = formatMinutesToHours(actualMins);

  // 1. Max daily working time limit check (Austrian AZG: max 12h)
  if (actualHours > 12) {
    warnings.push("Maximum daily working time of 12 hours exceeded.");
  }

  // 2. Mandatory break check (Austrian AZG: after 6h, at least 30 min break is required)
  const workingBeforeBreakHours = formatMinutesToHours(durationMins);
  if (workingBeforeBreakHours > 6 && breakMinutes < 30) {
    warnings.push(
      "A break of at least 30 minutes is required after 6 hours of work."
    );
  }

  return { actualHours, warnings };
}

export function validateRestPeriod(
  prevDayClockOut: string | null,
  currDayClockIn: string | null
): string | null {
  if (!(prevDayClockOut && currDayClockIn)) {
    return null;
  }

  const prevOutMins = parseTimeToMinutes(prevDayClockOut);
  const currInMins = parseTimeToMinutes(currDayClockIn);

  if (prevOutMins === null || currInMins === null) {
    return null;
  }

  // Assume rest time between shifts.
  // prevOutMins is minutes from midnight of Day N
  // currInMins is minutes from midnight of Day N+1
  // Rest period = (1440 - prevOutMins) + currInMins
  const restMins = 24 * 60 - prevOutMins + currInMins;
  const restHours = formatMinutesToHours(restMins);

  // Austrian AZG: daily rest period must be at least 11 uninterrupted hours
  if (restHours < 11) {
    return `Daily rest period between shifts is only ${restHours} hours (minimum 11 hours required).`;
  }

  return null;
}

export function getDayOfWeekName(dateStr: string): string {
  const date = new Date(dateStr);
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[date.getDay()];
}

export function calculateTargetHours(
  dateStr: string,
  targetHoursByDay: Record<string, number> | null,
  isPublicHoliday: boolean
): number {
  if (!targetHoursByDay) {
    return 0;
  }
  const dayName = getDayOfWeekName(dateStr);
  const scheduledHours = targetHoursByDay[dayName] || 0;

  // In Austria, public holidays are paid off, so target hours for that day remains
  // the scheduled hours, but it is credited as worked (actual hours = target hours).
  // Therefore, the target hours is the scheduled hours.
  return scheduledHours;
}
