"use client";

// One step of a run, drawn as the surface the gate suspended with.
//
// The card has no logic of its own beyond turning a surface submit into a
// resume decision: the submit action's name is the event, the data model is
// the answer, and `reject` is the one event that reads as "no". Whether a
// document sits beside it, what free text means, what "no" leads to — all of
// that is the graph's, visible on the canvas. The wizard page draws it as
// the page itself, the agent desk docks it above the composer; the step is
// the same.

import { parseObjectRef } from "@engenty/ai-core/browser";
import {
  buildEngentyA2uiMessages,
  type EngentyA2uiAction,
  EngentyA2uiSurfaceView,
  type EngentyA2uiSurfaceViewProps,
} from "@engenty/generative-a2ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
} from "@engenty/ui-core";
import { ArrowLeft, ArrowRight, Loader2, X } from "lucide-react";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { EngentyA2uiHostBoundary } from "../../a2ui/engenty-a2ui-host.js";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import { useObjectDisplayIntent } from "../../objects/object-display-intent.js";
import type {
  GraphRunAnswerDto,
  GraphRunGateDto,
} from "../workflow-canvas/workflow-api.js";

/** What the run is resumed with once a step is answered. */
export interface GateDecision {
  approved: boolean;
  data: Record<string, unknown>;
  event: string;
  reason?: string;
}

/** The one event that means "no"; everything else approves. */
const REJECT_EVENT = "reject";

/** Turn a surface submit into the resume decision the graph reads. */
export function gateDecisionFromSubmit(
  event: string,
  data: Record<string, unknown>
): GateDecision {
  const reason = data.reason;
  return {
    approved: event !== REJECT_EVENT,
    data,
    event,
    ...(typeof reason === "string" && reason.trim() ? { reason } : {}),
  };
}

export interface GateSurfaceCardProps {
  /** The step's last answer — prefilled when the run was rewound to it. */
  answer?: GraphRunAnswerDto | null;
  /** A decision is in flight: inputs disabled, spinner on. */
  busy?: boolean;
  className?: string;
  gate: Pick<GraphRunGateDto, "surface" | "title"> &
    Partial<Pick<GraphRunGateDto, "stepId" | "kind">>;
  /** Workspace search behind `ObjectPicker` fields; text input without it. */
  objectSearch?: MentionRefSearch | null;
  /** "Zurück" — rewinds to the previous step. Hidden without a handler. */
  onBack?: () => void;
  /** "Abbrechen" — stops the run after a confirm. Hidden without a handler. */
  onCancel?: () => void;
  onSubmit: (decision: GateDecision) => void;
  /** Preview only — no submit, no inputs (the canvas inspector). */
  readOnly?: boolean;
  /** The question's number, shown before the page variant's title. */
  stepNumber?: number;
  /**
   * `card` (default): a bordered card for a dock or an inspector. `page`: the
   * step IS the page — no frame, the title as the question, roomier fields.
   */
  variant?: "card" | "page";
}

/**
 * The page variant's fields: one size up, so a step reads as a question on
 * a screen of its own rather than a form in a panel. The surface's own inset
 * is taken back so the fields line up under the title, and the first button
 * of the actions row — approve, continue — is the primary one.
 */
const PAGE_SURFACE_CLASSNAME = cn(
  "-mx-2 text-base",
  "[&_label]:text-sm",
  // Typeform's field: the answer written on a line, not into a box.
  "[&_input]:h-12 [&_input]:rounded-none [&_input]:border-0 [&_input]:border-b-2 [&_input]:bg-transparent [&_input]:px-0 [&_input]:text-xl [&_input]:shadow-none [&_input]:focus-visible:border-foreground [&_input]:focus-visible:ring-0",
  "[&_textarea]:min-h-24 [&_textarea]:rounded-none [&_textarea]:border-0 [&_textarea]:border-b-2 [&_textarea]:bg-transparent [&_textarea]:px-0 [&_textarea]:text-xl [&_textarea]:shadow-none [&_textarea]:focus-visible:border-foreground [&_textarea]:focus-visible:ring-0",
  "[&_[data-object-picker-value]]:h-12 [&_[data-object-picker-value]]:rounded-none [&_[data-object-picker-value]]:border-0 [&_[data-object-picker-value]]:border-input [&_[data-object-picker-value]]:border-b-2 [&_[data-object-picker-value]]:bg-transparent [&_[data-object-picker-value]]:px-0 [&_[data-object-picker-value]]:text-xl",
  "[&_[data-a2ui-actions]]:gap-3 [&_[data-a2ui-actions]]:pt-5",
  "[&_[data-a2ui-actions]>button]:h-11 [&_[data-a2ui-actions]>button]:rounded-md [&_[data-a2ui-actions]>button]:px-6 [&_[data-a2ui-actions]>button]:text-base",
  "[&_[data-a2ui-actions]>button:first-child:hover]:bg-primary/90 [&_[data-a2ui-actions]>button:first-child]:border-transparent [&_[data-a2ui-actions]>button:first-child]:bg-primary [&_[data-a2ui-actions]>button:first-child]:text-primary-foreground [&_[data-a2ui-actions]>button:first-child]:shadow-sm",
  // Where Enter submits — a form with a one-line field — the row says so.
  "[&:has(form_input)_[data-a2ui-actions]]:after:ml-1 [&:has(form_input)_[data-a2ui-actions]]:after:text-muted-foreground [&:has(form_input)_[data-a2ui-actions]]:after:text-xs [&:has(form_input)_[data-a2ui-actions]]:after:content-(--gate-enter-hint)"
);

export function GateSurfaceCard({
  answer,
  busy = false,
  className,
  gate,
  objectSearch,
  onBack,
  onCancel,
  onSubmit,
  readOnly = false,
  stepNumber,
  variant = "card",
}: GateSurfaceCardProps) {
  const { t } = useTranslation("ai-ui");
  const { openInPanel } = useObjectDisplayIntent();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const surfaceId = `gate:${gate.stepId ?? "preview"}`;
  // An approval step's title is composed server-side, in English and naming
  // the agent's key; the reader gets the step's name in their language.
  const title =
    gate.kind === "operation_approval"
      ? t("gateSurface.operationApproval.title")
      : gate.title;

  // A shorthand gate's page is composed server-side, where nobody's language
  // is known, so its chrome — the two verdict buttons and the note field —
  // arrives in English and is relabelled here. A `surface` gate is authored
  // text and stays exactly as written.
  const components = useMemo(() => {
    if (gate.kind === "surface") {
      return gate.surface.components;
    }
    const labels: Record<string, string> = {
      approve: t("gateSurface.shorthand.approve"),
      next: t("gateSurface.shorthand.next"),
      reason: t("gateSurface.shorthand.note"),
      reject: t("gateSurface.shorthand.reject"),
    };
    return gate.surface.components.map((component) => {
      const id = typeof component.id === "string" ? component.id : "";
      return labels[id] ? { ...component, label: labels[id] } : component;
    });
  }, [gate.kind, gate.surface.components, t]);

  const { messages } = useMemo(
    () =>
      buildEngentyA2uiMessages({
        components,
        data: gate.surface.data,
        surfaceId,
      }),
    [components, gate.surface.data, surfaceId]
  );

  // The previous answer wins over the surface's own defaults, field by field:
  // a rewound step shows what the person typed last time, and a field the
  // answer never carried keeps its default.
  const initialData = useMemo(
    () =>
      answer?.data
        ? { ...(gate.surface.data ?? {}), ...answer.data }
        : undefined,
    [answer?.data, gate.surface.data]
  );

  const handleSubmit = useCallback(
    (event: string, data: Record<string, unknown>) => {
      if (busy || readOnly) {
        return;
      }
      onSubmit(gateDecisionFromSubmit(event, data));
    },
    [busy, onSubmit, readOnly]
  );

  // `open_object` is the one action that is not a submit: it promotes the
  // record into the pane where the surface has one.
  const handleAction = useCallback(
    (action: EngentyA2uiAction) => {
      if (action.name !== "open_object") {
        return;
      }
      const refValue = action.context.ref;
      const ref =
        typeof refValue === "string" ? parseObjectRef(refValue) : null;
      if (ref && openInPanel) {
        openInPanel(ref);
      }
    },
    [openInPanel]
  );

  const viewProps: EngentyA2uiSurfaceViewProps & {
    initialData?: Record<string, unknown>;
    onSubmit?: (event: string, data: Record<string, unknown>) => void;
    readOnly?: boolean;
  } = {
    initialData,
    messages,
    onAction: handleAction,
    onSubmit: handleSubmit,
    readOnly: readOnly || busy,
    surfaceId,
  };

  const footer = onBack || onCancel;
  const page = variant === "page";

  return (
    <div
      className={cn(
        !page && "rounded-lg border bg-card",
        busy && "opacity-80",
        className
      )}
      data-testid="gate-surface-card"
    >
      {title || busy ? (
        <header
          className={cn(
            "flex items-center gap-2",
            page ? "pb-5" : "px-4 pt-3.5 pb-1"
          )}
        >
          {title ? (
            page ? (
              <h1 className="min-w-0 flex-1 text-balance font-heading font-semibold text-3xl leading-tight tracking-tight sm:text-4xl">
                {stepNumber ? (
                  <span className="mr-3 inline-flex items-center gap-1 align-middle font-medium text-base text-link">
                    {stepNumber}
                    <ArrowRight aria-hidden className="size-4" />
                  </span>
                ) : null}
                {title}
              </h1>
            ) : (
              <p className="min-w-0 flex-1 font-medium text-sm">{title}</p>
            )
          ) : null}
          {busy ? (
            <Loader2
              aria-label={t("gateSurface.busy")}
              className="size-4 shrink-0 animate-spin text-muted-foreground"
            />
          ) : null}
        </header>
      ) : null}
      <div
        className={cn(
          page ? PAGE_SURFACE_CLASSNAME : "px-3 py-2",
          busy && "pointer-events-none"
        )}
        style={
          page
            ? ({
                "--gate-enter-hint": JSON.stringify(t("gateSurface.enterHint")),
              } as CSSProperties)
            : undefined
        }
      >
        <EngentyA2uiHostBoundary objectSearch={objectSearch}>
          <EngentyA2uiSurfaceView {...viewProps} />
        </EngentyA2uiHostBoundary>
      </div>
      {footer && !readOnly ? (
        <footer
          className={cn(
            "flex items-center gap-2",
            page ? "pt-6" : "border-t px-4 py-2.5"
          )}
        >
          {onBack ? (
            <Button
              className={cn(page && "-ml-3")}
              disabled={busy}
              onClick={onBack}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ArrowLeft aria-hidden className="mr-1.5 size-3.5" />
              {t("gateSurface.back")}
            </Button>
          ) : null}
          <span className="flex-1" />
          {onCancel ? (
            <Button
              className={cn(page && "-mr-3 text-muted-foreground")}
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden className="mr-1.5 size-3.5" />
              {t("gateSurface.cancel")}
            </Button>
          ) : null}
        </footer>
      ) : null}
      {onCancel ? (
        <AlertDialog onOpenChange={setConfirmCancel} open={confirmCancel}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("gateSurface.cancelConfirm.title")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("gateSurface.cancelConfirm.body")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("gateSurface.cancelConfirm.keep")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmCancel(false);
                  onCancel();
                }}
              >
                {t("gateSurface.cancelConfirm.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
