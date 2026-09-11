import { useTranslation } from "@engenty/i18n/ui";
import { Input, Label, SettingsFormSection } from "@engenty/ui-core";
import type { UseFormReturn } from "react-hook-form";
import type { UpdateUserProfileInput } from "../../lib/schemas.js";

interface PrivateProfileSectionProps {
  form: UseFormReturn<UpdateUserProfileInput>;
}

export function PrivateProfileSection({ form }: PrivateProfileSectionProps) {
  const { t } = useTranslation("common");

  return (
    <SettingsFormSection
      cardClassName="space-y-3"
      cardVariant="compact"
      description={t("profile.privateInfoDescription")}
      title={t("profile.privateInfo")}
    >
      <div className="flex items-center gap-4">
        <Label className="w-32 shrink-0 text-sm" htmlFor="phone">
          {t("profile.phone")}
        </Label>
        <Input
          className="flex-1 rounded-sm"
          id="phone"
          type="tel"
          {...form.register("phone")}
        />
      </div>
    </SettingsFormSection>
  );
}
