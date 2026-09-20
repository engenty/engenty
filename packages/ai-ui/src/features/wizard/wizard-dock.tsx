"use client";

// A wizard pressed from a composer, docked above it.
//
// The page has room to narrate a run; a dock has one strip. It says the three
// things a person needs while a wizard they started is theirs to finish: the
// step, that the run is working between steps, and the closing line. Going
// empty between two gates is what made the first cut look crashed — a graph
// that takes a minute to draft looked like a card that vanished.

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import { MessageResponse } from "../../components/presentation.js";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../lib/admin/compact-markdown-prose-classname.js";
import { type GateDecision, GateSurfaceCard } from "./gate-surface-card.js";
import type { DeskWizardStep } from "./use-desk-wizard-step.js";

/** The line comes from this run's own graph, not from the open web. */
const NO_LINK_SAFETY = { enabled: false };

const SUMMARY_MARKDOWN_COMPONENTS = {
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) =>
    href?.startsWith("/") ? (
      <Link className="underline" to={href}>
        {children}
      </Link>
    ) : (
      <a href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    ),
};

export interface WizardDockProps {
  /** A decision is in flight. */
  busy?: boolean;
  className?: string;
  /** Workspace search behind `ObjectPicker` fields. */
  objectSearch?: MentionRefSearch | null;
  /** "Abbrechen" — stops the run. */
  onCancel: () => void;
  /** "Fertig" — the settled run leaves the dock. */
  onDismiss: () => void;
  onSubmit: (decision: GateDecision) => void;
  /** Null while the press itself is still in flight. */
  step: DeskWizardStep | null;
}

function DockStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function WizardDock({
  busy,
  className,
  objectSearch,
  onCancel,
  onDismiss,
  onSubmit,
  step,
}: WizardDockProps) {
  const { t } = useTranslation("ai-ui");

  if (step?.state === "gate" && step.gate) {
    return (
      <GateSurfaceCard
        answer={step.answer}
        busy={busy}
        className={className}
        gate={step.gate}
        objectSearch={objectSearch}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );
  }

  if (step?.state === "settled") {
    return (
      <div
        className={cn(
          "space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5",
          className
        )}
      >
        <div className="flex items-center gap-2 font-medium text-sm">
          <CheckCircle2
            aria-hidden
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          {t("wizard.state.completed")}
        </div>
        {step.summary ? (
          <MessageResponse
            className={COMPACT_MARKDOWN_PROSE_CLASSNAME}
            components={SUMMARY_MARKDOWN_COMPONENTS}
            linkSafety={NO_LINK_SAFETY}
          >
            {step.summary}
          </MessageResponse>
        ) : null}
        <Button onClick={onDismiss} size="sm" type="button">
          {t("wizard.done")}
        </Button>
      </div>
    );
  }

  // Pressed but not yet dispatched, or working between two gates — the same
  // strip either way: what the person did is still happening.
  return (
    <DockStrip className={className}>
      <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
      <span className="flex-1">
        {step ? t("wizard.state.running") : t("wizard.state.starting")}
      </span>
      {step ? (
        <Button
          disabled={busy}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("gateSurface.cancel")}
        </Button>
      ) : null}
    </DockStrip>
  );
}
