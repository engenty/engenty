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
  /**
   * The tier Auto is currently running, with no expiry — marked in the menu so
   * "Auto" answers "auto *what*?" on every open, not only during the flash.
   * Ignored unless the stored choice is `auto`: for a fixed tier the radio
   * check already says it.
   */
  activeResolvedEffort?: AiEffort | null;
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
  /**
   * When Auto just resolved a turn, briefly show that tier (and optional model)
   * on the trigger with a highlight ring — without changing the stored value.
   * `modelId` is the caller's decision: pass it only where a model id is
   * something the user asked to see (developer mode), never by default.
   */
  resolvedFlash?: {
    effort: AiEffort;
    modelId?: string | null;
  } | null;
  value: AiEffortChoice;
  /** `pill` matches the composer's inline controls; `field` matches settings rows. */
  variant?: "field" | "pill";
}

export function EffortSelector({
  activeResolvedEffort,
  allowedEfforts,
  className,
  disabled,
  footer,
  modelByEffort,
  onChange,
  resolvedFlash,
  value,
  variant = "pill",
}: EffortSelectorProps) {
  const { t } = useTranslation("ai-ui");
  const options = buildEffortChoiceOptions(allowedEfforts);
  const displayValue: AiEffortChoice = resolvedFlash?.effort ?? value;
  const ActiveIcon = CHOICE_ICON[displayValue];
  const flashing = Boolean(resolvedFlash);

  const triggerClassName =
    variant === "pill"
      ? [
          "flex h-6 items-center gap-1 rounded-full border-0 bg-transparent px-2 text-xs shadow-none outline-none transition-[box-shadow,background-color,color] duration-300 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
          flashing
            ? "bg-primary/10 text-foreground ring-2 ring-primary/40"
            : "text-muted-foreground",
        ].join(" ")
      : [
          "flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-background px-2 text-sm transition-[box-shadow,border-color] duration-300 disabled:cursor-not-allowed disabled:opacity-50",
          flashing ? "border-primary ring-2 ring-primary/30" : "",
        ].join(" ");

  // While flashing, an Auto pick reads as "Auto: Low" rather than a bare "Low".
  // Showing only the resolved tier makes the control look like the stored
  // choice changed to that tier — it didn't, and the next turn may resolve
  // differently. Any other stored choice is its own label; it never resolves.
  const label =
    flashing && value === "auto"
      ? t("effort.autoResolvedInline", {
          effort: t(`effort.choice.${displayValue}.label`),
        })
      : t(`effort.choice.${value}.label`);
  const flashModel = resolvedFlash?.modelId?.trim();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("effort.ariaLabel")}
        className={[triggerClassName, className].filter(Boolean).join(" ")}
        disabled={disabled}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ActiveIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{label}</span>
          {flashing && flashModel ? (
            <code className="max-w-[7rem] truncate font-mono text-[10px] opacity-70">
              {flashModel}
            </code>
          ) : null}
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
            // Only meaningful under Auto — a fixed pick is already checked.
            const isActiveResolved =
              value === "auto" &&
              option.value !== "auto" &&
              option.value === activeResolvedEffort;
            return (
              <DropdownMenuRadioItem
                className={[
                  "items-start py-2",
                  isActiveResolved ? "bg-primary/5" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!option.allowed}
                key={option.value}
                value={option.value}
              >
                <div className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 leading-tight">
                    {t(`effort.choice.${option.value}.label`)}
                    {isActiveResolved ? (
                      <>
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full bg-primary"
                        />
                        <span className="font-normal text-[11px] text-muted-foreground">
                          {t("effort.autoActiveHint")}
                        </span>
                      </>
                    ) : null}
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
