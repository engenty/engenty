import type * as React from "react";
import {
  CardSection,
  type CardSectionProps,
} from "../../ui/card-section";

/**
 * @deprecated Prefer {@link CardSection}. Kept as a thin alias for settings
 * call sites — same markup and chrome.
 */
export type SettingsFormSectionProps = CardSectionProps & {
  /** Settings blocks always carry helper copy. */
  description: React.ReactNode;
  title: React.ReactNode;
};

/**
 * Settings block: title + description outside, form card body.
 * Alias of {@link CardSection} with a required `description`.
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
    <CardSection
      cardClassName={cardClassName}
      cardVariant={cardVariant}
      className={className}
      description={description}
      note={note}
      title={title}
      titleAction={titleAction}
    >
      {children}
    </CardSection>
  );
}
