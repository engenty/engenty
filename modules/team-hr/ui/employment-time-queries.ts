import { requestApiJson } from "@engenty/api-client";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";

export interface TimeRecord {
  absence_type: string | null;
  actual_hours: number;
  break_minutes: number;
  clock_in: string | null;
  clock_out: string | null;
  date: string;
  id?: string;
  notes: string | null;
  profile_id: string;
  target_hours: number;
}

export interface Absence {
  absence_type:
    | "vacation"
    | "sick_leave"
    | "carer_leave"
    | "special_leave"
    | "unpaid_leave"
    | "time_off_in_lieu";
  approved_by?: string | null;
  end_date: string;
  id?: string;
  notes?: string | null;
  profile_id: string;
  start_date: string;
  status: "pending" | "approved" | "rejected";
}

export interface PublicHoliday {
  date: string;
  id?: string;
  is_half_day?: boolean;
  jurisdiction: string;
  name: string;
}

export interface EmployeeWorkingHours {
  end_date: string | null;
  id?: string;
  profile_id: string;
  schedule: Record<
    string,
    {
      enabled: boolean;
      start: string | null;
      end: string | null;
      break_minutes: number;
    }
  >;
  start_date: string;
  weekly_hours: number;
}

export interface TimeSummary {
  absences: {
    sick_leave: number;
    carer_leave: number;
    special_leave: number;
    unpaid_leave: number;
  };
  overtime: {
    starting_balance: number;
    net_this_year: number;
    total_balance: number;
    actual_hours: number;
    target_hours: number;
  };
  vacation: {
    entitlement: number;
    carryover: number;
    consumed: number;
    remaining: number;
  };
  year: number;
}

export const employmentTimeKeys = {
  all: ["employment-time"] as const,
  records: (profileId: string, start: string, end: string) =>
    [...employmentTimeKeys.all, "records", profileId, start, end] as const,
  summary: (profileId: string, year: number) =>
    [...employmentTimeKeys.all, "summary", profileId, year] as const,
  absences: (profileId: string, year?: number) =>
    [...employmentTimeKeys.all, "absences", profileId, year] as const,
  holidays: (year: number, jurisdiction: string) =>
    [...employmentTimeKeys.all, "holidays", year, jurisdiction] as const,
  workingHours: (profileId: string) =>
    [...employmentTimeKeys.all, "working-hours", profileId] as const,
};

// 1. Time Records hooks
export function useTimeRecordsQuery(
  profileId: string,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: employmentTimeKeys.records(profileId, startDate, endDate),
    queryFn: async ({ signal }) =>
      await requestApiJson<TimeRecord[]>(
        `/api/team/members/${profileId}/time-records?start_date=${startDate}&end_date=${endDate}`,
        { method: "GET", signal }
      ),
    enabled: !!profileId && !!startDate && !!endDate,
  });
}

export function useUpsertTimeRecordMutation(
  profileId: string,
  startDate: string,
  endDate: string
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (record: TimeRecord) =>
      await requestApiJson<{ record: TimeRecord; warnings: string[] }>(
        `/api/team/members/${profileId}/time-records`,
        {
          method: "POST",
          body: JSON.stringify(record),
        }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: employmentTimeKeys.records(profileId, startDate, endDate),
      });
      void queryClient.invalidateQueries({
        queryKey: ["employment-time", "summary", profileId],
      });
    },
  });
}

// 2. Summary hook
export function useTimeSummaryQuery(profileId: string, year: number) {
  return useQuery({
    queryKey: employmentTimeKeys.summary(profileId, year),
    queryFn: async ({ signal }) =>
      await requestApiJson<TimeSummary>(
        `/api/team/members/${profileId}/time-summary?year=${year}`,
        { method: "GET", signal }
      ),
    enabled: !!profileId && !!year,
  });
}

// 3. Absences hooks
export function useAbsencesQuery(profileId: string, year?: number) {
  return useQuery({
    queryKey: employmentTimeKeys.absences(profileId, year),
    queryFn: async ({ signal }) => {
      const query = year ? `?year=${year}` : "";
      return await requestApiJson<Absence[]>(
        `/api/team/members/${profileId}/absences${query}`,
        { method: "GET", signal }
      );
    },
    enabled: !!profileId,
  });
}

export function useUpsertAbsenceMutation(profileId: string, year?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (absence: Absence) =>
      await requestApiJson<Absence>(`/api/team/members/${profileId}/absences`, {
        method: "POST",
        body: JSON.stringify(absence),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: employmentTimeKeys.absences(profileId, year),
      });
      void queryClient.invalidateQueries({
        queryKey: employmentTimeKeys.summary(
          profileId,
          year || new Date().getFullYear()
        ),
      });
    },
  });
}

export function useDeleteAbsenceMutation(profileId: string, year?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      await requestApiJson<{ ok: boolean }>(`/api/team/absences/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: employmentTimeKeys.absences(profileId, year),
      });
      void queryClient.invalidateQueries({
        queryKey: employmentTimeKeys.summary(
          profileId,
          year || new Date().getFullYear()
        ),
      });
    },
  });
}

// 4. Public Holidays hooks
export function usePublicHolidaysQuery(year: number, jurisdiction: string) {
  return useQuery({
    queryKey: employmentTimeKeys.holidays(year, jurisdiction),
    queryFn: async ({ signal }) =>
      await requestApiJson<PublicHoliday[]>(
        `/api/team/public-holidays?year=${year}&jurisdiction=${jurisdiction}`,
        { method: "GET", signal }
      ),
    enabled: !!year && !!jurisdiction,
  });
}

export function useUpsertPublicHolidayMutation(
  year: number,
  jurisdiction: string
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (holiday: PublicHoliday) =>
      await requestApiJson<PublicHoliday>("/api/team/public-holidays", {
        method: "POST",
        body: JSON.stringify(holiday),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: employmentTimeKeys.holidays(year, jurisdiction),
      });
    },
  });
}

export function useDeletePublicHolidayMutation(
  year: number,
  jurisdiction: string
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      await requestApiJson<{ ok: boolean }>(`/api/team/public-holidays/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: employmentTimeKeys.holidays(year, jurisdiction),
      });
    },
  });
}

// 5. Working Hours hooks
export function useWorkingHoursQuery(profileId: string) {
  return useQuery({
    queryKey: employmentTimeKeys.workingHours(profileId),
    queryFn: async ({ signal }) =>
      await requestApiJson<EmployeeWorkingHours[]>(
        `/api/team/members/${profileId}/working-hours`,
        { method: "GET", signal }
      ),
    enabled: !!profileId,
  });
}

export function useUpsertWorkingHoursMutation(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (record: EmployeeWorkingHours) =>
      await requestApiJson<EmployeeWorkingHours>(
        `/api/team/members/${profileId}/working-hours`,
        {
          method: "POST",
          body: JSON.stringify(record),
        }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: employmentTimeKeys.workingHours(profileId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["employment-time", "records", profileId],
      });
    },
  });
}

export function useDeleteWorkingHoursMutation(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      await requestApiJson<{ ok: boolean }>(`/api/team/working-hours/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: employmentTimeKeys.workingHours(profileId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["employment-time", "records", profileId],
      });
    },
  });
}
