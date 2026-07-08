import { useEffect, useState } from "react";
import { cn } from "../../../lib/utils";

export function brandLogoInitials(label: string): string {
  const trimmed = label.trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : "?";
}

export interface BrandLogoMarkProps {
  className?: string;
  fallbackClassName?: string;
  imageClassName?: string;
  label: string;
  logoUrl?: string | null;
}

/** Squared tenant/brand logo with rounded corners and a two-letter fallback. */
export function BrandLogoMark({
  label,
  logoUrl,
  className,
  imageClassName,
  fallbackClassName,
}: BrandLogoMarkProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = Boolean(logoUrl) && !imageBroken;
  const initials = brandLogoInitials(label);

  useEffect(() => {
    setImageBroken(false);
  }, [logoUrl]);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/40 bg-white p-1.5 dark:bg-card",
        className
      )}
    >
      {showImage ? (
        <img
          alt={label}
          className={cn("size-full object-contain", imageClassName)}
          height={40}
          onError={() => setImageBroken(true)}
          src={logoUrl ?? undefined}
          width={40}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "flex size-full items-center justify-center bg-transparent font-bold text-primary",
            fallbackClassName
          )}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
