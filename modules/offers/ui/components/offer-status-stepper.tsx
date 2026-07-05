import { useTranslation } from "@engenty/i18n/ui";
import { ScrollArea, ScrollBar } from "@engenty/ui-core";
import { Check } from "lucide-react";
import type { OfferStatus } from "../api.js";

const ORDER: OfferStatus[] = ["draft", "ready", "accepted"];
type StepState = "active" | "completed" | "future";

interface OfferStatusStepperProps {
  status: OfferStatus;
}

export function OfferStatusStepper({ status }: OfferStatusStepperProps) {
  const { t } = useTranslation("offers");
  const activeIndex = ORDER.indexOf(status);
  const getStepState = (index: number): StepState => {
    if (index === activeIndex) {
      return "active";
    }
    if (index < activeIndex) {
      return "completed";
    }
    return "future";
  };

  const getStepButtonClass = (state: StepState): string => {
    if (state === "active") {
      return "scale-110 cursor-default bg-primary text-primary-foreground";
    }
    if (state === "completed") {
      return "cursor-default bg-primary/80 text-primary-foreground";
    }
    return "cursor-default bg-muted/50 text-muted-foreground/50";
  };

  const getStepLabelClass = (state: StepState): string => {
    if (state === "active") {
      return "text-primary";
    }
    if (state === "completed") {
      return "text-muted-foreground";
    }
    return "text-muted-foreground/50";
  };

  const gridCols = ORDER.map((_, i) =>
    i < ORDER.length - 1 ? "auto 1fr" : "auto"
  ).join(" ");

  return (
    <ScrollArea className="w-full">
      <div
        className="mx-auto mt-4 grid gap-x-1 px-2 py-1 sm:gap-x-2"
        style={{ gridTemplateColumns: gridCols, gridTemplateRows: "auto auto" }}
      >
        {ORDER.map((step, index) => {
          const state = getStepState(index);
          const colStart = index * 2 + 1;
          return (
            <div
              className="row-span-2 grid grid-rows-subgrid justify-items-center"
              key={step}
              style={{ gridColumn: colStart }}
            >
              <button
                className={`flex h-6 w-6 items-center justify-center rounded-full font-medium text-xs transition-all duration-200 sm:h-7 sm:w-7 ${getStepButtonClass(state)}`}
                disabled
                type="button"
              >
                {state === "active" || state === "completed" ? (
                  <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                ) : (
                  index + 1
                )}
              </button>
              <span
                className={`mt-1 whitespace-nowrap font-medium text-xxs sm:text-xs ${getStepLabelClass(state)}`}
              >
                {t(`statusLabels.${step}`)}
              </span>
            </div>
          );
        })}

        {ORDER.slice(0, -1).map((step, index) => {
          const currentState = getStepState(index);
          const nextState = getStepState(index + 1);
          const lineIsDashed =
            currentState === "future" || nextState === "future";
          const bothCompleted =
            (currentState === "active" || currentState === "completed") &&
            (nextState === "active" || nextState === "completed");
          const currentDone =
            currentState === "active" || currentState === "completed";
          const colStart = index * 2 + 2;
          return (
            <div
              className="flex items-center self-center"
              key={`line-${step}`}
              style={{ gridColumn: colStart, gridRow: 1 }}
            >
              <div
                className={`h-[2px] w-full transition-colors duration-200 ${lineIsDashed ? "border-muted-foreground/30 border-t-2 border-dashed bg-transparent" : ""}
                    ${!lineIsDashed && bothCompleted ? "bg-primary" : ""}
                    ${!(lineIsDashed || bothCompleted) && currentDone ? "bg-muted" : ""}
                    ${lineIsDashed || bothCompleted || currentDone ? "" : "bg-muted/50"}
                  `}
              />
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
