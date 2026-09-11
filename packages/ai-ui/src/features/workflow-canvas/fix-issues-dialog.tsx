// "N to fix", made actionable.
//
// The badge on the canvas toolbar knew what was wrong but offered no way to
// act on it. This dialog lists every validation issue — the validator's
// messages are deliberately written as fix instructions, so each row IS its
// suggested fix — takes an optional instruction from the user about HOW to
// fix, and runs one AI repair round with the same live progress as drafting.
// The result lands as the next draft version: governance unchanged, a human
// still reviews and publishes.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@engenty/ui-core";
import { Square, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useWorkflowRunStatus } from "../../hooks/use-workflow-run-status.js";
import { cancelAiRun } from "../../lib/runtime/runs-api.js";
import {
  DraftProgressView,
  useDraftedSteps,
  useElapsedSeconds,
} from "./draft-progress-view.js";
import type {
  GraphIssueDto,
  WorkflowDto,
  WorkflowVersionDto,
} from "./workflow-api.js";
import { useRepairWorkflowMutation } from "./workflow-queries.js";

export interface FixIssuesDialogProps {
  graph: WorkflowDto;
  issues: GraphIssueDto[];
  onOpenChange: (open: boolean) => void;
  /** The repaired version was saved — select it so the user lands on it. */
  onRepaired: (versionId: string) => void;
  /** Jump to the offending node on the canvas (the dialog closes itself). */
  onSelectNode: (entryId: string) => void;
  open: boolean;
  version: WorkflowVersionDto;
}

export function FixIssuesDialog({
  graph,
  issues,
  onOpenChange,
  onRepaired,
  onSelectNode,
  open,
  version,
}: FixIssuesDialogProps) {
  const { t } = useTranslation("ai-ui");
  const [instruction, setInstruction] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  // Once the user stops a repair, the mutation's trailing rejection is the
  // outcome they asked for — not an error to show.
  const [stopped, setStopped] = useState(false);
  const [noImprovement, setNoImprovement] = useState(false);
  const repair = useRepairWorkflowMutation(graph.id);
  const elapsedSeconds = useElapsedSeconds(repair.isPending);

  const { state: runState, cancel } = useWorkflowRunStatus(
    repair.isPending ? activeRunId : null
  );
  const steps = useDraftedSteps(repair.isPending ? runState?.text : undefined);

  // Reset on open rather than on close, so nothing visibly clears while the
  // dialog animates out.
  useEffect(() => {
    if (open) {
      setInstruction("");
      setActiveRunId(null);
      setStopped(false);
      setNoImprovement(false);
      repair.reset();
    }
  }, [open]);

  const submit = () => {
    // With zero issues this is a pure EDIT round — then the instruction is
    // the whole brief, so it must not be empty.
    if (repair.isPending || (issues.length === 0 && !instruction.trim())) {
      return;
    }
    const runId = crypto.randomUUID();
    setActiveRunId(runId);
    setStopped(false);
    setNoImprovement(false);
    const trimmed = instruction.trim();
    repair.mutate(
      {
        run_id: runId,
        version_id: version.id,
        ...(trimmed ? { instruction: trimmed } : {}),
      },
      {
        onSuccess: (result) => {
          if (result.improved) {
            onOpenChange(false);
            onRepaired(result.version.id);
          } else {
            // Nothing got better; keep the dialog open so the user can try a
            // different instruction — that IS the recovery path.
            setNoImprovement(true);
          }
        },
      }
    );
  };

  const stopRepair = () => {
    if (!activeRunId || stopped) {
      return;
    }
    setStopped(true);
    // Same shape as the create dialog: the hook's cancel handles the streaming
    // round; the direct call covers the moment after its stream closed — the
    // server registers one abort for the whole repair under our id.
    if (cancel) {
      cancel();
    } else {
      cancelAiRun(activeRunId).catch(() => {
        // The run may have just finished; the mutation settles either way.
      });
    }
  };

  const statusLine = (() => {
    if (stopped) {
      return t("workflows.fixDialog.progress.stopping");
    }
    if (runState && runState.phase !== "running") {
      return t("workflows.fixDialog.progress.finalizing");
    }
    const lastStep = steps.at(-1);
    if (lastStep) {
      return t("workflows.fixDialog.progress.addingStep", {
        label: lastStep.label,
      });
    }
    if ((runState?.steps.length ?? 0) > 0) {
      return t("workflows.fixDialog.progress.exploring");
    }
    return t("workflows.fixDialog.progress.repairing");
  })();

  const approxTokens = Math.round((runState?.text.length ?? 0) / 4);

  return (
    <Dialog
      onOpenChange={(next) => {
        // Stop is the way out while a repair runs — closing would orphan a
        // request that still saves a version.
        if (repair.isPending) {
          return;
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {issues.length === 0
              ? t("workflows.fixDialog.titleEdit")
              : t("workflows.fixDialog.title")}
          </DialogTitle>
          {repair.isPending ? null : (
            <DialogDescription>
              {issues.length === 0
                ? t("workflows.fixDialog.descriptionEdit")
                : t("workflows.fixDialog.description")}
            </DialogDescription>
          )}
        </DialogHeader>

        {repair.isPending ? (
          <DraftProgressView
            approxTokens={approxTokens}
            briefingText={
              instruction.trim() ||
              t("workflows.fixDialog.progress.brief", {
                count: issues.length,
              })
            }
            briefingTitle={graph.name}
            elapsedSeconds={elapsedSeconds}
            statusLine={statusLine}
            steps={steps}
          />
        ) : (
          <div className="space-y-4">
            {issues.length === 0 ? null : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border bg-muted/40 px-3 py-2">
                {issues.map((issue) => {
                  const body = (
                    <>
                      <Badge className="shrink-0" variant="outline">
                        {issue.code}
                      </Badge>
                      <span className="min-w-0 text-xs leading-relaxed">
                        {issue.message}
                      </span>
                    </>
                  );
                  return (
                    <li key={issue.path + issue.code}>
                      {issue.entryId ? (
                        <button
                          className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-accent"
                          onClick={() => {
                            onOpenChange(false);
                            onSelectNode(issue.entryId as string);
                          }}
                          type="button"
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="flex items-start gap-2 px-1 py-0.5">
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fix-instruction">
                {issues.length === 0
                  ? t("workflows.fixDialog.instructionLabelEdit")
                  : t("workflows.fixDialog.instructionLabel")}
              </Label>
              <Textarea
                className="min-h-16 resize-none"
                id="fix-instruction"
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={t("workflows.fixDialog.instructionPlaceholder")}
                value={instruction}
              />
            </div>

            {noImprovement ? (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-400">
                {t("workflows.fixDialog.noImprovement")}
              </p>
            ) : null}

            {repair.isError && !stopped ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
                {repair.error instanceof Error &&
                repair.error.name === "TimeoutError"
                  ? t("workflows.fixDialog.errorTimeout")
                  : t("workflows.fixDialog.errorGeneric")}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {repair.isPending ? (
            <Button
              disabled={stopped}
              onClick={stopRepair}
              size="sm"
              variant="ghost"
            >
              <Square aria-hidden className="mr-1.5 size-3" />
              {t("workflows.fixDialog.stop")}
            </Button>
          ) : (
            <>
              <Button
                onClick={() => onOpenChange(false)}
                size="sm"
                variant="ghost"
              >
                {t("workflows.fixDialog.cancel")}
              </Button>
              <Button
                disabled={issues.length === 0 && !instruction.trim()}
                onClick={submit}
                size="sm"
              >
                <Wrench aria-hidden className="mr-1.5 size-3.5" />
                {issues.length === 0
                  ? t("workflows.fixDialog.submitEdit")
                  : t("workflows.fixDialog.submit", {
                      count: issues.length,
                    })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
