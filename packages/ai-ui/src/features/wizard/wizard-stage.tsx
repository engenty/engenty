"use client";

// The screens of a wizard between and after its questions.
//
// One thing on the screen at a time: the question (a gate), the run at work,
// or how it ended. No rail of steps — the person answers what is asked and
// the run does the rest. Each screen enters the same way, so moving from one
// to the next reads as turning a page.

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, EngentyLogoMark } from "@engenty/ui-core";
import { Ban, Check, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MessageResponse } from "../../components/presentation.js";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../lib/admin/compact-markdown-prose-classname.js";

/** A screen of its own, entering from below. Key it by what it shows. */
export function WizardScreen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:animate-in motion-safe:duration-500",
        className
      )}
    >
      {children}
    </div>
  );
}

/** The run at work: the mark, and what it is doing now. */
export function WizardWorking({
  detail,
  label,
}: {
  detail?: string | null;
  label: string;
}) {
  return (
    <div
      aria-live="polite"
      className="flex flex-col items-center gap-5 py-10 text-center"
      role="status"
    >
      <EngentyLogoMark size={88} />
      <div className="space-y-2">
        <p className="font-heading font-semibold text-2xl tracking-tight motion-safe:animate-pulse">
          {label}
        </p>
        {detail ? (
          <p className="text-base text-muted-foreground">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}

/** The line comes from this run's own graph, not from the open web. */
const NO_LINK_SAFETY = { enabled: false };

/** A wizard that wrote a record links to it — an in-app path stays in the app. */
const SUMMARY_MARKDOWN_COMPONENTS = {
  a: ({ children, href }: { children?: ReactNode; href?: string }) =>
    href?.startsWith("/") ? (
      <Link className="font-medium underline underline-offset-4" to={href}>
        {children}
      </Link>
    ) : (
      <a href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    ),
};

export type WizardOutcomeKind = "completed" | "failed" | "cancelled";

const OUTCOME_ICON = {
  cancelled: {
    className: "bg-muted text-muted-foreground",
    Icon: Ban,
  },
  completed: {
    className:
      "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400",
    Icon: Check,
  },
  failed: {
    className: "bg-destructive/10 text-destructive",
    Icon: X,
  },
} as const;

/** How the run ended: the verdict, the graph's closing line, the way out. */
export function WizardOutcome({
  kind,
  message,
  onExit,
  onRestart,
}: {
  kind: WizardOutcomeKind;
  /** Markdown on a completed run (the graph's summary); plain text otherwise. */
  message?: string | null;
  onExit?: () => void;
  onRestart?: () => void;
}) {
  const { t } = useTranslation("ai-ui");
  const { className, Icon } = OUTCOME_ICON[kind];
  const title =
    kind === "completed"
      ? t("wizard.outcome.completed")
      : kind === "failed"
        ? t("wizard.outcome.failed")
        : t("wizard.outcome.cancelled");

  return (
    <div className="flex flex-col items-start gap-5">
      <span
        aria-hidden
        className={cn(
          "motion-safe:zoom-in-50 flex size-16 items-center justify-center rounded-full motion-safe:animate-in motion-safe:duration-500",
          className
        )}
      >
        <Icon className="size-8" strokeWidth={2.5} />
      </span>
      <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
        {title}
      </h1>
      {message ? (
        kind === "completed" ? (
          <MessageResponse
            className={cn(COMPACT_MARKDOWN_PROSE_CLASSNAME, "text-base")}
            components={SUMMARY_MARKDOWN_COMPONENTS}
            linkSafety={NO_LINK_SAFETY}
          >
            {message}
          </MessageResponse>
        ) : (
          <p className="whitespace-pre-wrap text-base text-muted-foreground">
            {message}
          </p>
        )
      ) : null}
      <div className="flex items-center gap-2 pt-2">
        {kind === "completed" && onExit ? (
          <Button onClick={onExit} size="lg" type="button">
            {t("wizard.done")}
          </Button>
        ) : null}
        {kind !== "completed" && onRestart ? (
          <Button onClick={onRestart} size="lg" type="button">
            <RotateCcw aria-hidden className="mr-2 size-4" />
            {t("wizard.restart")}
          </Button>
        ) : null}
        {kind !== "completed" && onExit ? (
          <Button onClick={onExit} size="lg" type="button" variant="ghost">
            {t("wizard.close")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
