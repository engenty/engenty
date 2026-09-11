"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  ContextBox,
  ContextBoxRow,
  ContextBoxSection,
} from "./context-box-primitives.js";

export interface ContextBoxItem {
  detail?: ReactNode;
  externalUrl?: string;
  href?: string;
  icon: LucideIcon;
  key: string;
  label: string;
  onClick?: () => void;
}

export interface ContextBoxSectionModel {
  content?: ReactNode;
  id: string;
  items: ContextBoxItem[];
  label: string;
}

export function ContextBoxView({
  ariaLabel,
  className,
  emptyContent,
  sections,
}: {
  ariaLabel: string;
  className?: string;
  emptyContent?: ReactNode;
  sections: ContextBoxSectionModel[];
}) {
  const visibleSections = sections.filter(
    (section) => section.items.length > 0 || section.content
  );
  if (visibleSections.length === 0 && !emptyContent) {
    return null;
  }

  return (
    <ContextBox ariaLabel={ariaLabel} className={className}>
      {visibleSections.length > 0
        ? visibleSections.map((section) => (
            <ContextBoxSection key={section.id} label={section.label}>
              {section.content}
              {section.items.map((item) => (
                <ContextBoxRow
                  detail={item.detail}
                  externalUrl={item.externalUrl}
                  href={item.href}
                  icon={item.icon}
                  key={item.key}
                  label={item.label}
                  onClick={item.onClick}
                />
              ))}
            </ContextBoxSection>
          ))
        : emptyContent}
    </ContextBox>
  );
}
