import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils";
import {
  SettingsFormCard,
  type SettingsFormCardProps,
} from "../admin/settings/settings-form-card";

const cardSectionHeaderTitleVariants = cva("", {
  variants: {
    variant: {
      /**
       * Form / detail section above a card — Geist `font-medium text-lg`.
       * Default for settings + entity info blocks.
       */
      default: "font-medium text-lg leading-none text-foreground",
      /**
       * Quiet overview / meta label — muted uppercase micro type.
       * Prefer for labeled blocks without (or beside) a raised card.
       */
      meta: "font-semibold text-muted-foreground text-xs uppercase tracking-wide",
      /**
       * Hub / display section — Space Grotesk at section scale.
       * Page `h1` still uses DetailPageHeader; this is for in-page hubs only.
       */
      display:
        "font-heading font-semibold text-lg leading-7 tracking-tight text-foreground",
      /**
       * Drawer / doc-sidebar sections — matches commercial `SettingsSection`
       * (`font-semibold text-sm`, description `text-xs`).
       */
      compact: "font-semibold text-sm leading-none text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export type CardSectionHeaderVariant = NonNullable<
  VariantProps<typeof cardSectionHeaderTitleVariants>["variant"]
>;

export interface CardSectionHeaderProps {
  /** Optional action (button, link) to the right of the title. */
  action?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  /** Smaller muted line under the description. */
  note?: React.ReactNode;
  title: React.ReactNode;
  /**
   * Title typography. Prefer a variant over hand-rolled Tailwind on the title.
   * - `default` — form/detail section (`font-medium text-lg`)
   * - `meta` — overview/meta label (muted uppercase)
   * - `display` — hub section (`font-heading`)
   * - `compact` — drawer / doc-sidebar (`font-semibold text-sm`)
   */
  variant?: CardSectionHeaderVariant;
}

/**
 * Title (+ optional description / note / action) that sits **outside** the card
 * surface — the caption side of the section↔card figure.
 */
export function CardSectionHeader({
  action,
  className,
  description,
  note,
  title,
  variant = "default",
}: CardSectionHeaderProps) {
  const HeadingTag = variant === "meta" || variant === "compact" ? "h3" : "h2";
  return (
    <div
      className={cn("flex items-start justify-between gap-2", className)}
      data-slot="card-section-header"
      data-variant={variant}
    >
      <div className="min-w-0">
        <HeadingTag
          className={cardSectionHeaderTitleVariants({ variant })}
        >
          {title}
        </HeadingTag>
        {description == null ? null : (
          <p
            className={cn(
              "whitespace-normal text-pretty break-words text-muted-foreground leading-snug",
              variant === "compact" ? "mt-0.5 text-xs" : "mt-1 text-sm"
            )}
          >
            {description}
          </p>
        )}
        {note == null ? null : (
          <p className="mt-1 text-muted-foreground text-xs leading-snug">
            {note}
          </p>
        )}
      </div>
      {action ?? null}
    </div>
  );
}

export type CardSectionBodyProps = SettingsFormCardProps;

/**
 * Raised card surface for the section body. Prefer this over nesting a raw
 * `Card` so padding / flush / compact variants stay consistent.
 */
export function CardSectionBody({
  className,
  variant,
  ...props
}: CardSectionBodyProps) {
  return (
    <SettingsFormCard
      className={cn(variant === "flush" ? undefined : "space-y-3", className)}
      data-slot="card-section-body"
      variant={variant}
      {...props}
    />
  );
}

export interface CardSectionCaptionProps extends React.ComponentProps<"p"> {}

/** Optional helper / footnote **below** the card. */
export function CardSectionCaption({
  className,
  ...props
}: CardSectionCaptionProps) {
  return (
    <p
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="card-section-caption"
      {...props}
    />
  );
}

export interface CardSectionProps {
  /**
   * When set with `title`, children are wrapped in {@link CardSectionBody}.
   * Omit for the compound API (`CardSection.Header` / `.Body` / `.Caption`).
   */
  cardClassName?: string;
  /** Body surface variant when using the convenience API. Default `default`. */
  cardVariant?: SettingsFormCardProps["variant"];
  children?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  /** Header typography variant when using the convenience API. */
  headerVariant?: CardSectionHeaderVariant;
  note?: React.ReactNode;
  /** Convenience API — when set, renders header + auto-wrapped body. */
  title?: React.ReactNode;
  titleAction?: React.ReactNode;
}

function CardSectionRoot({
  cardClassName,
  cardVariant,
  children,
  className,
  description,
  headerVariant,
  note,
  title,
  titleAction,
}: CardSectionProps) {
  // Convenience: title prop → Header + Body wrapping children.
  if (title != null) {
    return (
      <section
        className={cn("space-y-1.5", className)}
        data-slot="card-section"
      >
        <CardSectionHeader
          action={titleAction}
          description={description}
          note={note}
          title={title}
          variant={headerVariant}
        />
        <CardSectionBody className={cardClassName} variant={cardVariant}>
          {children}
        </CardSectionBody>
      </section>
    );
  }

  // Compound: caller supplies Header / Body / Caption as children.
  return (
    <section className={cn("space-y-1.5", className)} data-slot="card-section">
      {children}
    </section>
  );
}

/**
 * Section ↔ card figure: header (and optional caption) outside, body on a
 * raised card surface.
 *
 * Convenience:
 * ```tsx
 * <CardSection title="…" description="…">{rows}</CardSection>
 * ```
 *
 * Compound:
 * ```tsx
 * <CardSection>
 *   <CardSection.Header title="…" variant="meta" />
 *   <CardSection.Body variant="flush">{rows}</CardSection.Body>
 *   <CardSection.Caption>Optional footnote</CardSection.Caption>
 * </CardSection>
 * ```
 */
export const CardSection = Object.assign(CardSectionRoot, {
  Body: CardSectionBody,
  Caption: CardSectionCaption,
  Header: CardSectionHeader,
});

export { cardSectionHeaderTitleVariants };
