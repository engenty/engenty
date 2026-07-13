import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";

export interface DBTimeRecord {
  absence_type: string | null;
  actual_hours: number;
  break_minutes: number;
  clock_in: string | null;
  clock_out: string | null;
  date: string;
  id: string;
  notes: string | null;
  profile_id: string;
  scope_id: string;
  target_hours: number;
  tenant_id: string;
}

export interface DBAbsence {
  absence_type: string;
  approved_by: string | null;
  end_date: string;
  id: string;
  notes: string | null;
  profile_id: string;
  scope_id: string;
  start_date: string;
  status: string;
  tenant_id: string;
}

export interface DBPublicHoliday {
  date: string;
  id: string;
  is_half_day: boolean;
  jurisdiction: string;
  name: string;
  scope_id: string;
  tenant_id: string;
}

export interface DBWorkingHours {
  end_date: string | null;
  id: string;
  profile_id: string;
  schedule: any;
  scope_id: string;
  start_date: string;
  tenant_id: string;
  weekly_hours: number;
}

export function createEmploymentTimeRepo(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const schema = "module_team";

  const recordsTable = () =>
    supabase.schema(schema).from("employment_time_records");
  const absencesTable = () => supabase.schema(schema).from("absences");
  const holidaysTable = () => supabase.schema(schema).from("public_holidays");
  const workingHoursTable = () =>
    supabase.schema(schema).from("employee_working_hours");

  return {
    // Daily Time Records
    async listTimeRecords(
      profileId: string,
      startDate: string,
      endDate: string
    ): Promise<DBTimeRecord[]> {
      const { data, error } = await recordsTable()
        .select("*")
        .eq("profile_id", profileId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (error) {
        throw new Error(`Failed to list time records: ${error.message}`);
      }
      return data as DBTimeRecord[];
    },

    async upsertTimeRecord(
      record: Omit<DBTimeRecord, "tenant_id" | "scope_id" | "id"> & {
        id?: string;
      }
    ): Promise<DBTimeRecord> {
      const payload = {
        ...record,
        id: record.id || uuidv7(),
        tenant_id: tenantId,
        scope_id: scopeId,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await recordsTable()
        .upsert(payload, { onConflict: "profile_id,date" })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to upsert time record: ${error.message}`);
      }
      return data as DBTimeRecord;
    },

    // Absences (Vacation, Sick Leave, etc.)
    async listAbsences(profileId: string, year?: number): Promise<DBAbsence[]> {
      let query = absencesTable()
        .select("*")
        .eq("profile_id", profileId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (year) {
        query = query
          .gte("start_date", `${year}-01-01`)
          .lte("end_date", `${year}-12-31`);
      }

      const { data, error } = await query.order("start_date", {
        ascending: true,
      });

      if (error) {
        throw new Error(`Failed to list absences: ${error.message}`);
      }
      return data as DBAbsence[];
    },

    async upsertAbsence(
      absence: Omit<DBAbsence, "tenant_id" | "scope_id" | "id"> & {
        id?: string;
      }
    ): Promise<DBAbsence> {
      const payload = {
        ...absence,
        id: absence.id || uuidv7(),
        tenant_id: tenantId,
        scope_id: scopeId,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await absencesTable()
        .upsert(payload)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to upsert absence: ${error.message}`);
      }
      return data as DBAbsence;
    },

    async deleteAbsence(id: string): Promise<void> {
      const { error } = await absencesTable()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (error) {
        throw new Error(`Failed to delete absence: ${error.message}`);
      }
    },

    // Central Public Holidays
    async listPublicHolidays(
      year?: number,
      jurisdiction?: string
    ): Promise<DBPublicHoliday[]> {
      let query = holidaysTable()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (jurisdiction) {
        query = query.eq("jurisdiction", jurisdiction);
      }
      if (year) {
        query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
      }

      const { data, error } = await query.order("date", { ascending: true });

      if (error) {
        throw new Error(`Failed to list public holidays: ${error.message}`);
      }
      return data as DBPublicHoliday[];
    },

    async upsertPublicHoliday(
      holiday: Omit<DBPublicHoliday, "tenant_id" | "scope_id" | "id"> & {
        id?: string;
      }
    ): Promise<DBPublicHoliday> {
      const payload = {
        ...holiday,
        id: holiday.id || uuidv7(),
        tenant_id: tenantId,
        scope_id: scopeId,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await holidaysTable()
        .upsert(payload, { onConflict: "tenant_id,jurisdiction,date" })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to upsert public holiday: ${error.message}`);
      }
      return data as DBPublicHoliday;
    },

    async deletePublicHoliday(id: string): Promise<void> {
      const { error } = await holidaysTable()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (error) {
        throw new Error(`Failed to delete public holiday: ${error.message}`);
      }
    },

    // Versioned Regular Working Hours (Normalarbeitszeit)
    async listWorkingHours(profileId: string): Promise<DBWorkingHours[]> {
      const { data, error } = await workingHoursTable()
        .select("*")
        .eq("profile_id", profileId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("start_date", { ascending: false });

      if (error) {
        throw new Error(`Failed to list working hours: ${error.message}`);
      }
      return data as DBWorkingHours[];
    },

    async upsertWorkingHours(
      record: Omit<DBWorkingHours, "tenant_id" | "scope_id" | "id"> & {
        id?: string;
      }
    ): Promise<DBWorkingHours> {
      const payload = {
        ...record,
        id: record.id || uuidv7(),
        tenant_id: tenantId,
        scope_id: scopeId,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await workingHoursTable()
        .upsert(payload)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to upsert working hours: ${error.message}`);
      }
      return data as DBWorkingHours;
    },

    async deleteWorkingHours(id: string): Promise<void> {
      const { error } = await workingHoursTable()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (error) {
        throw new Error(`Failed to delete working hours: ${error.message}`);
      }
    },
  };
}
