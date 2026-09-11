// "New flow" — describe it, and the assistant draws it.
//
// The description field is the point of this dialog, not a nicety: authoring a
// declarative graph by hand means writing mapping entries with JSON-string
// mapConfigs, which nobody should have to do to get started. So the primary
// input is a sentence, and what comes back is a real graph on the canvas that a
// human then reviews and publishes. Governance is unchanged — a drafted version
// is saved UNAPPROVED and cannot run until someone publishes it, which is why
// drafting can be this frictionless.
//
// Drafting takes minutes, and minutes of static spinner read as broken. The
// dialog therefore watches the drafting run itself: it mints the run id, sends
// it with the request, attaches the run's event stream, and shows the steps as
// the model writes them — plus a ticking clock, because a timer that moves is
// the cheapest possible proof that the work hasn't died.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@engenty/ui-core";
import { Sparkles, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { useWorkflowRunStatus } from "../../hooks/use-workflow-run-status.js";
import { cancelAiRun } from "../../lib/runtime/runs-api.js";
import {
  DraftProgressView,
  useDraftedSteps,
  useElapsedSeconds,
} from "./draft-progress-view.js";
import { useDraftWorkflowMutation } from "./workflow-queries.js";

export interface CreateWorkflowDialogProps {
  /** Subject the new flow runs against, when created from a subject's context. */
  contextType?: string | null;
  onCreated: (graphId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * Turn a failure into something the user can act on.
 *
 * Raw error codes and stack-shaped messages are the default here otherwise, and
 * the two failures that actually happen — a name already in use, and a model
 * that returned prose instead of a graph — both have an obvious next move.
 */
function draftErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const code = (error as { code?: string } | null)?.code ?? "";
  if (message.includes("nameTaken") || code.includes("nameTaken")) {
    return "workflows.createDialog.errorNameTaken";
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "workflows.createDialog.errorTimeout";
  }
  return "workflows.createDialog.errorGeneric";
}

export function CreateWorkflowDialog({
  contextType,
  onCreated,
  onOpenChange,
  open,
}: CreateWorkflowDialogProps) {
  const { t } = useTranslation("ai-ui");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  // Once the user stops a draft, the mutation's trailing rejection is the
  // outcome they asked for — not an error to show.
  const [stopped, setStopped] = useState(false);
  // A draft the CHAT tier drew (no planning model bound) is shown before the
  // dialog closes: a weak-tier draft looks exactly like a strong one on the
  // canvas, so the one honest moment to say so is here.
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const draft = useDraftWorkflowMutation();
  const elapsedSeconds = useElapsedSeconds(draft.isPending);

  const { state: runState, cancel } = useWorkflowRunStatus(
    draft.isPending ? activeRunId : null
  );
  const steps = useDraftedSteps(draft.isPending ? runState?.text : undefined);

  // Reset on open rather than on close: clearing while the dialog animates out
  // makes the fields visibly empty during the transition.
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setActiveRunId(null);
      setStopped(false);
      setFallbackNotice(null);
      draft.reset();
    }
  }, [open]);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const canSubmit =
    trimmedName.length > 0 && trimmedDescription.length > 0 && !draft.isPending;

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    const runId = crypto.randomUUID();
    setActiveRunId(runId);
    setStopped(false);
    draft.mutate(
      {
        description: trimmedDescription,
        name: trimmedName,
        run_id: runId,
        ...(contextType ? { context_type: contextType } : {}),
      },
      {
        onSuccess: (result) => {
          if (result.drafted_with_fallback_tier) {
            setFallbackNotice(result.graph.id);
            return;
          }
          onOpenChange(false);
          onCreated(result.graph.id);
        },
      }
    );
  };

  const stopDrafting = () => {
    if (!activeRunId || stopped) {
      return;
    }
    setStopped(true);
    // The hook's cancel handles the streaming round; past it (the repair
    // round runs under an internal id) the cancel route still aborts the
    // whole draft — the server registers ONE abort spanning both rounds
    // under the id we minted.
    if (cancel) {
      cancel();
    } else {
      cancelAiRun(activeRunId).catch(() => {
        // The run may have just finished; the mutation settles either way.
      });
    }
  };

  // What the one-line status should say, in order of specificity: the user's
  // stop wins, then the latest step the model wrote, then the coarse phase.
  const statusLine = (() => {
    if (stopped) {
      return t("workflows.createDialog.progress.stopping");
    }
    if (runState && runState.phase !== "running") {
      // Round 1's stream closed but the response hasn't come back: the server
      // is validating, running a repair round, or saving.
      return t("workflows.createDialog.progress.finalizing");
    }
    const lastStep = steps.at(-1);
    if (lastStep) {
      return t("workflows.createDialog.progress.addingStep", {
        label: lastStep.label,
      });
    }
    // Watched live: before writing any JSON the model spends its first minute
    // searching the tool registry (engenty_tools_search etc.) — those arrive
    // as tool-call steps on the run stream. Saying so beats a generic
    // "designing" that looks stalled.
    if ((runState?.steps.length ?? 0) > 0) {
      return t("workflows.createDialog.progress.exploring");
    }
    return t("workflows.createDialog.progress.designing");
  })();

  // Suppressed while tiny: the thinking phase emits almost no text, and
  // "≈ 1 token" sitting next to a minutes-old timer reads as a stall.
  const approxTokens = Math.round((runState?.text.length ?? 0) / 4);

  return (
    <Dialog
      onOpenChange={(next) => {
        // Closing mid-draft would orphan a request that still creates a flow;
        // Stop is the way out while drafting.
        if (draft.isPending) {
          return;
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("workflows.createDialog.title")}</DialogTitle>
          {draft.isPending ? null : (
            <DialogDescription>
              {t("workflows.createDialog.description")}
            </DialogDescription>
          )}
        </DialogHeader>

        {draft.isPending ? (
          // The form has done its job — what was typed becomes the briefing
          // at the top, and the freed space belongs to the progress: the flow
          // steps appearing as the model writes them.
          <DraftProgressView
            approxTokens={approxTokens}
            briefingText={trimmedDescription}
            briefingTitle={trimmedName}
            elapsedSeconds={elapsedSeconds}
            statusLine={statusLine}
            steps={steps}
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="flow-name">
                {t("workflows.createDialog.nameLabel")}
              </Label>
              <Input
                autoFocus
                id="flow-name"
                onChange={(event) => setName(event.target.value)}
                placeholder={t("workflows.createDialog.namePlaceholder")}
                value={name}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flow-description">
                {t("workflows.createDialog.descriptionLabel")}
              </Label>
              <Textarea
                className="min-h-24 resize-none"
                id="flow-description"
                onChange={(event) => setDescription(event.target.value)}
                // Cmd/Ctrl+Enter submits: the description is multi-line, so a
                // bare Enter has to keep meaning "new line".
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder={t("workflows.createDialog.descriptionPlaceholder")}
                value={description}
              />
              <p className="text-muted-foreground text-xs">
                {t("workflows.createDialog.approvalHint")}
              </p>
            </div>

            {trimmedDescription.length === 0 ? (
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs">
                  {t("workflows.createDialog.examplesLabel")}
                </p>
                <div className="flex flex-col gap-1.5">
                  {/* Examples, not placeholders-as-instructions: each is a
                      complete flow with a gate and a wait in it, because the
                      fastest way to teach what this thing can do is to show
                      the shape of a good answer. */}
                  {(["example1", "example2", "example3"] as const).map(
                    (key) => {
                      const example = t(`workflows.createDialog.${key}`);
                      return (
                        <button
                          className="rounded-md border border-dashed px-2.5 py-1.5 text-left text-muted-foreground text-xs leading-relaxed transition-colors hover:border-solid hover:bg-accent hover:text-foreground"
                          key={key}
                          onClick={() => setDescription(example)}
                          type="button"
                        >
                          {example}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            ) : null}

            {draft.isError && !stopped ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
                {t(draftErrorKey(draft.error))}
              </p>
            ) : null}
          </div>
        )}

        {fallbackNotice ? (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/[0.06] px-3 py-2.5">
            <p className="font-medium text-amber-700 text-sm dark:text-amber-300">
              {t("workflows.fallbackTierChip")}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              {t("workflows.fallbackTierBody")}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          {fallbackNotice ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                onCreated(fallbackNotice);
              }}
              size="sm"
            >
              {t("workflows.createDialog.open")}
            </Button>
          ) : draft.isPending ? (
            <Button
              disabled={stopped}
              onClick={stopDrafting}
              size="sm"
              variant="ghost"
            >
              <Square aria-hidden className="mr-1.5 size-3" />
              {t("workflows.createDialog.stop")}
            </Button>
          ) : (
            <>
              <Button
                onClick={() => onOpenChange(false)}
                size="sm"
                variant="ghost"
              >
                {t("workflows.createDialog.cancel")}
              </Button>
              <Button disabled={!canSubmit} onClick={submit} size="sm">
                <Sparkles aria-hidden className="mr-1.5 size-3.5" />
                {t("workflows.createDialog.submit")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
