import { useTranslation } from "@engenty/i18n/ui";
import {
  TeamMemberDetailHeader,
  useTeamMemberDetailPageQuery,
  useTeamMemberDetailTabNav,
  useTeamModuleSecondaryShellNav,
  useVisibleTeamMemberDetailTabs,
} from "@engenty/team/ui";
import {
  Button,
  Card,
  DetailPageHeader,
  Skeleton,
  Tabs,
} from "@engenty/ui-core";
import { useFeatureFlags, usePageConfig } from "@engenty/ui-plugin-sdk";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTeamMemberContractsQuery } from "../contract-queries.js";
import { useEmployeeQuery } from "../employee-queries.js";
import { WorkingHoursDialog } from "../employment-time/working-hours-dialog.js";
import {
  type EmployeeWorkingHours,
  useDeleteWorkingHoursMutation,
  useUpsertWorkingHoursMutation,
  useWorkingHoursQuery,
} from "../employment-time-queries.js";

function getAge(birthDateStr: string | null): number | null {
  if (!birthDateStr) {
    return null;
  }
  const birthDate = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "employmentFullTime",
  part_time: "employmentPartTime",
  freelancer: "employmentFreelancer",
  contractor: "employmentContractor",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-40 shrink-0 text-muted-foreground text-sm sm:w-56">
        {label}
      </span>
      <span className="flex-1 text-sm">{value ?? "-"}</span>
    </div>
  );
}

export function TeamMemberHrDetailPage() {
  const { t, i18n } = useTranslation("team");
  const isDe = i18n.language === "de";
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const shellNav = useTeamModuleSecondaryShellNav();
  const detailQuery = useTeamMemberDetailPageQuery(id ?? null);
  const profileMember = detailQuery.data?.member ?? null;
  // HR fields come from team-hr's employee record; profile fields win on overlap
  // (notably `id`, which must stay the profile id, not the employee row id).
  const employee = useEmployeeQuery(id ?? null).data;
  const member = useMemo(
    () =>
      profileMember ? { ...(employee ?? {}), ...profileMember } : profileMember,
    [profileMember, employee]
  );
  const contracts = useTeamMemberContractsQuery(id ?? null).data ?? [];
  const loading = detailQuery.isLoading;

  const workingHoursQuery = useWorkingHoursQuery(id ?? "");
  const workingHours = workingHoursQuery.data || [];

  const upsertWhMutation = useUpsertWorkingHoursMutation(id ?? "");
  const deleteWhMutation = useDeleteWorkingHoursMutation(id ?? "");

  const [isWHOpen, setIsWHOpen] = useState(false);
  const [selectedWH, setSelectedWH] = useState<EmployeeWorkingHours | null>(
    null
  );

  const handleAddWH = () => {
    setSelectedWH(null);
    setIsWHOpen(true);
  };

  const handleEditWH = (record: EmployeeWorkingHours) => {
    setSelectedWH(record);
    setIsWHOpen(true);
  };

  const handleDeleteWH = async (whId: string) => {
    // biome-ignore lint/suspicious/noAlert: standard native confirm dialog is acceptable here
    const confirmed = window.confirm(
      isDe
        ? "Möchten Sie diese Soll-Arbeitszeit wirklich löschen?"
        : "Are you sure you want to delete this working hours schedule?"
    );
    if (confirmed) {
      try {
        await deleteWhMutation.mutateAsync(whId);
        toast.success(isDe ? "Erfolgreich gelöscht." : "Successfully deleted.");
      } catch {
        toast.error(isDe ? "Fehler beim Löschen." : "Failed to delete.");
      }
    }
  };

  const handleSaveWH = async (record: EmployeeWorkingHours) => {
    try {
      await upsertWhMutation.mutateAsync(record);
      toast.success(isDe ? "Erfolgreich gespeichert." : "Successfully saved.");
    } catch {
      toast.error(isDe ? "Fehler beim Speichern." : "Failed to save.");
    }
  };

  const { resolved: featureFlags, isLoading: flagsLoading } = useFeatureFlags();
  const isHrEnabled = featureFlags?.["team.hr.enabled"] === true;
  const visibleTabs = useVisibleTeamMemberDetailTabs();
  const { activeTab, onTabChange: handleTabChange } = useTeamMemberDetailTabNav(
    id,
    visibleTabs
  );

  const memberName = member?.full_name ?? t("menu");
  const breadcrumbs = useMemo(
    () => [
      ...(shellNav.moduleRootCrumb ? [shellNav.moduleRootCrumb] : []),
      { label: memberName, to: id ? `/mdl/team/${id}` : "/mdl/team" },
      { label: "HR" },
    ],
    [shellNav.moduleRootCrumb, memberName, id]
  );

  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-1.5">
        <Button onClick={() => navigate(`/mdl/team/${id}/hr/edit`)} size="sm">
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          {t("edit")}
        </Button>
      </div>
    ),
    [navigate, id, t]
  );

  usePageConfig({
    breadcrumbs,
    actions: pageActions,
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    // Float the transparent topbar over the white header so the two blend.
    topbarOverlap: true,
  });

  if (flagsLoading || loading) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <DetailPageHeader
          description={<Skeleton className="h-4 w-32" />}
          media={<Skeleton className="h-16 w-16 rounded-full" />}
          title={<Skeleton className="h-7 w-48" />}
        />
      </div>
    );
  }

  // Feature gate redirect
  if (!isHrEnabled) {
    return <Navigate replace to={id ? `/mdl/team/${id}` : "/mdl/team"} />;
  }

  if (!member) {
    return (
      <p className="p-page text-muted-foreground text-sm">{t("notFound")}</p>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Tabs
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        onValueChange={handleTabChange}
        value={activeTab}
      >
        <TeamMemberDetailHeader member={member} visibleTabs={visibleTabs} />

        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
          <div className="mx-auto w-full max-w-5xl space-y-6">
            <section className="space-y-2">
              <h2 className="font-medium text-lg">{t("employmentInfo")}</h2>
              <Card variant="form">
                <div className="space-y-2">
                  <Row
                    label={t("employeeNumber")}
                    value={member.employee_number}
                  />
                  <Row label={t("jobTitle")} value={member.job_title} />
                  <Row
                    label={t("employmentStatus")}
                    value={
                      member.employment_status
                        ? t(
                            EMPLOYMENT_LABELS[member.employment_status] ??
                              member.employment_status
                          )
                        : null
                    }
                  />
                  <Row
                    label={t("weeklyHours")}
                    value={
                      member.weekly_hours == null
                        ? null
                        : `${member.weekly_hours} h`
                    }
                  />
                  <Row
                    label="Jurisdiction (Country)"
                    value={member.jurisdiction}
                  />
                  <Row
                    label="Vacation Entitlement"
                    value={
                      member.vacation_entitlement_yearly == null
                        ? null
                        : `${member.vacation_entitlement_yearly} days`
                    }
                  />
                  <Row
                    label="Vacation Carryover"
                    value={
                      member.vacation_carryover == null
                        ? null
                        : `${member.vacation_carryover} days`
                    }
                  />
                  <Row
                    label="Overtime Starting Balance"
                    value={
                      member.overtime_starting_balance == null
                        ? null
                        : `${member.overtime_starting_balance} hours`
                    }
                  />
                  <Row label={t("einstufung")} value={member.einstufung} />
                  <Row label={t("startDate")} value={member.start_date} />
                  <Row label={t("endDate")} value={member.end_date} />
                </div>
              </Card>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-lg">
                  {isDe
                    ? "Normalarbeitszeit (Soll-Zeiten)"
                    : "Regular Working Hours"}
                </h2>
                <Button
                  className="h-8 gap-1 font-semibold text-xs"
                  onClick={handleAddWH}
                  size="xs"
                  variant="outline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {isDe ? "Hinzufügen" : "Add"}
                </Button>
              </div>
              <Card variant="form">
                {workingHours.length === 0 ? (
                  <p className="py-1 text-muted-foreground text-sm italic">
                    {isDe
                      ? "Keine Soll-Arbeitszeiten hinterlegt."
                      : "No working hours schedules set."}
                  </p>
                ) : (
                  <div className="divide-y divide-border/40">
                    {workingHours.map((wh) => {
                      const start = wh.start_date;
                      const end =
                        wh.end_date || (isDe ? "Offen" : "Open-ended");
                      const active =
                        !wh.end_date ||
                        (new Date(wh.start_date) <= new Date() &&
                          new Date(wh.end_date) >= new Date());

                      const workdays = Object.keys(wh.schedule || {}).filter(
                        (day) => wh.schedule[day]?.enabled
                      );

                      return (
                        <div
                          className="flex items-center justify-between py-3 first:pt-1 last:pb-1"
                          key={wh.id}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">
                                {start} – {end}
                              </span>
                              {active && (
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-bold text-[10px] text-emerald-500 uppercase">
                                  {isDe ? "Aktiv" : "Active"}
                                </span>
                              )}
                            </div>
                            <div className="font-medium text-muted-foreground text-xs">
                              {wh.weekly_hours} h/Woche • {workdays.length}{" "}
                              Arbeitstage
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => handleEditWH(wh)}
                              size="icon"
                              variant="ghost"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive/90"
                              onClick={() => handleDeleteWH(wh.id || "")}
                              size="icon"
                              variant="ghost"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </section>

            <section className="space-y-2">
              <h2 className="font-medium text-lg">{t("personalStammdaten")}</h2>
              <Card variant="form">
                <div className="space-y-2">
                  <Row label={t("birthDate")} value={member.birth_date} />
                  <Row label={t("birthPlace")} value={member.birth_place} />
                  <Row label={t("nationality")} value={member.nationality} />
                  <Row
                    label={t("gender")}
                    value={
                      member.gender
                        ? t(
                            member.gender === "male"
                              ? "genderMale"
                              : member.gender === "female"
                                ? "genderFemale"
                                : member.gender === "diverse"
                                  ? "genderDiverse"
                                  : "genderOther"
                          )
                        : null
                    }
                  />
                  <Row
                    label={t("maritalStatus")}
                    value={
                      member.marital_status
                        ? t(
                            member.marital_status === "single"
                              ? "maritalSingle"
                              : member.marital_status === "married"
                                ? "maritalMarried"
                                : member.marital_status === "divorced"
                                  ? "maritalDivorced"
                                  : member.marital_status === "widowed"
                                    ? "maritalWidowed"
                                    : "maritalRegisteredPartnership"
                          )
                        : null
                    }
                  />
                  <Row label={t("religion")} value={member.religion} />
                  <Row
                    label={t("disabilityDegree")}
                    value={
                      member.disability_degree == null
                        ? null
                        : `${member.disability_degree}%`
                    }
                  />
                  <Row
                    label={t("socialSecurityNumber")}
                    value={member.social_security_number}
                  />
                  <Row label={t("taxId")} value={member.tax_id} />
                  <Row label={t("taxClass")} value={member.tax_class} />
                  <Row
                    label={t("healthInsurance")}
                    value={member.health_insurance}
                  />
                </div>
              </Card>
            </section>

            <section className="space-y-2">
              <h2 className="font-medium text-lg">{t("children")}</h2>
              <Card variant="form">
                <div className="space-y-2">
                  {!member.children || member.children.length === 0 ? (
                    <p className="py-1 text-muted-foreground text-sm">
                      {t("noChildren")}
                    </p>
                  ) : (
                    member.children.map((child, index) => {
                      const age = getAge(child.birth_date);
                      return (
                        <div
                          className="flex items-center gap-4 text-sm"
                          key={index}
                        >
                          <span className="w-40 shrink-0 text-muted-foreground sm:w-56">
                            {t("children")} #{index + 1}
                          </span>
                          <span className="flex-1">
                            {child.name ? `${child.name} ` : ""}
                            <span className="text-muted-foreground">
                              ({t("birthDate")}: {child.birth_date}
                              {age === null
                                ? ""
                                : `, ${age} ${t("years", { defaultValue: "years" })}`}
                              )
                            </span>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            </section>

            <section className="space-y-2">
              <h2 className="font-medium text-lg">{t("bankConnection")}</h2>
              <Card variant="form">
                <div className="space-y-2">
                  <Row label={t("bankName")} value={member.bank_name} />
                  <Row label={t("bankIban")} value={member.bank_iban} />
                  <Row label={t("bankBic")} value={member.bank_bic} />
                </div>
              </Card>
            </section>

            <section className="space-y-2">
              <h2 className="font-medium text-lg">{t("contracts")}</h2>
              <Card variant="form">
                {contracts.length === 0 ? (
                  <p className="py-1 text-muted-foreground text-sm">
                    {t("noContracts", {
                      defaultValue: "No contracts uploaded.",
                    })}
                  </p>
                ) : (
                  <ul className="space-y-1 text-muted-foreground text-sm">
                    {contracts.map((c) => (
                      <li key={c.id}>{c.file_name}</li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          </div>
        </div>
      </Tabs>

      {id && (
        <WorkingHoursDialog
          onOpenChange={setIsWHOpen}
          onSave={handleSaveWH}
          open={isWHOpen}
          profileId={id}
          record={selectedWH}
        />
      )}
    </div>
  );
}
