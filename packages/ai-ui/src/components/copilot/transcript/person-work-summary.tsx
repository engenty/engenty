"use client";

// What a person sees of a finished turn's work: one line counting it, and the
// same steps in plain words one click away. Developer mode has the step list.

import { useTranslation } from "@engenty/i18n/ui";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  type PersonStep,
  personStepText,
  summarizePersonSteps,
} from "./person-steps.js";

export function PersonWorkSummary({ steps }: { steps: readonly PersonStep[] }) {
  const { t } = useTranslation("ai-ui");
  const [open, setOpen] = useState(false);
  if (steps.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col items-center py-1">
      <button
        aria-expanded={open}
        className="inline-flex max-w-full items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
        data-testid="person-work-summary"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="truncate">{summarizePersonSteps(steps, t)}</span>
        <ChevronDown
          aria-hidden
          className={`size-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <ul className="mt-2 flex max-h-64 w-full max-w-md flex-col gap-1 overflow-y-auto border-border border-l-2 pl-3 text-muted-foreground text-xs">
          {steps.map((step, index) => (
            <li
              className="truncate"
              // Steps are in call order; the same one may repeat.
              key={index}
            >
              {personStepText(t, step, "done")}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
