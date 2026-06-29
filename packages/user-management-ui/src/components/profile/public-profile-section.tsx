import { Card, Input, Label } from "@engenty/ui-core";
import type { UseFormReturn } from "react-hook-form";
import type { UpdateProfileInput } from "../../lib/schemas.js";

interface PublicProfileSectionProps {
  form: UseFormReturn<UpdateProfileInput>;
}

export function PublicProfileSection({ form }: PublicProfileSectionProps) {
  return (
    <div className="space-y-2">
      <h2 className="font-medium text-lg">Public Profile Info</h2>
      <p className="text-muted-foreground text-sm">
        This information will be visible to all users in the app.
      </p>
      <Card className="rounded-sm">
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-4">
            <Label className="w-32 text-sm" htmlFor="display_name">
              Name
            </Label>
            <Input
              className="flex-1 rounded-sm"
              id="display_name"
              {...form.register("display_name")}
            />
          </div>
          <div className="flex items-center gap-4">
            <Label className="w-32 text-sm" htmlFor="initials">
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
        </div>
      </Card>
    </div>
  );
}
