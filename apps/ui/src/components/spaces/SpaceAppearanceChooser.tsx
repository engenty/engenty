/**
 * Compact colour + icon picker for the create-space name row.
 *
 * One tile is both the preview and the trigger: colour behind initials, an
 * emoji, or an uploaded picture. The popover holds the palette and the
 * Initials / Emoji / Upload switch — two separate buttons next to the name
 * made the rail tile look like two decisions instead of one.
 */

import { SpaceIconFace } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  focusVisibleRingSubtle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { useState } from "react";
import type { SpaceAppearanceValue } from "./SpaceAppearanceFields";
import { SpaceAppearancePicker } from "./SpaceAppearancePicker";

export function SpaceAppearanceChooser({
  name,
  onChange,
  value,
}: {
  name: string;
  onChange: (
    update: (previous: SpaceAppearanceValue) => SpaceAppearanceValue
  ) => void;
  value: SpaceAppearanceValue;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label={t("spaces.setup.chooseAppearance")}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg font-semibold text-xs",
            focusVisibleRingSubtle,
            value.color
              ? "text-white"
              : "border border-border bg-muted text-foreground"
          )}
          style={value.color ? { backgroundColor: value.color } : undefined}
          title={t("spaces.setup.chooseAppearance")}
          type="button"
        >
          <SpaceIconFace icon={value.icon} name={name || "?"} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(36rem,calc(100dvh-2rem))] w-80 overflow-y-auto p-3"
        collisionPadding={12}
        sideOffset={4}
      >
        <SpaceAppearancePicker
          key={open ? "open" : "closed"}
          name={name}
          onChange={onChange}
          value={value}
        />
      </PopoverContent>
    </Popover>
  );
}
