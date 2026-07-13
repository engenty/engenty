import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import {
  type TeamMemberListItem,
  TeamModulePageScroll,
  useTeamMemberDetailPageQuery,
  useTeamModuleSecondaryShellNav,
} from "@engenty/team/ui";
import {
  Button,
  Card,
  DatePicker,
  FileInput,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@engenty/ui-core";
import { useFeatureFlags, usePageConfig } from "@engenty/ui-plugin-sdk";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import {
  contractKeys,
  useTeamMemberContractsQuery,
} from "../contract-queries.js";
import {
  type Employee,
  useEmployeeQuery,
  useUpdateEmployeeMutation,
} from "../employee-queries.js";
import {
  deleteTeamMemberContract,
  type TeamMemberContract,
  uploadTeamMemberContract,
} from "../hr-api.js";

const employmentStatusSchema = z.enum([
  "full_time",
  "part_time",
  "freelancer",
  "contractor",
]);

const editSchema = z.object({
  employee_number: z.string().nullable(),
  job_title: z.string().nullable(),
  employment_status: employmentStatusSchema.nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  salary_monthly: z.number().nullable(),
  extras: z.string().nullable(),
  einstufung: z.string().nullable(),
  hourly_rate: z.number().nullable(),
  daily_rate: z.number().nullable(),
  birth_date: z.string().nullable(),
  birth_place: z.string().nullable(),
  nationality: z.string().nullable(),
  social_security_number: z.string().nullable(),
  tax_id: z.string().nullable(),
  tax_class: z.string().nullable(),
  health_insurance: z.string().nullable(),
  bank_name: z.string().nullable(),
  bank_iban: z.string().nullable(),
  bank_bic: z.string().nullable(),
  gender: z.enum(["male", "female", "diverse", "other"]).nullable(),
  marital_status: z
    .enum([
      "single",
      "married",
      "divorced",
      "widowed",
      "registered_partnership",
    ])
    .nullable(),
  religion: z.string().nullable(),
  disability_degree: z.number().nullable(),
  weekly_hours: z.number().nullable(),
  children: z
    .array(z.object({ name: z.string().optional(), birth_date: z.string() }))
    .nullable(),
  jurisdiction: z.string().nullable(),
  vacation_entitlement_yearly: z.number().nullable(),
  vacation_carryover: z.number().nullable(),
  overtime_starting_balance: z.number().nullable(),
});

type EditFormValues = z.infer<typeof editSchema>;

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "employmentFullTime",
  part_time: "employmentPartTime",
  freelancer: "employmentFreelancer",
  contractor: "employmentContractor",
};

function memberToFormValues(
  m: Partial<Employee> & TeamMemberListItem
): EditFormValues {
  return {
    employee_number: m.employee_number ?? null,
    job_title: m.job_title ?? null,
    employment_status: m.employment_status ?? null,
    start_date: m.start_date ?? null,
    end_date: m.end_date ?? null,
    salary_monthly: m.salary_monthly ?? null,
    extras: m.extras ?? null,
    einstufung: m.einstufung ?? null,
    hourly_rate: m.hourly_rate ?? null,
    daily_rate: m.daily_rate ?? null,
    birth_date: m.birth_date ?? null,
    birth_place: m.birth_place ?? null,
    nationality: m.nationality ?? null,
    social_security_number: m.social_security_number ?? null,
    tax_id: m.tax_id ?? null,
    tax_class: m.tax_class ?? null,
    health_insurance: m.health_insurance ?? null,
    bank_name: m.bank_name ?? null,
    bank_iban: m.bank_iban ?? null,
    bank_bic: m.bank_bic ?? null,
    gender: m.gender ?? null,
    marital_status: m.marital_status ?? null,
    religion: m.religion ?? null,
    disability_degree: m.disability_degree ?? null,
    weekly_hours: m.weekly_hours ?? null,
    children: m.children ?? [],
    jurisdiction: m.jurisdiction ?? "AT",
    vacation_entitlement_yearly: m.vacation_entitlement_yearly ?? 25.0,
    vacation_carryover: m.vacation_carryover ?? 0.0,
    overtime_starting_balance: m.overtime_starting_balance ?? 0.0,
  };
}

export function TeamMemberHrEditPage() {
  const { t } = useTranslation("team");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loaded, setLoaded] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [uploadingContract, setUploadingContract] = useState(false);
  const queryClient = useQueryClient();
  const shellNav = useTeamModuleSecondaryShellNav();
  const detailQuery = useTeamMemberDetailPageQuery(id ?? null);
  const employeeQuery = useEmployeeQuery(id ?? null);
  const employee = employeeQuery.data;
  const updateMutation = useUpdateEmployeeMutation(id ?? "");
  const member = detailQuery.data?.member ?? null;
  const contractsQuery = useTeamMemberContractsQuery(id ?? null);
  const contracts = contractsQuery.data ?? [];
  const loading = detailQuery.isLoading;

  const { resolved: featureFlags, isLoading: flagsLoading } = useFeatureFlags();
  const isHrEnabled = featureFlags?.["team.hr.enabled"] === true;

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      employee_number: null,
      job_title: null,
      employment_status: null,
      start_date: null,
      end_date: null,
      salary_monthly: null,
      extras: null,
      einstufung: null,
      hourly_rate: null,
      daily_rate: null,
      birth_date: null,
      birth_place: null,
      nationality: null,
      social_security_number: null,
      tax_id: null,
      tax_class: null,
      health_insurance: null,
      bank_name: null,
      bank_iban: null,
      bank_bic: null,
      gender: null,
      marital_status: null,
      religion: null,
      disability_degree: null,
      weekly_hours: null,
      children: [],
      jurisdiction: "AT",
      vacation_entitlement_yearly: 25,
      vacation_carryover: 0,
      overtime_starting_balance: 0,
    },
  });

  const {
    fields: childFields,
    append: appendChild,
    remove: removeChild,
  } = useFieldArray({
    control: form.control,
    name: "children",
  });

  useEffect(() => {
    if (!detailQuery.data || employeeQuery.isLoading || loaded) {
      return;
    }
    // HR fields from the employee record; profile fields from the core member.
    form.reset(
      memberToFormValues({ ...(employee ?? {}), ...detailQuery.data.member })
    );
    setApiError(null);
    setLoaded(true);
  }, [detailQuery.data, employee, employeeQuery.isLoading, loaded, form.reset]);

  useEffect(() => {
    if (detailQuery.error != null && !loaded) {
      setApiError(
        detailQuery.error instanceof Error
          ? detailQuery.error.message
          : t("loadFailed")
      );
      setLoaded(true);
    }
  }, [detailQuery.error, loaded, t]);

  const handleSubmit = useCallback(
    async (values: EditFormValues) => {
      if (!id) {
        return;
      }
      setApiError(null);
      try {
        await updateMutation.mutateAsync(values);
        form.reset(values);
        navigate(`/mdl/team/${id}/hr`);
      } catch (err: unknown) {
        setApiError(err instanceof Error ? err.message : t("saveFailed"));
      }
    },
    [form, id, navigate, t, updateMutation]
  );

  const handleContractUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!(id && e.target.files?.[0])) {
        return;
      }
      const file = e.target.files[0];
      setUploadingContract(true);
      try {
        await uploadTeamMemberContract(id, file);
        await queryClient.invalidateQueries({
          queryKey: contractKeys.list(id),
        });
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploadingContract(false);
        e.target.value = "";
      }
    },
    [id, queryClient]
  );

  const handleDeleteContract = useCallback(
    async (contractId: string) => {
      if (!id) {
        return;
      }
      try {
        await deleteTeamMemberContract(id, contractId);
        await queryClient.invalidateQueries({
          queryKey: contractKeys.list(id),
        });
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [id, queryClient]
  );

  const isDirty = form.formState.isDirty;

  const breadcrumbs = useMemo(
    () => [
      ...(shellNav.moduleRootCrumb ? [shellNav.moduleRootCrumb] : []),
      {
        label: member?.full_name || t("menu"),
        to: id ? `/mdl/team/${id}` : "/mdl/team",
      },
      {
        label: "HR",
        to: id ? `/mdl/team/${id}/hr` : "/mdl/team",
      },
      {
        label: t("edit"),
      },
    ],
    [shellNav.moduleRootCrumb, id, member, t]
  );

  const pageActions = useMemo(
    () =>
      loading ? null : (
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate(-1)} size="sm" variant="outline">
            {t("cancel")}
          </Button>
          <Button
            disabled={!isDirty || form.formState.isSubmitting}
            onClick={() => {
              form.handleSubmit(handleSubmit)();
            }}
            size="sm"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {form.formState.isSubmitting ? t("loading") : t("save")}
          </Button>
        </div>
      ),
    [form, handleSubmit, isDirty, loading, navigate, t]
  );

  usePageConfig({
    breadcrumbs,
    actions: pageActions,
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  if (flagsLoading || loading) {
    return (
      <TeamModulePageScroll>
        <section className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-96" />
          <Card variant="form">
            <div className="space-y-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="flex items-center gap-4" key={i}>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 flex-1" />
                </div>
              ))}
            </div>
          </Card>
        </section>
      </TeamModulePageScroll>
    );
  }

  if (!isHrEnabled) {
    return <Navigate replace to={id ? `/mdl/team/${id}` : "/mdl/team"} />;
  }

  if (!id) {
    return (
      <div className="p-4 text-muted-foreground text-sm">{t("notFound")}</div>
    );
  }
  if (!loaded) {
    return (
      <div className="p-4 text-muted-foreground text-sm">
        {apiError ?? t("notFound")}
      </div>
    );
  }

  return (
    <TeamModulePageScroll>
      {apiError && (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          role="alert"
        >
          {apiError}
        </div>
      )}

      <Form {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit(handleSubmit)}>
          <section className="space-y-2">
            <h2 className="font-medium text-lg">{t("employmentInfo")}</h2>
            <Card variant="form">
              <FormField
                control={form.control}
                name="employee_number"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("employeeNumber")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="job_title"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("jobTitle")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employment_status"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("employmentStatus")}</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v || null)}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              field.value === "full_time"
                                ? t("employmentFullTime")
                                : field.value === "part_time"
                                  ? t("employmentPartTime")
                                  : field.value === "freelancer"
                                    ? t("employmentFreelancer")
                                    : field.value === "contractor"
                                      ? t("employmentContractor")
                                      : t("selectStatus")
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="full_time">
                          {t("employmentFullTime")}
                        </SelectItem>
                        <SelectItem value="part_time">
                          {t("employmentPartTime")}
                        </SelectItem>
                        <SelectItem value="freelancer">
                          {t("employmentFreelancer")}
                        </SelectItem>
                        <SelectItem value="contractor">
                          {t("employmentContractor")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="weekly_hours"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("weeklyHours")}</FormLabel>
                    <FormControl>
                      <Input
                        step="0.25"
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        value={field.value == null ? "" : field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="jurisdiction"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>Jurisdiction (Country)</FormLabel>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? "AT"}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select country..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AT">Austria (AT)</SelectItem>
                          <SelectItem value="DE">Germany (DE)</SelectItem>
                          <SelectItem value="CH">Switzerland (CH)</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vacation_entitlement_yearly"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>Annual Vacation Entitlement (days)</FormLabel>
                    <FormControl>
                      <Input
                        step="0.5"
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        value={field.value == null ? "" : field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vacation_carryover"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>Vacation Carryover (days)</FormLabel>
                    <FormControl>
                      <Input
                        step="0.5"
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        value={field.value == null ? "" : field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="overtime_starting_balance"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>Overtime Starting Balance (hours)</FormLabel>
                    <FormControl>
                      <Input
                        step="0.5"
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        value={field.value == null ? "" : field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("startDate")}</FormLabel>
                    <FormControl>
                      <DatePicker
                        onChange={field.onChange}
                        placeholder={t("pickDate")}
                        value={field.value ?? null}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("endDate")}</FormLabel>
                    <FormControl>
                      <DatePicker
                        onChange={field.onChange}
                        placeholder={t("pickDate")}
                        value={field.value ?? null}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salary_monthly"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("salaryMonthly")}</FormLabel>
                    <FormControl>
                      <Input
                        step="0.01"
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        value={field.value == null ? "" : field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="extras"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("extras")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="einstufung"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("einstufung")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("einstufungPlaceholder")}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {(form.watch("employment_status") === "freelancer" ||
                form.watch("employment_status") === "contractor") && (
                <>
                  <FormField
                    control={form.control}
                    name="hourly_rate"
                    render={({ field }) => (
                      <FormItem variant="row">
                        <FormLabel>{t("hourlyRate")}</FormLabel>
                        <FormControl>
                          <Input
                            step="0.01"
                            type="number"
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                            value={field.value == null ? "" : field.value}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="daily_rate"
                    render={({ field }) => (
                      <FormItem variant="row">
                        <FormLabel>{t("dailyRate")}</FormLabel>
                        <FormControl>
                          <Input
                            step="0.01"
                            type="number"
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                            value={field.value == null ? "" : field.value}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <div className="mt-4 border-t pt-4">
                <h3 className="mb-2 font-medium text-sm">{t("contracts")}</h3>
                <FileInput
                  accept=".pdf,.doc,.docx"
                  aria-label={t("uploadContract")}
                  disabled={uploadingContract}
                  emptyLabel={t("noFileSelected")}
                  key={contracts.length}
                  onChange={handleContractUpload}
                  selectLabel={t("selectFile")}
                />
                {uploadingContract && (
                  <span className="ml-2 text-muted-foreground text-sm">
                    {t("uploading")}
                  </span>
                )}
                {contracts.length > 0 && (
                  <ul className="mt-3 space-y-2 text-sm">
                    {contracts.map((c: TeamMemberContract) => (
                      <li
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                        key={c.id}
                      >
                        <span className="min-w-0 truncate">{c.file_name}</span>
                        <Button
                          onClick={() => handleDeleteContract(c.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {t("deleteContract")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </section>

          <section className="space-y-2">
            <h2 className="font-medium text-lg">{t("personalStammdaten")}</h2>
            <Card variant="form">
              <FormField
                control={form.control}
                name="birth_date"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("birthDate")}</FormLabel>
                    <FormControl>
                      <DatePicker
                        onChange={field.onChange}
                        placeholder={t("pickDate")}
                        value={field.value ?? null}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="birth_place"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("birthPlace")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("nationality")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("gender")}</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v || null)}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              field.value === "male"
                                ? t("genderMale")
                                : field.value === "female"
                                  ? t("genderFemale")
                                  : field.value === "diverse"
                                    ? t("genderDiverse")
                                    : field.value === "other"
                                      ? t("genderOther")
                                      : t("selectStatus")
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="male">{t("genderMale")}</SelectItem>
                        <SelectItem value="female">
                          {t("genderFemale")}
                        </SelectItem>
                        <SelectItem value="diverse">
                          {t("genderDiverse")}
                        </SelectItem>
                        <SelectItem value="other">
                          {t("genderOther")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="marital_status"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("maritalStatus")}</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v || null)}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              field.value === "single"
                                ? t("maritalSingle")
                                : field.value === "married"
                                  ? t("maritalMarried")
                                  : field.value === "divorced"
                                    ? t("maritalDivorced")
                                    : field.value === "widowed"
                                      ? t("maritalWidowed")
                                      : field.value === "registered_partnership"
                                        ? t("maritalRegisteredPartnership")
                                        : t("selectStatus")
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="single">
                          {t("maritalSingle")}
                        </SelectItem>
                        <SelectItem value="married">
                          {t("maritalMarried")}
                        </SelectItem>
                        <SelectItem value="divorced">
                          {t("maritalDivorced")}
                        </SelectItem>
                        <SelectItem value="widowed">
                          {t("maritalWidowed")}
                        </SelectItem>
                        <SelectItem value="registered_partnership">
                          {t("maritalRegisteredPartnership")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="religion"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("religion")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="disability_degree"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("disabilityDegree")}</FormLabel>
                    <FormControl>
                      <Input
                        max={100}
                        min={0}
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        value={field.value == null ? "" : field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="social_security_number"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("socialSecurityNumber")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tax_id"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("taxId")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tax_class"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("taxClass")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="health_insurance"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("healthInsurance")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Card>
          </section>

          <section className="space-y-2">
            <h2 className="font-medium text-lg">{t("children")}</h2>
            <Card variant="form">
              <div className="space-y-4">
                {childFields.length === 0 ? (
                  <p className="py-2 text-muted-foreground text-sm">
                    {t("noChildren")}
                  </p>
                ) : (
                  <div className="divide-y divide-border/60">
                    {childFields.map((childField, index) => (
                      <div
                        className="flex flex-col gap-4 py-3 first:pt-0 last:pb-0"
                        key={childField.id}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-muted-foreground text-sm">
                            {t("children")} #{index + 1}
                          </h4>
                          <Button
                            className="h-8 px-2 text-destructive hover:text-destructive"
                            onClick={() => removeChild(index)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {t("remove")}
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <FormField
                            control={form.control}
                            name={`children.${index}.name`}
                            render={({ field: inputField }) => (
                              <FormItem>
                                <FormLabel>{t("childName")}</FormLabel>
                                <FormControl>
                                  <Input
                                    {...inputField}
                                    value={inputField.value ?? ""}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`children.${index}.birth_date`}
                            render={({ field: inputField }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>{t("childBirthDate")}</FormLabel>
                                <FormControl>
                                  <DatePicker
                                    onChange={inputField.onChange}
                                    placeholder={t("pickDate")}
                                    value={inputField.value ?? null}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-2">
                  <Button
                    onClick={() => appendChild({ name: "", birth_date: "" })}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("addChild")}
                  </Button>
                </div>
              </div>
            </Card>
          </section>

          <section className="space-y-2">
            <h2 className="font-medium text-lg">{t("bankConnection")}</h2>
            <Card variant="form">
              <FormField
                control={form.control}
                name="bank_name"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("bankName")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_iban"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("bankIban")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_bic"
                render={({ field }) => (
                  <FormItem variant="row">
                    <FormLabel>{t("bankBic")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Card>
          </section>
        </form>
      </Form>
    </TeamModulePageScroll>
  );
}
