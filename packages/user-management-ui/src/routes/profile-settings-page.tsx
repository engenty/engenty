import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AuthenticationSection } from "../components/profile/authentication-section.js";
import { PreferredAppearanceSection } from "../components/profile/preferred-appearance-section.js";
import { PrivateProfileSection } from "../components/profile/private-profile-section.js";
import { PublicProfileSection } from "../components/profile/public-profile-section.js";
import { type UserRecord, updateUserProfileSchema } from "../lib/schemas.js";
import { listUsers, updateUserProfile } from "../lib/user-management-api.js";

type UpdateProfileFormValues = z.infer<typeof updateUserProfileSchema>;

export function ProfileSettingsPage() {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));
  const { session } = useCoreAuthSession();
  const userId = session?.user?.id;
  const [member, setMember] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferredAppearanceDirty, setPreferredAppearanceDirty] =
    useState(false);
  const preferredAppearanceSaveRef = useRef<(() => Promise<void>) | null>(null);
  const form = useForm({
    resolver: zodResolver(updateUserProfileSchema),
    defaultValues: {
      display_name: "",
      initials: "",
      phone: "",
    },
  });
  const resetForm = form.reset;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listUsers()
      .then((rows) => {
        const found = rows.find((row) => row.id === userId) ?? null;
        setMember(found);
        if (found) {
          resetForm({
            display_name: found.display_name,
            initials: found.initials ?? "",
            phone: found.phone ?? "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, [userId, resetForm]);

  const handleSave = useCallback(
    async (values: UpdateProfileFormValues) => {
      if (!userId) {
        return;
      }
      setSaving(true);
      try {
        if (form.formState.isDirty) {
          await updateUserProfile(userId, values);
          resetForm(values);
          setMember((current) =>
            current
              ? {
                  ...current,
                  ...values,
                }
              : current
          );
          window.dispatchEvent(new CustomEvent("profile-updated"));
        }
        if (preferredAppearanceDirty && preferredAppearanceSaveRef.current) {
          await preferredAppearanceSaveRef.current();
          setPreferredAppearanceDirty(false);
        }
      } finally {
        setSaving(false);
      }
    },
    [form.formState.isDirty, preferredAppearanceDirty, resetForm, userId]
  );

  const hasChanges = form.formState.isDirty || preferredAppearanceDirty;
  const pageActions = (
    <Button
      disabled={saving || !hasChanges}
      onClick={form.handleSubmit(handleSave)}
      size="sm"
    >
      {saving ? "Saving..." : "Save"}
    </Button>
  );

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("menu.profile") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    breadcrumbs,
    actions: loading || !member ? null : pageActions,
    topbarChrome: "contentBlend",
    secondaryNavHeaderSlot,
  });

  if (loading) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-6 p-page text-muted-foreground text-sm">
          Loading profile...
        </div>
      </div>
    );
  }
  if (!(userId && member)) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-6 p-page text-muted-foreground text-sm">
          No profile available.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-6 p-page">
        <h1 className="font-semibold text-xl">My Profile</h1>

        <AuthenticationSection userId={userId} />
        <PublicProfileSection form={form} />
        <PrivateProfileSection form={form} />
        <PreferredAppearanceSection
          deferSave
          onDirtyChange={setPreferredAppearanceDirty}
          saveRef={preferredAppearanceSaveRef}
        />
      </div>
    </div>
  );
}
