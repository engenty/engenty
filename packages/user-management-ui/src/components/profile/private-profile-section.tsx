import { useTranslation } from "@engenty/i18n/ui";
import { Card, Input, Label } from "@engenty/ui-core";
import type { UseFormReturn } from "react-hook-form";
import type { UpdateUserProfileInput } from "../../lib/schemas.js";

interface PrivateProfileSectionProps {
  form: UseFormReturn<UpdateUserProfileInput>;
}

export function PrivateProfileSection({ form }: PrivateProfileSectionProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-2">
      <h2 className="font-medium text-lg">{t("profile.privateInfo")}</h2>
      <p className="text-muted-foreground text-sm">
        {t("profile.privateInfoDescription")}
      </p>
      <Card className="rounded-sm">
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-4">
            <Label className="w-32 text-sm" htmlFor="phone">
              {t("profile.phone")}
            </Label>
            <Input
              className="flex-1 rounded-sm"
              id="phone"
              type="tel"
              {...form.register("phone")}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
