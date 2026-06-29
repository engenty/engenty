"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { isFrontendToolOpenInterrupt } from "@engenty/ag-ui-bridge";
import { Button, cn, Input } from "@engenty/ui-core";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

export interface DecisionArtifactChoice {
  id: string;
  label: string;
}

export interface DecisionArtifact {
  artifactId: string;
  body?: string;
  choices: DecisionArtifactChoice[];
  interruptId?: string;
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
    const c = choice as { id?: unknown; label?: unknown };
    return typeof c.id === "string" && typeof c.label === "string"
      ? [{ id: c.id, label: c.label }]
      : [];
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
  const [inputValue, setInputValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const choices = props.artifact.choices;
  const numChoices = choices.length;

  // Optimistic: lock the card as soon as a choice is made so it reads as
  // "sending" instead of staying interactive until the server resolves.
  const choose = (artifactId: string, choiceId: string, label?: string) => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    props.onChoose(artifactId, choiceId, label);
  };

  // Highlight index: if input matches 1..numChoices, highlight it
  let highlightedIdx = -1;
  const parsedNum = Number.parseInt(inputValue.trim(), 10);
  if (!Number.isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= numChoices) {
    highlightedIdx = parsedNum - 1;
  }

  const handleSubmit = () => {
    if (submitting) {
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
        if (selected) {
          choose(props.artifact.artifactId, selected.id, selected.label);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, numChoices, submitting, props.artifact.artifactId]);

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
        <h3 className="font-medium text-foreground text-sm">
          {props.artifact.title}
        </h3>
        {props.artifact.body ? (
          <p className="text-muted-foreground text-sm">{props.artifact.body}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        {choices.map((choice, index) => (
          <button
            aria-label={choice.label}
            className={cn(
              "flex w-full items-center rounded-[4px] border px-3 py-2 text-left text-sm transition-colors",
              highlightedIdx === index
                ? "border-primary bg-primary/5 text-primary"
                : "border-border/60 text-foreground hover:bg-muted/40"
            )}
            disabled={submitting}
            key={choice.id}
            onClick={() =>
              choose(props.artifact.artifactId, choice.id, choice.label)
            }
            type="button"
          >
            <span
              className={cn(
                "mr-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-xs",
                highlightedIdx === index
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {index + 1}
            </span>
            <span className="font-medium">{choice.label}</span>
          </button>
        ))}

        {isCustomInput ? (
          <div className="flex w-full items-center rounded-[4px] border border-primary bg-primary/5 px-3 py-2 text-left text-primary text-sm">
            <span className="mr-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary font-mono text-primary-foreground text-xs">
              {numChoices + 1}
            </span>
            <span className="font-medium">Custom: "{inputValue.trim()}"</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 pt-1">
        <Input
          className="h-8 rounded-[4px] text-sm"
          disabled={submitting}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Type option number or custom response..."
          ref={inputRef}
          type="text"
          value={inputValue}
        />
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xxs">
            Press{" "}
            <kbd className="rounded border bg-muted px-1 py-0.5 text-foreground">
              1-{numChoices}
            </kbd>{" "}
            or type and press{" "}
            <kbd className="rounded border bg-muted px-1 py-0.5 text-foreground">
              Enter
            </kbd>
          </span>
          <Button
            className="h-7 min-w-[70px] rounded-[4px] text-xs"
            disabled={
              submitting || (highlightedIdx === -1 && !inputValue.trim())
            }
            onClick={handleSubmit}
            size="sm"
            type="button"
          >
            {submitting ? "Submitting…" : "Submit ↵"}
          </Button>
        </div>
      </div>
    </section>
  );
}
