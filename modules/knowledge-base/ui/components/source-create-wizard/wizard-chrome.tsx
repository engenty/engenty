/**
 * Shared chrome for the add-source wizard: the progress rail and the
 * back/next footer every step renders.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import type { KbSourceWizardStepId } from "../../lib/source-create-wizard.js";

export function WizardRail({
  current,
  steps,
}: {
  current: KbSourceWizardStepId;
  steps: readonly KbSourceWizardStepId[];
}) {
  const { t } = useTranslation("kb");
  const currentIndex = Math.max(0, steps.indexOf(current));

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li className="flex items-center gap-2" key={step}>
            {index > 0 ? (
              <span aria-hidden className="text-muted-foreground">
                →
              </span>
            ) : null}
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full font-semibold text-xs",
                active && "bg-primary text-primary-foreground",
                done && "bg-primary/20 text-primary",
                !(active || done) && "bg-muted text-muted-foreground"
              )}
            >
              {done ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            <span
              className={cn(
                active ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {t(`sources.wizard_step_${step}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function WizardStepHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div>
      <h2 className="font-semibold text-base">{title}</h2>
      <p className="mt-0.5 text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

export function WizardFooter({
  backDisabled,
  extra,
  nextDisabled,
  nextLabel,
  onBack,
  onNext,
  pending,
}: {
  backDisabled?: boolean;
  /** Rendered between the two buttons (e.g. an inline hint). */
  extra?: ReactNode;
  nextDisabled?: boolean;
  nextLabel?: string;
  onBack?: () => void;
  onNext?: () => void;
  pending?: boolean;
}) {
  const { t } = useTranslation("kb");
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-4">
      {onBack ? (
        <Button
          disabled={backDisabled}
          onClick={onBack}
          size="sm"
          type="button"
          variant="outline"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t("sources.setup_wizard_back")}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex min-w-0 items-center gap-3">
        {extra}
        {onNext ? (
          <Button
            disabled={nextDisabled || pending}
            onClick={onNext}
            size="sm"
            type="button"
          >
            {pending ? (
              <AnimatedLoaderIcon className="mr-1" play="always" size="sm" />
            ) : null}
            {nextLabel ?? t("sources.setup_wizard_next")}
            {pending ? null : <ArrowRight className="ml-1 h-4 w-4" />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
