import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Check } from "lucide-react";
import {
  SPACE_CREATE_STEPS,
  type SpaceCreateStep,
} from "./space-create-wizard-state";

export function SpaceCreateProgress({
  current,
  locked = false,
  onSelect,
}: {
  current: SpaceCreateStep;
  /** True once the space exists: earlier steps can no longer be revisited. */
  locked?: boolean;
  onSelect: (step: SpaceCreateStep) => void;
}) {
  const { t } = useTranslation("common");
  const currentIndex = SPACE_CREATE_STEPS.indexOf(current);
  return (
    <nav aria-label={t("spaces.createWizard.progressLabel")}>
      <ol className="grid grid-cols-5 gap-1">
        {SPACE_CREATE_STEPS.map((step, index) => {
          const complete = index < currentIndex;
          const active = step === current;
          return (
            <li key={step}>
              <button
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                disabled={locked || index > currentIndex}
                onClick={() => onSelect(step)}
                type="button"
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border text-[10px]",
                    active &&
                      "border-primary bg-primary text-primary-foreground",
                    complete && "border-primary/30 bg-primary/10 text-primary"
                  )}
                >
                  {complete ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="hidden truncate sm:block">
                  {t(`spaces.createWizard.steps.${step}`)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
