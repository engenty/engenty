"use client";

// One step of a run, drawn as the surface the gate suspended with.
//
// The card has no logic of its own beyond turning a surface submit into a
// resume decision: the submit action's name is the event, the data model is
// the answer, and `reject` is the one event that reads as "no". Whether a
// document sits beside it, what free text means, what "no" leads to — all of
// that is the graph's, visible on the canvas. The wizard page hosts this card
// full-width, the agent desk docks it above the composer; the card is the
// same.

import {
  buildEngentyA2uiMessages,
  type EngentyA2uiAction,
  EngentyA2uiSurfaceView,
  type EngentyA2uiSurfaceViewProps,
} from "@engenty/a2ui-catalog";
import { parseObjectRef } from "@engenty/ai-core/browser";
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
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
}

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
}: GateSurfaceCardProps) {
  const { t } = useTranslation("ai-ui");
  const { openInPanel } = useObjectDisplayIntent();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const surfaceId = `gate:${gate.stepId ?? "preview"}`;

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

  return (
    <div
      className={cn(
        "rounded-lg border bg-card",
        busy && "opacity-80",
        className
      )}
      data-testid="gate-surface-card"
    >
      {gate.title || busy ? (
        <header className="flex items-center gap-2 px-4 pt-3.5 pb-1">
          {gate.title ? (
            <p className="min-w-0 flex-1 font-medium text-sm">{gate.title}</p>
          ) : null}
          {busy ? (
            <Loader2
              aria-label={t("gateSurface.busy")}
              className="size-4 shrink-0 animate-spin text-muted-foreground"
            />
          ) : null}
        </header>
      ) : null}
      <div className={cn("px-3 py-2", busy && "pointer-events-none")}>
        <EngentyA2uiHostBoundary objectSearch={objectSearch}>
          <EngentyA2uiSurfaceView {...viewProps} />
        </EngentyA2uiHostBoundary>
      </div>
      {footer && !readOnly ? (
        <footer className="flex items-center gap-2 border-t px-4 py-2.5">
          {onBack ? (
            <Button
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
