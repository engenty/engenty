import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import {
  isImpersonating,
  startImpersonation,
  useCoreAuthSession,
} from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { Button } from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import type { z } from "zod";
import { AccessLevelSection } from "../components/profile/access-level-section.js";
import { ChangePasswordSection } from "../components/profile/change-password-section.js";
import { PrivateProfileSection } from "../components/profile/private-profile-section.js";
import { PublicProfileSection } from "../components/profile/public-profile-section.js";
import { type UserRecord, updateUserProfileSchema } from "../lib/schemas.js";
import { listUsers, updateUserProfile } from "../lib/user-management-api.js";
import { USERS_PATH } from "../users-paths.js";

type UpdateProfileFormValues = z.infer<typeof updateUserProfileSchema>;

export function UserEditPage() {
  const { t } = useTranslation("common");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useCoreAuthSession();
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));
  const { isSuperAdmin, currentUserId } = useWorkspaceContext();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<UserRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [loggingInAs, setLoggingInAs] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "member">("member");
  const form = useForm({
    resolver: zodResolver(updateUserProfileSchema),
    defaultValues: {
      display_name: "",
      initials: "",
      phone: "",
    },
  });
  const resetForm = form.reset;

  const showLoginAs =
    isSuperAdmin &&
    !isImpersonating() &&
    Boolean(id) &&
    id !== (currentUserId ?? session?.user?.id ?? null);

  useEffect(() => {
    if (!id) {
      return;
    }
    setLoading(true);
    listUsers()
      .then((rows) => {
        const found = rows.find((row) => row.id === id) ?? null;
        setMember(found);
        if (found) {
          setRole(found.role);
          resetForm({
            display_name: found.display_name,
            initials: found.initials ?? "",
            phone: found.phone ?? "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, [id, resetForm]);

  const handleSave = useCallback(
    async (values: UpdateProfileFormValues) => {
      if (!id) {
        return;
      }
      setSaving(true);
      setActionError(null);
      try {
        await updateUserProfile(id, { ...values, role });
        resetForm(values);
        setMember((current) =>
          current
            ? {
                ...current,
                ...values,
                role,
              }
            : current
        );
      } finally {
        setSaving(false);
      }
    },
    [id, resetForm, role]
  );

  const handleLoginAs = useCallback(async () => {
    if (!id) {
      return;
    }
    setLoggingInAs(true);
    setActionError(null);
    try {
      await startImpersonation(id);
      await queryClient.invalidateQueries();
      navigate("/");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to login as user."
      );
    } finally {
      setLoggingInAs(false);
    }
  }, [id, navigate, queryClient]);

  const title = useMemo(
    () => member?.display_name ?? "User",
    [member?.display_name]
  );
  const hasChanges =
    form.formState.isDirty || role !== (member?.role ?? "member");

  const pageActions = (
    <div className="flex items-center gap-2">
      {showLoginAs ? (
        <Button
          disabled={loggingInAs}
          onClick={() => {
            void handleLoginAs();
          }}
          size="sm"
          variant="outline"
        >
          <LogIn className="mr-1.5 size-3.5" />
          {loggingInAs ? "…" : t("usersTable.loginAs")}
        </Button>
      ) : null}
      <Button
        disabled={saving || !hasChanges}
        onClick={form.handleSubmit(handleSave)}
        size="sm"
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("menu.users"), to: USERS_PATH },
      { label: title },
    ],
    [moduleRootCrumb, t, title]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavHeaderSlot,
    actions: loading || !member ? null : pageActions,
  });

  if (loading) {
    return (
      <div className="p-4 text-muted-foreground text-sm">
        Loading profile...
      </div>
    );
  }
  if (!(id && member)) {
    return (
      <div className="p-4 text-muted-foreground text-sm">User not found.</div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="font-semibold text-xl">{title}</h1>
      {actionError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {actionError}
        </div>
      ) : null}

      <PublicProfileSection form={form} />
      <PrivateProfileSection form={form} />
      <AccessLevelSection onRoleChange={setRole} role={role} />
      <ChangePasswordSection userId={id} />
    </div>
  );
}
