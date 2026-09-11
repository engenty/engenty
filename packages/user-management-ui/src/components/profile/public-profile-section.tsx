import { Input, Label, SettingsFormSection } from "@engenty/ui-core";
import type { UseFormReturn } from "react-hook-form";
import type { UpdateUserProfileInput } from "../../lib/schemas.js";

interface PublicProfileSectionProps {
  form: UseFormReturn<UpdateUserProfileInput>;
}

export function PublicProfileSection({ form }: PublicProfileSectionProps) {
  return (
    <SettingsFormSection
      cardClassName="space-y-3"
      cardVariant="compact"
      description="This information will be visible to all users in the app."
      title="Public Profile Info"
    >
      <div className="flex items-center gap-4">
        <Label className="w-32 shrink-0 text-sm" htmlFor="display_name">
          Name
        </Label>
        <Input
          className="flex-1 rounded-sm"
          id="display_name"
          {...form.register("display_name")}
        />
      </div>
      <div className="flex items-center gap-4">
        <Label className="w-32 shrink-0 text-sm" htmlFor="initials">
          Initials
        </Label>
        <div className="relative w-24">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground text-sm">
            @
          </span>
          <Input
            className="w-24 rounded-sm pl-7"
            id="initials"
            maxLength={4}
            {...form.register("initials")}
          />
        </div>
      </div>
    </SettingsFormSection>
  );
}
