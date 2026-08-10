import { getSupabaseAuthClient } from "@engenty/auth-ui";
import { Button, Card, Label, PasswordInput } from "@engenty/ui-core";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { updateTenantUserPassword } from "../../lib/user-management-api.js";

const passwordSchema = z
  .object({
    newPassword: z.string().min(6),
    confirmPassword: z.string().min(6),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

interface ChangePasswordSectionProps {
  /** When true, renders form only (no Card/heading) for embedding in modal or inline */
  embedded?: boolean;
  /** Called when password is successfully changed (e.g. to close a parent dialog) */
  onSuccess?: () => void;
  userId: string;
}

export function ChangePasswordSection({
  userId,
  embedded = false,
  onSuccess,
}: ChangePasswordSectionProps) {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const setPasswordField = (
    key: "newPassword" | "confirmPassword",
    value: string
  ) => {
    form.setValue(key, value, { shouldValidate: true, shouldDirty: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const supabase = getSupabaseAuthClient();
      const { data } = await supabase.auth.getSession();
      const sessionUserId = data.session?.user?.id;
      if (!sessionUserId) {
        throw new Error("Not authenticated.");
      }
      if (sessionUserId === userId) {
        const { error } = await supabase.auth.updateUser({
          password: values.newPassword,
        });
        if (error) {
          throw new Error(error.message);
        }
      } else {
        await updateTenantUserPassword(userId, values.newPassword);
      }
      form.reset({ newPassword: "", confirmPassword: "" });
      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to update password."
      );
    } finally {
      setSubmitting(false);
    }
  });

  const formContent = (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div className="flex items-center gap-4">
        <Label className="w-32 text-sm" htmlFor="new_password">
          New Password
        </Label>
        <div className="flex-1">
          <PasswordInput
            className="rounded-sm"
            id="new_password"
            onChange={(e) => setPasswordField("newPassword", e.target.value)}
            onGenerate={(next) => setPasswordField("confirmPassword", next)}
            value={form.watch("newPassword")}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Label className="w-32 text-sm" htmlFor="confirm_password">
          Confirm Password
        </Label>
        <div className="flex-1">
          <PasswordInput
            className="rounded-sm"
            id="confirm_password"
            onChange={(e) =>
              setPasswordField("confirmPassword", e.target.value)
            }
            showGenerate={false}
            showStrength={false}
            value={form.watch("confirmPassword")}
          />
        </div>
      </div>
      {submitError ? (
        <p className="text-destructive text-sm" role="alert">
          {submitError}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2 pt-2">
        {success && (
          <button
            className="text-muted-foreground text-sm hover:underline"
            onClick={() => setSuccess(false)}
            type="button"
          >
            Change again
          </button>
        )}
        <Button disabled={submitting || success} type="submit">
          {success ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Password changed
            </>
          ) : submitting ? (
            "Saving..."
          ) : (
            "Change Password"
          )}
        </Button>
      </div>
    </form>
  );

  if (embedded) {
    return formContent;
  }

  return (
    <div className="space-y-2">
      <h2 className="font-medium text-lg">Change Password</h2>
      <Card className="rounded-sm">
        <div className="p-4">{formContent}</div>
      </Card>
    </div>
  );
}
