import { getSupabaseAuthClient } from "@engenty/auth-ui";
import { Badge, Button, Card, Input, Label, Progress } from "@engenty/ui-core";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Eye, EyeOff, RefreshCw } from "lucide-react";
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
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const passwordStrength = (() => {
    const password = form.watch("newPassword") || "";
    let strength = 0;
    if (password.length >= 8) {
      strength += 25;
    }
    if (password.length >= 12) {
      strength += 25;
    }
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
      strength += 20;
    }
    if (/\d/.test(password)) {
      strength += 15;
    }
    if (/[^a-zA-Z0-9]/.test(password)) {
      strength += 15;
    }
    if (strength >= 75) {
      return { strength, label: "Strong", color: "bg-green-500" };
    }
    if (strength >= 50) {
      return { strength, label: "Medium", color: "bg-yellow-500" };
    }
    return { strength, label: "Weak", color: "bg-red-500" };
  })();

  const generatePassword = () => {
    const charset =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let value = "";
    for (let i = 0; i < 16; i += 1) {
      value += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    form.setValue("newPassword", value);
    form.setValue("confirmPassword", value);
    setShowNewPassword(true);
    setShowConfirmPassword(true);
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
      setShowNewPassword(false);
      setShowConfirmPassword(false);
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
        <div className="flex-1 space-y-2">
          <div className="relative">
            <Input
              className="rounded-sm pr-20"
              id="new_password"
              type={showNewPassword ? "text" : "password"}
              {...form.register("newPassword")}
            />
            <div className="absolute top-0 right-0 flex h-full items-center gap-1 pr-1">
              <Button
                className="h-8 w-8"
                onClick={generatePassword}
                size="icon"
                type="button"
                variant="ghost"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                className="h-8 w-8"
                onClick={() => setShowNewPassword((prev) => !prev)}
                size="icon"
                type="button"
                variant="ghost"
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          {form.watch("newPassword") && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Progress
                  className="h-2 flex-1"
                  value={passwordStrength.strength}
                />
                <Badge
                  className={`${passwordStrength.color} border-0 text-white`}
                  variant="outline"
                >
                  {passwordStrength.label}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Label className="w-32 text-sm" htmlFor="confirm_password">
          Confirm Password
        </Label>
        <div className="relative flex-1">
          <Input
            className="rounded-sm pr-10"
            id="confirm_password"
            type={showConfirmPassword ? "text" : "password"}
            {...form.register("confirmPassword")}
          />
          <Button
            className="absolute top-0 right-0 h-full px-3"
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            size="icon"
            type="button"
            variant="ghost"
          >
            {showConfirmPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
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
