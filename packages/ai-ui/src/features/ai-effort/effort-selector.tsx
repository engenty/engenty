"use client";

// The end-user model control: how much thinking a task deserves, not which
// model does it. Withheld tiers render disabled rather than hidden so the plan
// boundary is legible instead of mysterious.

import type { AiEffort, AiEffortChoice } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown, Gauge, Sparkles, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { buildEffortChoiceOptions } from "./effort-choices.js";

const CHOICE_ICON: Record<
  AiEffortChoice,
  typeof Gauge | typeof Sparkles | typeof Zap
> = {
  auto: Sparkles,
  low: Zap,
  medium: Gauge,
  high: Sparkles,
};

export interface EffortSelectorProps {
  /** Plan grant (`allowed_efforts`); null/empty = every tier. */
  allowedEfforts?: readonly string[] | null;
  className?: string;
  disabled?: boolean;
  /** Rendered below a separator inside the menu — the expert/model escape hatch. */
  footer?: ReactNode;
  /**
   * Bound model id per graded tier. Developer-mode surfaces pass this so the
   * menu answers "what does medium run?" without opening settings. `auto` has
   * no entry — the router picks per request.
   */
  modelByEffort?: Partial<Record<AiEffort, string>>;
  onChange: (choice: AiEffortChoice) => void;
  value: AiEffortChoice;
  /** `pill` matches the composer's inline controls; `field` matches settings rows. */
  variant?: "field" | "pill";
}

export function EffortSelector({
  allowedEfforts,
  className,
  disabled,
  footer,
  modelByEffort,
  onChange,
  value,
  variant = "pill",
}: EffortSelectorProps) {
  const { t } = useTranslation("ai-ui");
  const options = buildEffortChoiceOptions(allowedEfforts);
  const ActiveIcon = CHOICE_ICON[value];

  const triggerClassName =
    variant === "pill"
      ? "flex h-6 items-center gap-1 rounded-full border-0 bg-transparent px-2 text-muted-foreground text-xs shadow-none outline-none hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      : "flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("effort.ariaLabel")}
        className={[triggerClassName, className].filter(Boolean).join(" ")}
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
          {options.map((option) => {
            const boundModel =
              option.value === "auto"
                ? undefined
                : modelByEffort?.[option.value];
            return (
              <DropdownMenuRadioItem
                className="items-start py-2"
                disabled={!option.allowed}
                key={option.value}
                value={option.value}
              >
                <div className="min-w-0 flex-1">
                  <span className="leading-tight">
                    {t(`effort.choice.${option.value}.label`)}
                  </span>
                  <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
                    {option.allowed
                      ? t(`effort.choice.${option.value}.desc`)
                      : t("effort.notInPlan")}
                  </p>
                  {boundModel ? (
                    <code className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                      {boundModel}
                    </code>
                  ) : null}
                </div>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        {footer ? (
          <>
            <DropdownMenuSeparator />
            {footer}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
