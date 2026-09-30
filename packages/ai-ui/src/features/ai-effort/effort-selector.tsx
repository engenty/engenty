"use client";

// An agent's own effort, in the agents settings tab: Normal or Extra for the
// agent's work, or inherit (`auto`). A withheld Extra renders disabled rather
// than hidden so the plan boundary is legible. People chatting pick Normal /
// Extra / Custom instead (`ChatModeSelector`).

import type { AiEffortChoice } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown, CornerLeftUp, Gauge, Sparkles } from "lucide-react";
import { buildEffortChoiceOptions } from "./effort-choices.js";

const CHOICE_ICON: Record<AiEffortChoice, typeof Gauge> = {
  auto: CornerLeftUp,
  high: Sparkles,
  normal: Gauge,
};

export interface EffortSelectorProps {
  /** Plan grant (`allowed_efforts`); null/empty = every tier. */
  allowedEfforts?: readonly string[] | null;
  disabled?: boolean;
  onChange: (choice: AiEffortChoice) => void;
  value: AiEffortChoice;
}

export function EffortSelector({
  allowedEfforts,
  disabled,
  onChange,
  value,
}: EffortSelectorProps) {
  const { t } = useTranslation("ai-ui");
  const options = buildEffortChoiceOptions(allowedEfforts);
  const ActiveIcon = CHOICE_ICON[value];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("effort.ariaLabel")}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ActiveIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{t(`effort.choice.${value}.label`)}</span>
        </span>
        <ChevronDown aria-hidden className="size-3 shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuRadioGroup
          onValueChange={(next) => onChange(next as AiEffortChoice)}
          value={value}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              className="items-start py-2"
              disabled={!option.allowed}
              key={option.value}
              value={option.value}
            >
              <div className="min-w-0 flex-1">
                <span className="block leading-tight">
                  {t(`effort.choice.${option.value}.label`)}
                </span>
                <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
                  {option.allowed
                    ? t(`effort.choice.${option.value}.desc`)
                    : t("effort.notInPlan")}
                </p>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
