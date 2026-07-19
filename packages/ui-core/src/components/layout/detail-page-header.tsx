import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

const detailPageHeaderVariants = cva("w-full shrink-0", {
  variants: {
    /**
     * Both sit on the white `card` surface (distinct from the paper canvas).
     * `blended`: sticky, hairline bottom border. The white surface extends up
     * under a transparent floating topbar — pair with the page's
     * `usePageConfig({ topbarChrome: "contentBlend", topbarOverlap: true })`.
     * `framed`: static, soft bottom shadow — a standalone raised band.
     */
    variant: {
      blended: "border-border border-b bg-card",
      framed: "bg-card shadow-bottom shadow-sm",
    },
    sticky: {
      true: "sticky top-0 z-10",
      false: "",
    },
  },
  defaultVariants: { variant: "blended", sticky: true },
});

const CONTAINER_MAX_WIDTH = {
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  // Wide workspace column (file managers, boards) where a tab needs the full
  // width rather than a reading column. Keep header + content on the same token.
  "8xl": "max-w-[100rem]",
} as const;

const CONTAINER_PADDING = {
  // Top clearance keeps the title below the ~44px (h-11) transparent topbar
  // that floats over the white surface when `topbarOverlap` is set.
  // Horizontal tokens match `.p-page` / `.px-page` so the title + tab strip
  // keep a left gutter when the max-width column fills the workspace
  // (smaller desktop / secondary nav open).
  blended: "px-2 pt-14 sm:px-4 md:px-5",
  framed: "px-4 py-4 sm:px-6",
} as const;

export interface DetailPageHeaderProps
  extends Pick<VariantProps<typeof detailPageHeaderVariants>, "variant"> {
  /**
   * Primary section navigation flush to the header's bottom edge: a `TabsList`
   * (line variant) or a status stepper. NOT for view-mode toggles or file
   * pickers — those are content chrome and belong in the content area.
   */
  belowStrip?: ReactNode;
  className?: string;
  /**
   * When true, collapse the eyebrow + description so only the title + status +
   * belowStrip remain — a compact "stuck" header. Drive from a scroll detector.
   */
  collapsed?: boolean;
  /** Override the inner container (alignment / horizontal padding). */
  containerClassName?: string;
  /** Block under the title — lead paragraph or a meta-stat grid. */
  description?: ReactNode;
  /** Muted context line above the title (legal name, "person", "id · module"). */
  eyebrow?: ReactNode;
  /** Container max width; must match the page content column. Default `5xl`. */
  maxWidth?: keyof typeof CONTAINER_MAX_WIDTH;
  /**
   * Optional leading visual aligned to the left of the title block — an avatar
   * or logo. Stays visible when `collapsed`; only the eyebrow/description fade.
   */
  media?: ReactNode;
  /**
   * Right-aligned slot beside the title for entity *state* — status badges, a
   * "Failed" chip, an active toggle. Primary *actions* (Edit, Run) belong in
   * the shell topbar via `usePageConfig({ actions })`, not here.
   */
  status?: ReactNode;
  /** Defaults to sticky for `blended`, non-sticky for `framed`. */
  sticky?: boolean;
  title: ReactNode;
  /** Override the default page-title typography. */
  titleClassName?: string;
}

/**
 * Shared detail-page header: surface + centered container + title block, with a
 * `belowStrip` slot for section tabs (or a status stepper). Presentational only
 * — the page still owns `usePageConfig` for topbar chrome and primary actions.
 */
export function DetailPageHeader({
  belowStrip,
  className,
  collapsed = false,
  containerClassName,
  description,
  eyebrow,
  maxWidth = "5xl",
  media,
  status,
  sticky,
  title,
  titleClassName,
  variant = "blended",
}: DetailPageHeaderProps) {
  const isSticky = sticky ?? variant === "blended";
  return (
    <header
      className={cn(
        detailPageHeaderVariants({ sticky: isSticky, variant }),
        "transition-colors duration-200",
        // Frosted glass once collapsed/stuck — floats over content like a modal.
        collapsed && "bg-card/85 backdrop-blur",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col",
          CONTAINER_MAX_WIDTH[maxWidth],
          CONTAINER_PADDING[variant ?? "blended"],
          containerClassName
        )}
      >
        <div className={cn("mb-2", media && "flex items-start gap-5")}>
          {media ? <div className="shrink-0">{media}</div> : null}
          <div className={cn(media && "min-w-0 flex-1")}>
            {eyebrow ? (
              <div
                className={cn(
                  "overflow-hidden text-muted-foreground text-sm transition-all duration-200",
                  collapsed ? "max-h-0 opacity-0" : "mb-0.5 max-h-8 opacity-100"
                )}
              >
                {eyebrow}
              </div>
            ) : null}
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <h1
                className={cn(
                  "min-w-0 font-heading font-semibold text-2xl text-foreground leading-tight tracking-tight",
                  titleClassName
                )}
              >
                {title}
              </h1>
              {status ? <div className="shrink-0">{status}</div> : null}
            </div>
            {description ? (
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  collapsed ? "max-h-0 opacity-0" : "mt-1 max-h-24 opacity-100"
                )}
              >
                <div className="max-w-3xl">{description}</div>
              </div>
            ) : null}
          </div>
        </div>
        {belowStrip ? <div className="flex items-end">{belowStrip}</div> : null}
      </div>
    </header>
  );
}
