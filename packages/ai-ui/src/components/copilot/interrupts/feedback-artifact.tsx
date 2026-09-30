"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { Button, cn, Textarea } from "@engenty/ui-core";
import { type KeyboardEvent, useState } from "react";
import { InterruptCardBody } from "./interrupt-card-body.js";
import { InterruptCardDismissButton } from "./interrupt-card-dismiss-button.js";

export interface FeedbackArtifact {
  artifactId: string;
  body?: string;
  interruptId?: string;
  placeholder?: string;
  submitLabel?: string;
  title: string;
}

export function feedbackArtifactFromOpenInterrupt(
  open: AgUiOpenInterruptMetadata
): FeedbackArtifact | null {
  if (open.kind !== "feedback") {
    return null;
  }
  return {
    artifactId: open.artifact_id,
    body: open.body,
    placeholder: (open as any).placeholder,
    submitLabel: (open as any).submit_label,
    interruptId: open.interrupt_id,
    title: open.title,
  };
}

export function parseFeedbackArtifact(value: unknown): FeedbackArtifact | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as {
    artifact_id?: unknown;
    artifact_type?: unknown;
    body?: unknown;
    placeholder?: unknown;
    submit_label?: unknown;
    interrupt_id?: unknown;
    title?: unknown;
  };
  if (typeof raw.artifact_id !== "string" || raw.artifact_type !== "feedback") {
    return null;
  }
  return {
    artifactId: raw.artifact_id,
    body: typeof raw.body === "string" ? raw.body : undefined,
    placeholder:
      typeof raw.placeholder === "string" ? raw.placeholder : undefined,
    submitLabel:
      typeof raw.submit_label === "string" ? raw.submit_label : undefined,
    interruptId:
      typeof raw.interrupt_id === "string" ? raw.interrupt_id : undefined,
    title: typeof raw.title === "string" ? raw.title : "Feedback needed",
  };
}

/**
 * The question as the model ASKED it, read off the tool's own arguments.
 *
 * `requestFeedback` suspends the run, and resuming writes the answer sentence
 * as the call's result — so no artifact ever reaches `output`. Once the open
 * interrupt is gone (answered, dismissed, or superseded) the arguments are the
 * only place the question survives.
 */
export function parseFeedbackArtifactFromInput(
  value: unknown,
  toolCallId?: string
): FeedbackArtifact | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as {
    body?: unknown;
    placeholder?: unknown;
    submitLabel?: unknown;
    title?: unknown;
  };
  if (typeof raw.title !== "string" || !raw.title.trim()) {
    return null;
  }
  return {
    // Rebuilt rows are never interactive, so this id is display-only — there
    // is no resume to key off it.
    artifactId: toolCallId ?? raw.title,
    ...(typeof raw.body === "string" && raw.body.trim()
      ? { body: raw.body }
      : {}),
    ...(typeof raw.placeholder === "string"
      ? { placeholder: raw.placeholder }
      : {}),
    ...(typeof raw.submitLabel === "string"
      ? { submitLabel: raw.submitLabel }
      : {}),
    title: raw.title,
  };
}

/**
 * The answerable feedback card for ONE tool call: the artifact in its output
 * if there is one, else the open interrupt — but only when that interrupt
 * names this very call. Every `requestFeedback` row in the thread reaches this
 * resolver; without the `toolCallId` scoping each unanswered row rendered
 * whatever question is currently open (the same question twice), and each
 * answered row vanished while another question was open.
 *
 * Null means "not answerable here"; the caller falls back to
 * `parseFeedbackArtifactFromInput` to still say what was asked.
 */
export function resolveFeedbackArtifactForToolCall(
  output: unknown,
  open: AgUiOpenInterruptMetadata | null | undefined,
  toolCallId: string | undefined
): FeedbackArtifact | null {
  const fromOutput = parseFeedbackArtifact(output);
  if (fromOutput) {
    return fromOutput;
  }
  if (!(open && toolCallId) || open.tool_call_id !== toolCallId) {
    return null;
  }
  return feedbackArtifactFromOpenInterrupt(open);
}

export function FeedbackArtifactResolvedCard(props: {
  artifact: FeedbackArtifact;
  /** The answer; absent for a question nobody answered (dismissed, moved past). */
  feedback: string | null;
}) {
  return (
    <section className="rounded-lg border border-border-soft bg-muted/20 px-3 py-2.5">
      <p className="font-medium text-foreground/90 text-sm">
        {props.artifact.title}
      </p>
      {props.feedback ? (
        <p className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap text-muted-foreground text-sm">
          {props.feedback}
        </p>
      ) : null}
    </section>
  );
}

export function FeedbackArtifactCard(props: {
  artifact: FeedbackArtifact;
  /** Close the card without answering. */
  onDismiss?: () => void;
  onSubmit: (artifactId: string, feedback: string) => void;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const trimmed = value.trim();

  // Optimistic: lock the card once submitted so it reads as "sending".
  const submit = () => {
    if (submitting || !trimmed) {
      return;
    }
    setSubmitting(true);
    props.onSubmit(props.artifact.artifactId, trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <section
      aria-busy={submitting}
      className={cn(
        "ui-card-panel space-y-3 p-3 transition-opacity",
        submitting && "pointer-events-none opacity-70"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-medium text-foreground text-sm">
            {props.artifact.title}
          </h3>
          {props.artifact.body ? (
            <InterruptCardBody body={props.artifact.body} />
          ) : null}
        </div>
        {props.onDismiss ? (
          <InterruptCardDismissButton
            disabled={submitting}
            onDismiss={props.onDismiss}
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <Textarea
          autoFocus
          className="min-h-[80px] resize-y rounded-[4px] text-sm"
          disabled={submitting}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={props.artifact.placeholder || "Type your response..."}
          value={value}
        />
        <div className="flex items-center justify-between">
          <span className="hidden text-muted-foreground text-xxs sm:inline">
            Press{" "}
            <kbd className="rounded border bg-muted px-1 py-0.5 text-foreground">
              ⌘/Ctrl + Enter
            </kbd>{" "}
            to submit
          </span>
          <Button
            className="ml-auto rounded-[4px]"
            disabled={submitting || !trimmed}
            onClick={submit}
            size="sm"
            type="button"
          >
            {submitting
              ? "Submitting…"
              : props.artifact.submitLabel || "Submit"}
          </Button>
        </div>
      </div>
    </section>
  );
}
