import { requestApiJson } from "@engenty/api-client";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import type { Employee, EmployeePatch } from "../src/schema/employee.js";

export type { Employee, EmployeePatch } from "../src/schema/employee.js";

export const employeeKeys = {
  detail: (profileId: string) => ["team-hr", "employee", profileId] as const,
};

/** A team member's employee (HR) record, from team-hr's own endpoint. */
export function useEmployeeQuery(profileId: string | null) {
  return useQuery({
    queryKey: employeeKeys.detail(profileId ?? ""),
    queryFn: ({ signal }) =>
      requestApiJson<Employee | null>(`/api/team/${profileId}/employee`, {
        method: "GET",
        signal,
      }),
    enabled: Boolean(profileId),
  });
}

export function useUpdateEmployeeMutation(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: EmployeePatch) =>
      requestApiJson<Employee>(`/api/team/${profileId}/employee`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: employeeKeys.detail(profileId),
      }),
  });
}
