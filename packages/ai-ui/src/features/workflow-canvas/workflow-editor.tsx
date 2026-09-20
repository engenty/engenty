"use client";

// The workflow editor: the one surface a workflow is read and changed on, whether
// it opens as a section of a page or as a modal over the desk.
//
// Authoring is conversational — the composer at the bottom runs one AI round
// that lands as the next draft version, and the canvas re-renders it. The
// toolbar carries only what you READ or SWITCH: whether the definition is
// valid, which version, canvas or raw JSON. Publishing is the human gate on
// tenant-authored automation, so it goes to the host's own primary-action slot
// — the app topbar on a page, the dialog header in a modal — rather than
// competing with the toolbar.
//
// Runs are not here. What a workflow DID is a different subject from what it
// IS, and the host page gives it its own section.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, Skeleton, Textarea } from "@engenty/ui-core";
import {
  AlertTriangle,
  ArrowUp,
  Braces,
  Check,
  CheckCheck,
  FileJson,
  History,
  Maximize2,
  Minimize2,
  Play,
  Rocket,
  Wand2,
  Workflow,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { WorkspaceCodeEditor } from "../agents-workspace/workspace-code-editor.js";
import { ContextPanel } from "./context-panel.js";
import { ContractPanel } from "./contract-panel.js";
import { FixIssuesDialog } from "./fix-issues-dialog.js";
import {
  contractSideForNodeId,
  type StoredGraph,
  storedGraphToCanvas,
} from "./graph-model.js";
import { NodeInspector } from "./node-inspector.js";
import {
  type GraphIssueDto,
  validateWorkflow,
  type WorkflowVersionDto,
} from "./workflow-api.js";
import { WorkflowCanvas } from "./workflow-canvas.js";
import {
  useGraphValidationQuery,
  usePublishVersionMutation,
  useRepairWorkflowMutation,
  useRunWorkflowMutation,
  useSaveVersionMutation,
  useUpdateWorkflowMutation,
  useWorkflowQuery,
} from "./workflow-queries.js";

export interface WorkflowEditorProps {
  /**
   * Whether the host is currently giving the canvas the whole content area.
   * The toggle lives here because it belongs next to the other view switches,
   * but what "expanded" LOOKS like is the host page's layout, not ours.
   * Omit `onToggleExpanded` and no toggle is drawn.
   */
  expanded?: boolean;
  graphId: string;
  /**
   * Hands the primary action (Publish, or Run once published) to the host so
   * it lands where that host puts primary actions. Rendered here rather than
   * by the host because which button it is depends on state this component
   * owns: the selected version and its error count.
   */
  onPrimaryAction?: (node: ReactNode) => void;
  onToggleExpanded?: () => void;
}

export function WorkflowEditor({
  expanded = false,
  graphId,
  onPrimaryAction,
  onToggleExpanded,
}: WorkflowEditorProps) {
  const { t } = useTranslation("ai-ui");
  const detail = useWorkflowQuery(graphId);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [fixDialogOpen, setFixDialogOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [noImprovement, setNoImprovement] = useState(false);
  // Canvas or the raw definition. The code view is an EDITOR: a save mints the
  // next draft version through the same route as every other edit.
  const [view, setView] = useState<"canvas" | "code">("canvas");
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  // Result of the last "Validate & format" round — cleared on every edit.
  const [codeCheck, setCodeCheck] = useState<{
    issues: GraphIssueDto[];
    valid: boolean;
  } | null>(null);
  const [codeChecking, setCodeChecking] = useState(false);

  const publish = usePublishVersionMutation(graphId);
  const repair = useRepairWorkflowMutation(graphId);
  const runNow = useRunWorkflowMutation(graphId);
  const saveVersion = useSaveVersionMutation(graphId);
  // The surface is a row field, not a version field: switching it does not
  // mint a version. A wizard needs a gate — the server refuses the switch
  // otherwise, and the error lands under the toolbar.
  const updateRow = useUpdateWorkflowMutation(graphId);

  const graphRow = detail.data?.graph ?? null;
  const versions = detail.data?.versions ?? [];
  const version = useMemo(() => {
    if (selectedVersionId) {
      const picked = versions.find((entry) => entry.id === selectedVersionId);
      if (picked) {
        return picked;
      }
    }
    // Default to the published version when there is one — that's what runs.
    return (
      versions.find((entry) => entry.version === graphRow?.current_version) ??
      versions.reduce<WorkflowVersionDto | undefined>(
        (latest, entry) =>
          !latest || entry.version > latest.version ? entry : latest,
        undefined
      )
    );
  }, [graphRow?.current_version, selectedVersionId, versions]);

  const validation = useGraphValidationQuery(version?.graph ?? null);
  const issues = validation.data?.issues ?? [];
  const canvasModel = useMemo(
    () =>
      version ? storedGraphToCanvas(version.graph, { contract: true }) : null,
    [version]
  );
  const selectedNode =
    canvasModel?.nodes.find((node) => node.id === selectedNodeId)?.data ?? null;
  // Picking a contract end IS opening the editor for it — the node is the only
  // way in, so there is nothing to keep in sync with a separate toggle.
  const contractSide = contractSideForNodeId(selectedNodeId);
  // A row reconciled from a module's shipped file: the file is the definition
  // and every reconcile heartbeat republishes it, so this reads it rather than
  // pretending an edit here would last.
  const readOnly = Boolean(graphRow?.source_workflow_id);
  const isWizard = graphRow?.surface === "wizard";
  // One rail, three things it can be. A node and the ambient context are
  // different subjects, so opening either drops the other rather than stacking
  // them.
  const selectNode = (id: string | null) => {
    setContextOpen(false);
    setSelectedNodeId(id);
  };
  const openContext = () => {
    setSelectedNodeId(null);
    setContextOpen(true);
  };

  const errorCount = issues.filter(
    (issue) => issue.code !== "capability-missing"
  ).length;
  const warningCount = issues.length - errorCount;
  const isPublished = Boolean(version?.approved_at);

  // `mutate` is stable across renders; the mutation object is not, so depending
  // on these rather than on `publish`/`runNow` keeps the memo from rebuilding
  // (and the host from re-registering) on every render.
  const publishMutate = publish.mutate;
  const runMutate = runNow.mutate;
  const publishPending = publish.isPending;
  const runPending = runNow.isPending;

  const primaryAction = useMemo<ReactNode>(() => {
    if (!(graphRow && version)) {
      return null;
    }
    if (graphRow.source_workflow_id && !isPublished) {
      // Reconcile publishes what it materializes; there is no human gate to
      // offer here, and a draft on this row is not one a person made.
      return null;
    }
    return isPublished ? (
      <Button
        disabled={runPending || graphRow.status !== "active"}
        onClick={() => runMutate({ input: {} })}
        size="sm"
      >
        <Play className="mr-1.5 size-3.5" />
        {t("workflows.editor.runNow")}
      </Button>
    ) : (
      <Button
        // Publishing is the human gate: a version nobody approved never runs,
        // so this is disabled while the graph still has real errors.
        disabled={publishPending || errorCount > 0}
        onClick={() => publishMutate(version.id)}
        size="sm"
      >
        <Rocket className="mr-1.5 size-3.5" />
        {t("workflows.editor.publish", { version: version.version })}
      </Button>
    );
  }, [
    errorCount,
    graphRow,
    isPublished,
    publishMutate,
    publishPending,
    runMutate,
    runPending,
    t,
    version,
  ]);

  useEffect(() => {
    onPrimaryAction?.(primaryAction);
    // Clear on unmount so the host doesn't keep a button for a screen the user
    // has left.
    return () => onPrimaryAction?.(null);
  }, [onPrimaryAction, primaryAction]);

  const versionLabel = (entry: WorkflowVersionDto) =>
    [
      `v${entry.version}`,
      entry.approved_at ? null : t("workflows.editor.draft"),
      entry.authored_by === "copilot" ? t("workflows.editor.byAi") : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const submitInstruction = () => {
    const trimmed = instruction.trim();
    if (!(trimmed && version) || repair.isPending) {
      return;
    }
    setNoImprovement(false);
    repair.mutate(
      {
        instruction: trimmed,
        run_id: crypto.randomUUID(),
        version_id: version.id,
      },
      {
        onSuccess: (result) => {
          if (result.improved) {
            setInstruction("");
            setSelectedVersionId(result.version.id);
          } else {
            // Nothing got better; keep the instruction so the user can sharpen
            // it — that IS the recovery path.
            setNoImprovement(true);
          }
        },
      }
    );
  };

  const parseCodeDraft = (text: string): StoredGraph | null => {
    let parsed: StoredGraph;
    try {
      parsed = JSON.parse(text) as StoredGraph;
    } catch (err) {
      setCodeError(
        err instanceof Error ? err.message : t("workflows.editor.invalidJson")
      );
      return null;
    }
    if (!Array.isArray(parsed.graph)) {
      setCodeError(t("workflows.editor.graphMustBeList"));
      return null;
    }
    return parsed;
  };

  if (detail.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  if (!(graphRow && version)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">
          {detail.isError
            ? t("workflows.editor.loadFailed")
            : t("workflows.editor.noVersion")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <FixIssuesDialog
        graph={graphRow}
        issues={issues}
        onOpenChange={setFixDialogOpen}
        onRepaired={(versionId) => {
          // Land on the repaired version; the validation query recomputes the
          // badge from the new graph on its own.
          setSelectedVersionId(versionId);
          setSelectedNodeId(null);
        }}
        onSelectNode={(entryId) => setSelectedNodeId(entryId)}
        open={fixDialogOpen}
        version={version}
      />

      {/* Everything here is STATE you read or switch: is it valid, which
          version, canvas or code. Deliberately compact — it's a strip above
          the canvas, and the canvas is what deserves the height. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-card px-3 py-2">
        {/* The fastest way to "what's wrong?", and the way to do something
            about it: it opens the fix dialog. */}
        {issues.length > 0 ? (
          <button
            className={cn(
              "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px]",
              errorCount > 0
                ? "border-destructive/50 text-destructive"
                : "border-amber-500/50 text-amber-600 dark:text-amber-400"
            )}
            disabled={readOnly}
            onClick={() => setFixDialogOpen(true)}
            type="button"
          >
            <AlertTriangle className="size-3" />
            {errorCount > 0
              ? t("workflows.editor.toFix", { count: errorCount })
              : null}
            {errorCount > 0 && warningCount > 0 ? " · " : null}
            {warningCount > 0
              ? t("workflows.editor.warning", { count: warningCount })
              : null}
          </button>
        ) : (
          <span className="flex h-7 items-center gap-1 rounded-md border border-emerald-500/40 px-2 text-[11px] text-emerald-600 dark:text-emerald-400">
            <Check className="size-3" />
            {t("workflows.editor.valid")}
          </span>
        )}

        {/* State, request context and metadata: definition fields that are not
            a step, so no node draws them. Bundled or not — reading them is the
            point. */}
        <button
          aria-pressed={contextOpen}
          className={cn(
            "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
            contextOpen
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => (contextOpen ? setContextOpen(false) : openContext())}
          type="button"
        >
          <Braces className="size-3" />
          {t("workflows.editor.context")}
        </button>

        {/* Chat or wizard: where a run's gates are answered. A module row's
            flag comes from its file, so it is shown, not switched. */}
        {readOnly ? (
          isWizard ? (
            <span className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground">
              <Wand2 aria-hidden className="size-3" />
              {t("workflows.surface.wizard", { defaultValue: "Wizard" })}
            </span>
          ) : null
        ) : (
          <button
            aria-pressed={isWizard}
            className={cn(
              "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
              isWizard
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            disabled={updateRow.isPending}
            onClick={() =>
              updateRow.mutate({ surface: isWizard ? "chat" : "wizard" })
            }
            title={t("workflows.surface.toggleHint", {
              defaultValue:
                "Wizard: the person who starts it answers one page per gate. Off: the cards land in the specialist's chat.",
            })}
            type="button"
          >
            <Wand2 aria-hidden className="size-3" />
            {t("workflows.surface.wizard", { defaultValue: "Wizard" })}
          </button>
        )}

        <label className="flex items-center gap-1">
          <History aria-hidden className="size-3 text-muted-foreground" />
          <span className="sr-only">{t("workflows.editor.version")}</span>
          <select
            className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px]"
            onChange={(event) => {
              setSelectedVersionId(event.target.value);
              setSelectedNodeId(null);
              setCodeDraft(null);
              setCodeCheck(null);
              setCodeError(null);
            }}
            value={version.id}
          >
            {versions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {versionLabel(entry)}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-0.5 rounded-md border p-0.5">
          <button
            aria-label={t("workflows.editor.canvasView")}
            aria-pressed={view === "canvas"}
            className={cn(
              "rounded p-1 transition-colors",
              view === "canvas"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setView("canvas")}
            type="button"
          >
            <Workflow className="size-3.5" />
          </button>
          <button
            aria-label={t("workflows.editor.codeView")}
            aria-pressed={view === "code"}
            className={cn(
              "rounded p-1 transition-colors",
              view === "code"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setView("code")}
            type="button"
          >
            <FileJson className="size-3.5" />
          </button>
          {onToggleExpanded ? (
            <button
              aria-label={
                expanded
                  ? t("workflows.editor.collapse")
                  : t("workflows.editor.expand")
              }
              aria-pressed={expanded}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              onClick={onToggleExpanded}
              title={
                expanded
                  ? t("workflows.editor.collapse")
                  : t("workflows.editor.expand")
              }
              type="button"
            >
              {expanded ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {updateRow.isError ? (
        <p className="shrink-0 border-b px-3 py-1.5 text-destructive text-xs">
          {updateRow.error instanceof Error
            ? updateRow.error.message
            : t("workflows.surface.switchFailed", {
                defaultValue: "The surface could not be changed.",
              })}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {view === "code" ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <WorkspaceCodeEditor
              filePath="flow.json"
              onChange={(next) => {
                setCodeDraft(next);
                setCodeError(null);
                setCodeCheck(null);
              }}
              readOnly={readOnly}
              value={codeDraft ?? JSON.stringify(version.graph, null, 2)}
            />
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-3 py-2">
              <Button
                disabled={codeChecking}
                onClick={async () => {
                  const pristine = JSON.stringify(version.graph, null, 2);
                  const parsed = parseCodeDraft(codeDraft ?? pristine);
                  if (!parsed) {
                    setCodeCheck(null);
                    return;
                  }
                  const formatted = JSON.stringify(parsed, null, 2);
                  setCodeDraft(formatted === pristine ? null : formatted);
                  setCodeError(null);
                  setCodeChecking(true);
                  setCodeCheck(null);
                  try {
                    setCodeCheck(await validateWorkflow(parsed));
                  } catch (err) {
                    setCodeError(
                      err instanceof Error
                        ? err.message
                        : t("workflows.editor.validationFailed")
                    );
                  } finally {
                    setCodeChecking(false);
                  }
                }}
                size="sm"
                variant="outline"
              >
                <CheckCheck className="mr-1.5 size-3.5" />
                {t("workflows.editor.validateFormat")}
              </Button>
              {readOnly ? null : (
                <Button
                  disabled={codeDraft === null || saveVersion.isPending}
                  onClick={() => {
                    if (codeDraft === null) {
                      return;
                    }
                    const parsed = parseCodeDraft(codeDraft);
                    if (!parsed) {
                      return;
                    }
                    saveVersion.mutate(
                      { authored_by: "user", graph: parsed },
                      {
                        onSuccess: (result) => {
                          setCodeDraft(null);
                          setSelectedVersionId(result.version.id);
                        },
                      }
                    );
                  }}
                  size="sm"
                >
                  {t("workflows.editor.saveVersion")}
                </Button>
              )}
              {codeDraft === null ? null : (
                <Button
                  disabled={saveVersion.isPending}
                  onClick={() => {
                    setCodeDraft(null);
                    setCodeError(null);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {t("workflows.editor.discard")}
                </Button>
              )}
              {codeError ? (
                <p className="text-destructive text-xs">{codeError}</p>
              ) : saveVersion.isError ? (
                <p className="text-destructive text-xs">
                  {saveVersion.error instanceof Error
                    ? saveVersion.error.message
                    : t("workflows.editor.saveFailed")}
                </p>
              ) : codeChecking ? (
                <p className="text-muted-foreground text-xs">
                  {t("workflows.editor.checking")}
                </p>
              ) : codeCheck ? (
                codeCheck.valid ? (
                  <p className="text-emerald-600 text-xs dark:text-emerald-400">
                    {t("workflows.editor.valid")}
                  </p>
                ) : (
                  <p className="min-w-0 truncate text-destructive text-xs">
                    {codeCheck.issues.length === 1
                      ? codeCheck.issues[0]?.message
                      : t("workflows.editor.problems", {
                          count: codeCheck.issues.length,
                          message: codeCheck.issues[0]?.message ?? "",
                        })}
                  </p>
                )
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <WorkflowCanvas
              className="min-w-0 flex-1"
              graph={version.graph}
              issues={issues}
              mode="author"
              onSelectNode={selectNode}
              selectedNodeId={selectedNodeId}
              showContract
            />
            {contractSide ? (
              <aside className="w-[380px] shrink-0 border-l bg-card">
                {/* The contract IS hand-editable — a field list is not a step,
                    and prompting for it would be the wrong grammar. Saves mint
                    the next version through the same route as every other
                    edit. */}
                <ContractPanel
                  busy={saveVersion.isPending}
                  graph={version.graph}
                  key={`${version.id}-${contractSide}`}
                  onClose={() => setSelectedNodeId(null)}
                  onSave={(next) =>
                    saveVersion.mutate(
                      { authored_by: "user", graph: next },
                      {
                        onSuccess: (result) => {
                          setSelectedNodeId(null);
                          setSelectedVersionId(result.version.id);
                        },
                      }
                    )
                  }
                  readOnly={readOnly}
                  side={contractSide}
                />
              </aside>
            ) : contextOpen ? (
              <aside className="w-[380px] shrink-0 border-l bg-card">
                <ContextPanel
                  busy={saveVersion.isPending}
                  graph={version.graph}
                  key={version.id}
                  onClose={() => setContextOpen(false)}
                  onSave={(next) =>
                    saveVersion.mutate(
                      { authored_by: "user", graph: next },
                      {
                        onSuccess: (result) => {
                          setContextOpen(false);
                          setSelectedVersionId(result.version.id);
                        },
                      }
                    )
                  }
                  readOnly={readOnly}
                />
              </aside>
            ) : selectedNode ? (
              <NodeInspector
                issues={issues}
                node={selectedNode}
                onClose={() => setSelectedNodeId(null)}
              />
            ) : null}
          </>
        )}
      </div>

      {/* Editing IS prompting — there is no manual node editor, on purpose.
          One instruction, one AI round, the result lands as the next draft and
          a human still publishes. It sits at the bottom because that is where
          you type to something that answers. */}
      {readOnly ? (
        <p className="shrink-0 border-t px-3 py-2 text-muted-foreground text-xs">
          {t("workflows.editor.bundled")}
        </p>
      ) : (
        <div className="shrink-0 space-y-1.5 border-t px-3 py-2">
          <div className="flex items-end gap-2">
            <Textarea
              aria-label={t("workflows.editor.describeChange")}
              className="max-h-32 min-h-10 flex-1 resize-none text-sm [field-sizing:content]"
              disabled={repair.isPending}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitInstruction();
                }
              }}
              placeholder={t("workflows.editor.describePlaceholder")}
              value={instruction}
            />
            <Button
              aria-label={t("workflows.editor.applyChange")}
              disabled={repair.isPending || !instruction.trim()}
              onClick={submitInstruction}
              size="icon"
              type="button"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
          {repair.isPending ? (
            <p className="text-muted-foreground text-xs">
              {t("workflows.editor.reworking")}
            </p>
          ) : null}
          {noImprovement ? (
            <p className="text-muted-foreground text-xs">
              {t("workflows.editor.noImprovement")}
            </p>
          ) : null}
          {repair.isError ? (
            <p className="text-destructive text-xs">
              {repair.error instanceof Error
                ? repair.error.message
                : t("workflows.editor.changeFailed")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
