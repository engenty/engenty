import { BrandLogoMark } from "@engenty/ui-core";
import { Info } from "lucide-react";

interface SettingsAboutFooterProps {
  aboutLabel: string;
  appVersion?: string;
  brandLabel: string;
  logoUrl?: string;
  onAboutClick: () => void;
  planLabel: string;
}

/**
 * Pinned at the foot of the Settings / Setup column. Opens About — there is
 * no popover; tenant switching lives on Settings → Tenant.
 */
export function SettingsAboutFooter({
  aboutLabel,
  appVersion,
  brandLabel,
  logoUrl,
  onAboutClick,
  planLabel,
}: SettingsAboutFooterProps) {
  const secondaryText = appVersion
    ? `${planLabel} · v${appVersion}`
    : planLabel;

  return (
    <button
      aria-label={aboutLabel}
      className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
      onClick={onAboutClick}
      type="button"
    >
      <BrandLogoMark
        className="size-6 rounded-sm border-white/35 bg-white p-1 shadow-sm dark:border-border-soft dark:bg-card"
        fallbackClassName="text-[9px] tracking-tight"
        label={brandLabel}
        logoUrl={logoUrl}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{brandLabel}</p>
        <p className="truncate text-muted-foreground text-xs">
          {secondaryText}
        </p>
      </div>
      <Info aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}
