import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useParams } from "react-router-dom";
import type { z } from "zod";
import { AccessLevelSection } from "../components/profile/access-level-section.js";
import { ChangePasswordSection } from "../components/profile/change-password-section.js";
import { PrivateProfileSection } from "../components/profile/private-profile-section.js";
import { PublicProfileSection } from "../components/profile/public-profile-section.js";
import { type UserRecord, updateUserProfileSchema } from "../lib/schemas.js";
import { listUsers, updateUserProfile } from "../lib/user-management-api.js";

type UpdateProfileFormValues = z.infer<typeof updateUserProfileSchema>;

export function UserEditPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<UserRecord | null>(null);
  const [saving, setSaving] = useState(false);
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

  const title = useMemo(
    () => member?.display_name ?? "User",
    [member?.display_name]
  );
  const hasChanges =
    form.formState.isDirty || role !== (member?.role ?? "member");

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
    () => [{ label: "Users", to: "/admin/users" }, { label: title }],
    [title]
  );

  usePageConfig({
    breadcrumbs,
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

      <PublicProfileSection form={form} />
      <PrivateProfileSection form={form} />
      <AccessLevelSection onRoleChange={setRole} role={role} />
      <ChangePasswordSection userId={id} />
    </div>
  );
}
