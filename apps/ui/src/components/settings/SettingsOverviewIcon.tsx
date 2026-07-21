import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

export type SettingsOverviewIconTone =
  | "amber"
  | "cobalt"
  | "ember"
  | "moss"
  | "rose";

const TONE_BG: Record<SettingsOverviewIconTone, string> = {
  amber: "bg-[var(--amber-tint)]",
  cobalt: "bg-[var(--cobalt-tint)]",
  ember: "bg-[var(--ember-tint)]",
  moss: "bg-[var(--moss-tint)]",
  rose: "bg-[var(--rose-tint)]",
};

/** Map plugin/settings categories → tinted icon plates. */
export function overviewIconToneForCategory(
  category: string | undefined
): SettingsOverviewIconTone {
  switch (category) {
    case "engenty":
    case "agents":
      return "ember";
    case "commercial":
      return "cobalt";
    case "work":
      return "moss";
    case "knowledge":
      return "amber";
    case "integrations":
      return "cobalt";
    case "platform":
      return "rose";
    default:
      return "ember";
  }
}

interface SettingsOverviewIconProps {
  className?: string;
  Icon: ComponentType<{ className?: string }>;
  tone?: SettingsOverviewIconTone;
}

/**
 * Larger icon tile for settings overview rows — tinted plate so glyphs
 * (including dock brand fills) read at a glance.
 */
export function SettingsOverviewIcon({
  className,
  Icon,
  tone = "ember",
}: SettingsOverviewIconProps) {
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
        TONE_BG[tone],
        className
      )}
    >
      <Icon className="size-6 text-foreground" />
    </div>
  );
}
