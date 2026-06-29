import type * as React from "react";
import { cn } from "../../../lib/utils";
import {
  SettingsFormCard,
  type SettingsFormCardProps,
} from "./settings-form-card";

export interface SettingsFormSectionProps {
  cardClassName?: string;
  /** Pass `compact` when children are stacked {@link SettingsFormRow}s. */
  cardVariant?: SettingsFormCardProps["variant"];
  children: React.ReactNode;
  className?: string;
  description: React.ReactNode;
  note?: React.ReactNode;
  title: React.ReactNode;
  /** Optional action element (e.g. a button) rendered to the right of the title. */
  titleAction?: React.ReactNode;
}

/**
 * Standard settings block: tight title + description stack, then `space-y-2`
 * before the bordered form surface (`SettingsFormCard`).
 *
 * Matches app appearance settings (`/settings/appearance`).
 */
export function SettingsFormSection({
  title,
  titleAction,
  description,
  note,
  children,
  className,
  cardClassName,
  cardVariant,
}: SettingsFormSectionProps) {
  return (
    <section className={cn("space-y-2", className)}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium text-lg">{title}</h2>
          {titleAction ?? null}
        </div>
        <p className="whitespace-normal text-pretty break-words text-muted-foreground text-sm">
          {description}
        </p>
        {note ? (
          <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
            {note}
          </p>
        ) : null}
      </div>
      <SettingsFormCard
        className={cn("space-y-3", cardClassName)}
        variant={cardVariant}
      >
        {children}
      </SettingsFormCard>
    </section>
  );
}
