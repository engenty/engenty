import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import {
  Button,
  Card,
  CardSection,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Skeleton,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { patchTeamOrgNode, type TeamMemberListItem } from "../api.js";
import { TeamMemberConnectUserSection } from "../components/team-member-connect-user-section.js";
import {
  LOCATION_NONE,
  TeamMemberEditBaseInfoSection,
} from "../components/team-member-edit-base-info-section.js";
import { TeamMemberProfileImageField } from "../components/team-member-profile-image-field.js";
import { ROLE_NONE } from "../components/team-member-role-field.js";
import { TeamModulePageScroll } from "../components/team-module-page-scroll.js";
import { useTeamModuleSecondaryShellNav } from "../hooks/use-team-module-secondary-shell-nav.js";
import {
  pickerValueFromReportsToId,
  reportsToIdFromPickerValue,
} from "../lib/team-manager-picker.js";
import {
  type TeamProfileNameFormFields,
  teamProfileNameFormFieldsFromMember,
  teamProfileNamePayloadFromForm,
} from "../lib/team-profile-name-form.js";
import {
  teamMemberKeys,
  useTeamMemberDetailPageQuery,
  useUpdateTeamMemberMutation,
} from "../queries.js";
import { teamModuleKeys } from "../team-module-queries.js";

const editSchema = z
  .object({
    initials: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    role_term_id: z.string(),
    location_term_id: z.string(),
    reports_to_id: z.string(),
    position: z.string().nullable(),
    department: z.string().nullable(),
    location: z.string().nullable(),
  })
  .and(
    z.object({
      name_prefix: z.string(),
      first_name: z.string(),
      middle_name: z.string(),
      last_name: z.string().min(1),
      name_suffix: z.string(),
      phonetic_name: z.string(),
      birth_name: z.string(),
      custom_display_name: z.boolean(),
      full_name_override: z.string(),
    })
  );

type EditFormValues = z.infer<typeof editSchema>;

function memberToFormValues(m: TeamMemberListItem): EditFormValues {
  return {
    ...teamProfileNameFormFieldsFromMember(m),
    initials: m.initials ?? null,
    phone: m.phone ?? null,
    email: m.email ?? null,
    role_term_id: m.role_term_id ?? ROLE_NONE,
    location_term_id: m.location_term_id ?? LOCATION_NONE,
    reports_to_id: pickerValueFromReportsToId(m.reports_to_id),
    position: m.position ?? null,
    department: m.department ?? null,
    location: m.location ?? null,
  };
}

function formValuesToPatch(
  values: EditFormValues
): Partial<TeamMemberListItem> & {
  role_term_id?: string;
  location_term_id?: string;
} {
  const namePayload = teamProfileNamePayloadFromForm(values);
  return {
    ...namePayload.parts,
    full_name: namePayload.full_name,
    initials: values.initials ?? null,
    phone: values.phone ?? null,
    email: values.email ?? null,
    role_term_id: values.role_term_id === ROLE_NONE ? "" : values.role_term_id,
    location_term_id:
      values.location_term_id === LOCATION_NONE ? "" : values.location_term_id,
    position: values.position ?? null,
    department: values.department ?? null,
    location: values.location ?? null,
  };
}

export function TeamMemberEditPage() {
  const { t } = useTranslation("team");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loaded, setLoaded] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const shellNav = useTeamModuleSecondaryShellNav();
  const detailQuery = useTeamMemberDetailPageQuery(id ?? null);
  const updateMutation = useUpdateTeamMemberMutation(id ?? "");
  const member = detailQuery.data?.member ?? null;
  const loading = detailQuery.isLoading;

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      ...teamProfileNameFormFieldsFromMember({
        full_name: "",
        name_prefix: null,
        first_name: null,
        middle_name: null,
        last_name: null,
        name_suffix: null,
        phonetic_name: null,
        birth_name: null,
        full_name_override: null,
      }),
      initials: null,
      phone: null,
      email: null,
      role_term_id: ROLE_NONE,
      location_term_id: LOCATION_NONE,
      reports_to_id: pickerValueFromReportsToId(null),
      position: null,
      department: null,
      location: null,
    },
  });

  useEffect(() => {
    if (!detailQuery.data || loaded) {
      return;
    }
    form.reset(memberToFormValues(detailQuery.data.member));
    setApiError(null);
    setLoaded(true);
  }, [detailQuery.data, loaded, form.reset]);

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
        await updateMutation.mutateAsync(formValuesToPatch(values));
        const orgNodeId = member?.org_node_id;
        const nextReportsTo = reportsToIdFromPickerValue(values.reports_to_id);
        const prevReportsTo = member?.reports_to_id ?? null;
        if (orgNodeId && nextReportsTo !== prevReportsTo) {
          await patchTeamOrgNode(orgNodeId, { reports_to_id: nextReportsTo });
          await queryClient.invalidateQueries({
            queryKey: teamModuleKeys.orgTree(),
          });
          await queryClient.invalidateQueries({
            queryKey: teamMemberKeys.detailPage(id),
          });
        }
        form.reset(values);
        navigate(`/mdl/team/${id}`);
      } catch (err: unknown) {
        setApiError(err instanceof Error ? err.message : t("saveFailed"));
      }
    },
    [form, id, member, navigate, queryClient, t, updateMutation]
  );

  const isDirty = form.formState.isDirty;

  const breadcrumbs = useMemo(
    () => [
      ...(shellNav.moduleRootCrumb ? [shellNav.moduleRootCrumb] : []),
      {
        label: member?.full_name || t("menu"),
        to: id ? `/mdl/team/${id}` : "/mdl/team",
      },
    ],
    [shellNav.moduleRootCrumb, id, member]
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

  if (loading) {
    return (
      <TeamModulePageScroll>
        <section className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-96" />
          <Card variant="form">
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div className="flex items-center gap-4" key={i}>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 flex-1" />
                </div>
              ))}
            </div>
          </Card>
        </section>
        <section className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-80" />
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
          <TeamMemberEditBaseInfoSection
            control={form.control}
            excludeProfileId={id ?? ""}
            onApplyNameSplit={(parts) => {
              for (const [key, value] of Object.entries(parts)) {
                form.setValue(
                  key as keyof TeamProfileNameFormFields,
                  value as string,
                  { shouldDirty: true }
                );
              }
            }}
            splitSourceLabel={member?.full_name}
            t={t}
          />

          {member && (
            <TeamMemberConnectUserSection
              currentEmail={member.email}
              currentUserId={member.user_id}
              memberId={member.id}
              onLinked={async () => {
                await queryClient.invalidateQueries({
                  queryKey: teamMemberKeys.detailPage(id ?? ""),
                });
              }}
              t={t}
            />
          )}

          <CardSection
            description={t("publicProfileDescription")}
            title={t("publicProfileInfo")}
          >
            {member && id && (
              <TeamMemberProfileImageField
                fullName={member.full_name}
                initials={form.watch("initials") ?? null}
                onChange={async (storageKey) => {
                  await updateMutation.mutateAsync({
                    profile_image_storage_key: storageKey,
                  });
                  await queryClient.invalidateQueries({
                    queryKey: teamMemberKeys.detailPage(id),
                  });
                }}
                profileId={id}
                storageKey={member.profile_image_storage_key ?? null}
              />
            )}

            <FormField
              control={form.control}
              name="initials"
              render={({ field }) => (
                <FormItem variant="row">
                  <FormLabel>{t("initials")}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem variant="row">
                  <FormLabel>{t("phone")}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem variant="row">
                  <FormLabel>{t("position")}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem variant="row">
                  <FormLabel>{t("department")}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardSection>
        </form>
      </Form>
    </TeamModulePageScroll>
  );
}
