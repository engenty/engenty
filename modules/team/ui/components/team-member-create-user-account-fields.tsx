import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  PasswordInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@engenty/ui-core";
import type { Control } from "react-hook-form";
import type { TeamMemberCreateFormValues } from "../lib/team-member-create-form-schema.js";

interface TeamMemberCreateUserAccountFieldsProps {
  control: Control<TeamMemberCreateFormValues>;
  createUserAccount: boolean;
  t: (key: string) => string;
}

export function TeamMemberCreateUserAccountFields({
  control,
  createUserAccount,
  t,
}: TeamMemberCreateUserAccountFieldsProps) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <FormField
        control={control}
        name="create_user_account"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between space-y-0 border-0 p-0">
            <div className="space-y-0.5">
              <FormLabel className="text-base">
                {t("createUserAccount")}
              </FormLabel>
              <p className="text-muted-foreground text-sm">
                {t("createUserAccountDescription")}
              </p>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
      {createUserAccount ? (
        <div className="space-y-4 border-t pt-2">
          <FormField
            control={control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("password")}</FormLabel>
                <FormControl>
                  <PasswordInput
                    labels={{
                      generate: t("passwordGenerate"),
                      hide: t("passwordHide"),
                      medium: t("passwordStrengthMedium"),
                      show: t("passwordShow"),
                      strong: t("passwordStrengthStrong"),
                      weak: t("passwordStrengthWeak"),
                    }}
                    placeholder={t("passwordPlaceholder")}
                    {...field}
                  />
                </FormControl>
                <p className="text-muted-foreground text-xs">
                  {t("passwordHint")}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="invite_role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("userRole")}</FormLabel>
                <Select
                  onValueChange={(v) =>
                    field.onChange(
                      v as TeamMemberCreateFormValues["invite_role"]
                    )
                  }
                  value={field.value ?? "member"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue>
                        {(field.value ?? "member") === "admin"
                          ? t("roleAdmin")
                          : t("roleMember")}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="member">{t("roleMember")}</SelectItem>
                    <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
