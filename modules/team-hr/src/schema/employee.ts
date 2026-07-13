import { z } from "@hono/zod-openapi";

export type EmploymentStatus =
  | "full_time"
  | "part_time"
  | "freelancer"
  | "contractor";

/** The HR/employment record for a team member (one row per profile). */
export interface Employee {
  bank_bic: string | null;
  bank_iban: string | null;
  bank_name: string | null;
  birth_date: string | null;
  birth_place: string | null;
  children: { name?: string; birth_date: string }[] | null;
  created_at: string;
  daily_rate: number | null;
  disability_degree: number | null;
  einstufung: string | null;
  emergency_contact: string | null;
  employee_number: string | null;
  employment_status: EmploymentStatus | null;
  end_date: string | null;
  extras: string | null;
  gender: "male" | "female" | "diverse" | "other" | null;
  health_insurance: string | null;
  hourly_rate: number | null;
  id: string;
  job_title: string | null;
  jurisdiction: string | null;
  marital_status:
    | "single"
    | "married"
    | "divorced"
    | "widowed"
    | "registered_partnership"
    | null;
  nationality: string | null;
  overtime_starting_balance: number | null;
  private_address: string | null;
  private_email: string | null;
  private_phone: string | null;
  profile_id: string;
  religion: string | null;
  salary_monthly: number | null;
  scope_id: string;
  social_security_number: string | null;
  start_date: string | null;
  target_hours_by_day: Record<string, number> | null;
  tax_class: string | null;
  tax_id: string | null;
  tenant_id: string;
  updated_at: string;
  vacation_carryover: number | null;
  vacation_entitlement_yearly: number | null;
  weekly_hours: number | null;
}

const nullableString = z.string().nullish();
const nullableNumber = z.number().nullish();

/** Partial patch for upserting an employee record (all fields optional). */
export const employeePatchSchema = z.object({
  private_phone: nullableString,
  private_email: nullableString,
  private_address: nullableString,
  emergency_contact: nullableString,
  employee_number: nullableString,
  job_title: nullableString,
  employment_status: z
    .enum(["full_time", "part_time", "freelancer", "contractor"])
    .nullish(),
  start_date: nullableString,
  end_date: nullableString,
  salary_monthly: nullableNumber,
  extras: nullableString,
  einstufung: nullableString,
  hourly_rate: nullableNumber,
  daily_rate: nullableNumber,
  birth_date: nullableString,
  birth_place: nullableString,
  nationality: nullableString,
  social_security_number: nullableString,
  tax_id: nullableString,
  tax_class: nullableString,
  health_insurance: nullableString,
  bank_name: nullableString,
  bank_iban: nullableString,
  bank_bic: nullableString,
  gender: z.enum(["male", "female", "diverse", "other"]).nullish(),
  marital_status: z
    .enum([
      "single",
      "married",
      "divorced",
      "widowed",
      "registered_partnership",
    ])
    .nullish(),
  religion: nullableString,
  disability_degree: nullableNumber,
  weekly_hours: nullableNumber,
  children: z
    .array(z.object({ name: z.string().optional(), birth_date: z.string() }))
    .nullish(),
  jurisdiction: nullableString,
  target_hours_by_day: z.record(z.string(), z.number()).nullish(),
  vacation_entitlement_yearly: nullableNumber,
  vacation_carryover: nullableNumber,
  overtime_starting_balance: nullableNumber,
});

export type EmployeePatch = z.infer<typeof employeePatchSchema>;
