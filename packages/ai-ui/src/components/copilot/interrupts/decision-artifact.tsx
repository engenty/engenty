"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { isFrontendToolOpenInterrupt } from "@engenty/ag-ui-bridge";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, Input } from "@engenty/ui-core";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

/** Server tool-approval artifacts use stable ids — localize their display
 *  client-side (the server builds English strings; the choice labels SENT
 *  back stay canonical so the model/audit trail is unaffected). */
const TOOL_APPROVAL_ARTIFACT_PREFIX = "tool-approval|";
const TOOL_APPROVAL_CHOICE_LABEL_KEYS: Record<string, string> = {
  approve_always: "copilot.toolApproval.approveAlways",
  approve_once: "copilot.toolApproval.approveOnce",
  deny: "copilot.toolApproval.deny",
};

export interface DecisionArtifactChoice {
  description?: string;
  id: string;
  label: string;
}

export interface DecisionArtifact {
  artifactId: string;
  body?: string;
  choices: DecisionArtifactChoice[];
  interruptId?: string;
  /** Checkbox mode: several choices (plus an optional custom answer) at once. */
  multiSelect?: boolean;
  title: string;
}

export function decisionArtifactFromOpenInterrupt(
  open: AgUiOpenInterruptMetadata
): DecisionArtifact | null {
  if (isFrontendToolOpenInterrupt(open)) {
    return null;
  }
  if (!open.choices?.length) {
    return null;
  }
  return {
    artifactId: open.artifact_id,
    body: open.body,
    choices: open.choices,
    interruptId: open.interrupt_id,
    ...(open.multi_select ? { multiSelect: true } : {}),
    title: open.title,
  };
}

function readDecisionArtifactKeys(value: unknown): {
  artifactId: string | null;
  interruptId: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { artifactId: null, interruptId: null };
  }
  const raw = value as { artifact_id?: unknown; interrupt_id?: unknown };
  return {
    artifactId:
      typeof raw.artifact_id === "string" ? raw.artifact_id.trim() : null,
    interruptId:
      typeof raw.interrupt_id === "string" ? raw.interrupt_id.trim() : null,
  };
}

function openInterruptMatchesToolOutput(
  open: AgUiOpenInterruptMetadata,
  output: unknown
): boolean {
  const { artifactId, interruptId } = readDecisionArtifactKeys(output);
  const openKey = open.interrupt_id ?? open.artifact_id;
  if (!openKey) {
    return false;
  }
  return (
    openKey === artifactId ||
    openKey === interruptId ||
    open.artifact_id === artifactId ||
    open.interrupt_id === interruptId
  );
}

/** Prefer transcript output; fall back to session open-interrupt metadata after reload. */
export function resolveDecisionArtifactForToolCall(
  output: unknown,
  open: AgUiOpenInterruptMetadata | null | undefined
): DecisionArtifact | null {
  const fromOutput = parseDecisionArtifact(output);
  if (fromOutput) {
    return fromOutput;
  }
  if (!open || isFrontendToolOpenInterrupt(open)) {
    return null;
  }
  if (output != null && !openInterruptMatchesToolOutput(open, output)) {
    return null;
  }
  return decisionArtifactFromOpenInterrupt(open);
}

export function parseDecisionArtifact(value: unknown): DecisionArtifact | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as {
    artifact_id?: unknown;
    artifact_type?: unknown;
    body?: unknown;
    choices?: unknown;
    interrupt_id?: unknown;
    multi_select?: unknown;
    title?: unknown;
  };
  if (
    typeof raw.artifact_id !== "string" ||
    raw.artifact_type !== "decision" ||
    !Array.isArray(raw.choices)
  ) {
    return null;
  }
  const choices = raw.choices.flatMap((choice) => {
    if (!choice || typeof choice !== "object") {
      return [];
    }
    const c = choice as {
      description?: unknown;
      id?: unknown;
      label?: unknown;
    };
    if (typeof c.id !== "string" || typeof c.label !== "string") {
      return [];
    }
    return [
      {
        id: c.id,
        label: c.label,
        ...(typeof c.description === "string" && c.description.trim()
          ? { description: c.description.trim() }
          : {}),
      },
    ];
  });
  if (choices.length === 0) {
    return null;
  }
  return {
    artifactId: raw.artifact_id,
    body: typeof raw.body === "string" ? raw.body : undefined,
    choices,
    interruptId:
      typeof raw.interrupt_id === "string" ? raw.interrupt_id : undefined,
    ...(raw.multi_select === true ? { multiSelect: true } : {}),
    title: typeof raw.title === "string" ? raw.title : "Decision needed",
  };
}

/** Resolved choice label from persisted tool output, when present. */
export function parseDecisionResolution(output: unknown): string | null {
  if (!output || typeof output !== "object") {
    return null;
  }
  const raw = output as {
    choice_id?: unknown;
    choice_label?: unknown;
  };
  const choiceLabel =
    typeof raw.choice_label === "string" ? raw.choice_label.trim() : "";
  if (choiceLabel) {
    return choiceLabel;
  }
  const choiceId =
    typeof raw.choice_id === "string" ? raw.choice_id.trim() : "";
  if (!choiceId) {
    return null;
  }
  const artifact = parseDecisionArtifact(output);
  return (
    artifact?.choices.find((choice) => choice.id === choiceId)?.label ??
    choiceId
  );
}

export function DecisionArtifactResolvedCard(props: {
  artifact: DecisionArtifact;
  choiceLabel: string;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <p className="font-medium text-foreground/90 text-sm">
        {props.artifact.title}
      </p>
      <p className="mt-1 text-muted-foreground text-sm">{props.choiceLabel}</p>
    </section>
  );
}

export function DecisionArtifactCard(props: {
  artifact: DecisionArtifact;
  onChoose: (
    artifactId: string,
    choiceId: string,
    customLabel?: string
  ) => void;
}) {
  const { t } = useTranslation("common");
  const [inputValue, setInputValue] = useState("");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const choices = props.artifact.choices;
  const numChoices = choices.length;
  const multiSelect = props.artifact.multiSelect === true;

  // Localized DISPLAY strings for the server-built tool-approval artifact
  // (title/body/choices arrive as English). Anything sent back on choose()
  // keeps the canonical server label.
  const toolApprovalOperation = props.artifact.artifactId.startsWith(
    TOOL_APPROVAL_ARTIFACT_PREFIX
  )
    ? props.artifact.artifactId.slice(TOOL_APPROVAL_ARTIFACT_PREFIX.length)
    : null;
  const displayTitle = toolApprovalOperation
    ? t("copilot.toolApproval.title", {
        action: props.artifact.title
          .replace(/^Approve\s+/, "")
          .replace(/\?$/, ""),
        defaultValue: props.artifact.title,
      })
    : props.artifact.title;
  const displayBody = toolApprovalOperation
    ? t("copilot.toolApproval.body", {
        operation: toolApprovalOperation,
        defaultValue: props.artifact.body ?? "",
      })
    : props.artifact.body;
  const displayChoiceLabel = (choice: DecisionArtifactChoice) => {
    const key = toolApprovalOperation
      ? TOOL_APPROVAL_CHOICE_LABEL_KEYS[choice.id]
      : undefined;
    return key ? t(key, { defaultValue: choice.label }) : choice.label;
  };

  // Optimistic: lock the card as soon as a choice is made so it reads as
  // "sending" instead of staying interactive until the server resolves.
  const choose = (artifactId: string, choiceId: string, label?: string) => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    props.onChoose(artifactId, choiceId, label);
  };

  const toggleChoice = (choiceId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(choiceId)) {
        next.delete(choiceId);
      } else {
        next.add(choiceId);
      }
      return next;
    });
  };

  // Multi-select answers travel through the SAME single choice_id/choice_label
  // resume payload the server already renders into the model nudge — joined
  // ids and human-readable joined labels (plus the optional custom text).
  const submitMultiSelection = () => {
    const picked = choices.filter((choice) => selectedIds.has(choice.id));
    const custom = inputValue.trim();
    if (picked.length === 0 && !custom) {
      return;
    }
    const ids = [
      ...picked.map((choice) => choice.id),
      ...(custom ? ["_custom"] : []),
    ];
    const labels = [
      ...picked.map((choice) => choice.label),
      ...(custom ? [custom] : []),
    ];
    choose(props.artifact.artifactId, ids.join(","), labels.join(", "));
  };

  // Highlight index (single-select only): if input matches 1..numChoices,
  // highlight it. In multi-select the input is purely the custom answer.
  let highlightedIdx = -1;
  const parsedNum = Number.parseInt(inputValue.trim(), 10);
  if (
    !(multiSelect || Number.isNaN(parsedNum)) &&
    parsedNum >= 1 &&
    parsedNum <= numChoices
  ) {
    highlightedIdx = parsedNum - 1;
  }

  const handleSubmit = () => {
    if (submitting) {
      return;
    }
    if (multiSelect) {
      submitMultiSelection();
      return;
    }
    const trimmedVal = inputValue.trim();
    if (!trimmedVal) {
      if (highlightedIdx !== -1) {
        const choice = choices[highlightedIdx];
        if (choice) {
          choose(props.artifact.artifactId, choice.id, choice.label);
        }
      }
      return;
    }

    const valNum = Number.parseInt(trimmedVal, 10);
    if (!Number.isNaN(valNum) && valNum >= 1 && valNum <= numChoices) {
      const selected = choices[valNum - 1];
      if (selected) {
        choose(props.artifact.artifactId, selected.id, selected.label);
      }
    } else {
      choose(props.artifact.artifactId, "_custom", trimmedVal);
    }
  };

  // Keyboard shortcut listener for global digits (when no input is focused)
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.hasAttribute("contenteditable"))
      ) {
        return;
      }

      if (submitting) {
        return;
      }
      const keyNum = Number.parseInt(e.key, 10);
      if (!Number.isNaN(keyNum) && keyNum >= 1 && keyNum <= numChoices) {
        e.preventDefault();
        const selected = choices[keyNum - 1];
        if (!selected) {
          return;
        }
        if (multiSelect) {
          toggleChoice(selected.id);
        } else {
          choose(props.artifact.artifactId, selected.id, selected.label);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, numChoices, multiSelect, submitting, props.artifact.artifactId]);

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isCustomInput = inputValue.trim() && highlightedIdx === -1;

  return (
    <section
      aria-busy={submitting}
      className={cn(
        "space-y-3 rounded-lg border bg-card p-3 shadow-sm transition-opacity",
        submitting && "pointer-events-none opacity-70"
      )}
    >
      <div className="space-y-1">
        <h3 className="font-medium text-foreground text-sm">{displayTitle}</h3>
        {displayBody ? (
          <p className="text-muted-foreground text-sm">{displayBody}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        {choices.map((choice, index) => {
          const active = multiSelect
            ? selectedIds.has(choice.id)
            : highlightedIdx === index;
          return (
            <button
              aria-label={displayChoiceLabel(choice)}
              className={cn(
                "flex w-full items-center rounded-[4px] border px-3 py-2 text-left text-sm transition-colors",
                active
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border/60 text-foreground hover:bg-muted/40"
              )}
              disabled={submitting}
              key={choice.id}
              onClick={() =>
                multiSelect
                  ? toggleChoice(choice.id)
                  : choose(props.artifact.artifactId, choice.id, choice.label)
              }
              type="button"
              {...(multiSelect
                ? {
                    "aria-checked": selectedIds.has(choice.id),
                    role: "checkbox" as const,
                  }
                : {})}
            >
              <span
                className={cn(
                  "mr-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-xs",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {multiSelect && selectedIds.has(choice.id) ? "✓" : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">
                  {displayChoiceLabel(choice)}
                </span>
                {choice.description ? (
                  <span
                    className={cn(
                      "block text-xs",
                      active ? "text-primary/80" : "text-muted-foreground"
                    )}
                  >
                    {choice.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}

        {isCustomInput ? (
          <div className="flex w-full items-center rounded-[4px] border border-primary bg-primary/5 px-3 py-2 text-left text-primary text-sm">
            <span className="mr-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary font-mono text-primary-foreground text-xs">
              {numChoices + 1}
            </span>
            <span className="font-medium">
              {t("copilot.decisionCard.customPrefix", {
                defaultValue: "Custom:",
              })}{" "}
              "{inputValue.trim()}"
            </span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 pt-1">
        <Input
          className="h-8 rounded-[4px] text-sm"
          disabled={submitting}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={
            multiSelect
              ? t("copilot.decisionCard.customAnswerPlaceholder", {
                  defaultValue: "Add a custom answer (optional)…",
                })
              : t("copilot.decisionCard.inputPlaceholder", {
                  defaultValue: "Type option number or custom response…",
                })
          }
          ref={inputRef}
          type="text"
          value={inputValue}
        />
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xxs">
            {multiSelect
              ? t("copilot.decisionCard.multiSelectHint", {
                  defaultValue: "Select all that apply, then press",
                })
              : t("copilot.decisionCard.pressHintPrefix", {
                  defaultValue: "Press",
                })}{" "}
            {multiSelect ? null : (
              <>
                <kbd className="rounded border bg-muted px-1 py-0.5 text-foreground">
                  1-{numChoices}
                </kbd>{" "}
                {t("copilot.decisionCard.pressHintSuffix", {
                  defaultValue: "or type and press",
                })}{" "}
              </>
            )}
            <kbd className="rounded border bg-muted px-1 py-0.5 text-foreground">
              Enter
            </kbd>
          </span>
          <Button
            className="h-7 min-w-[70px] rounded-[4px] text-xs"
            disabled={
              submitting ||
              (multiSelect
                ? selectedIds.size === 0 && !inputValue.trim()
                : highlightedIdx === -1 && !inputValue.trim())
            }
            onClick={handleSubmit}
            size="sm"
            type="button"
          >
            {submitting
              ? t("copilot.decisionCard.submitting", {
                  defaultValue: "Submitting…",
                })
              : t("copilot.decisionCard.submit", { defaultValue: "Submit ↵" })}
          </Button>
        </div>
      </div>
    </section>
  );
}
