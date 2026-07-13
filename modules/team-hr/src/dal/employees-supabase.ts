import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type { Employee, EmployeePatch } from "../schema/employee.js";

const SCHEMA = "module_team";

function rowToEmployee(row: Record<string, unknown>): Employee {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    ...(row as unknown as Employee),
    salary_monthly: num(row.salary_monthly),
    hourly_rate: num(row.hourly_rate),
    daily_rate: num(row.daily_rate),
    disability_degree: num(row.disability_degree),
    weekly_hours: num(row.weekly_hours),
    vacation_entitlement_yearly: num(row.vacation_entitlement_yearly),
    vacation_carryover: num(row.vacation_carryover),
    overtime_starting_balance: num(row.overtime_starting_balance),
  };
}

/** Serialize patch values for the row (children → JSON). */
function toRow(patch: EmployeePatch): Record<string, unknown> {
  const row: Record<string, unknown> = { ...patch };
  if ("children" in patch) {
    row.children = JSON.stringify(patch.children ?? []);
  }
  return row;
}

export type EmployeesRepo = ReturnType<typeof createEmployeesRepo>;

/**
 * The HR/employment record for a team member, keyed by `profile_id`. Owns the
 * `module_team.employees` table that core team no longer reads or writes.
 */
export function createEmployeesRepo(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const employees = () => supabase.schema(SCHEMA).from("employees");

  return {
    async getByProfileId(profileId: string): Promise<Employee | null> {
      const { data, error } = await employees()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to load employee: ${error.message}`);
      }
      return data ? rowToEmployee(data) : null;
    },

    /** Update the employee row, creating it on first write (one per profile). */
    async upsertByProfileId(
      profileId: string,
      patch: EmployeePatch
    ): Promise<Employee> {
      const now = new Date().toISOString();
      const existing = await this.getByProfileId(profileId);
      if (existing) {
        const { data, error } = await employees()
          .update({ ...toRow(patch), updated_at: now })
          .eq("tenant_id", tenantId)
          .eq("profile_id", profileId)
          .select()
          .single();
        if (error) {
          throw new Error(`Failed to update employee: ${error.message}`);
        }
        return rowToEmployee(data);
      }
      const insertRow = {
        id: uuidv7(),
        tenant_id: tenantId,
        scope_id: scopeId,
        profile_id: profileId,
        ...toRow(patch),
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await employees()
        .insert(insertRow)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create employee: ${error.message}`);
      }
      return rowToEmployee(data);
    },
  };
}
