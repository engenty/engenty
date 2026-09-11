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

/** Resolved feedback response from persisted tool output, when present. */
export function parseFeedbackResolution(output: unknown): string | null {
  if (!output || typeof output !== "object") {
    return null;
  }
  const raw = output as {
    feedback?: unknown;
  };
  if (typeof raw.feedback === "string" && raw.feedback.trim()) {
    return raw.feedback.trim();
  }
  return null;
}

function readFeedbackArtifactKeys(value: unknown): {
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
  const { artifactId, interruptId } = readFeedbackArtifactKeys(output);
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
export function resolveFeedbackArtifactForToolCall(
  output: unknown,
  open: AgUiOpenInterruptMetadata | null | undefined
): FeedbackArtifact | null {
  const fromOutput = parseFeedbackArtifact(output);
  const fromOpen =
    open?.kind === "feedback" ? feedbackArtifactFromOpenInterrupt(open) : null;

  if (output != null && open && !openInterruptMatchesToolOutput(open, output)) {
    return null;
  }

  if (fromOutput && fromOutput.body !== undefined) {
    return fromOutput;
  }

  if (fromOutput && fromOpen && fromOutput.artifactId === fromOpen.artifactId) {
    return {
      artifactId: fromOutput.artifactId,
      body: fromOutput.body ?? fromOpen.body,
      placeholder: fromOutput.placeholder ?? fromOpen.placeholder,
      submitLabel: fromOutput.submitLabel ?? fromOpen.submitLabel,
      interruptId: fromOutput.interruptId ?? fromOpen.interruptId,
      title: fromOutput.title || fromOpen.title,
    };
  }

  return fromOutput || fromOpen;
}

export function FeedbackArtifactResolvedCard(props: {
  artifact: FeedbackArtifact;
  feedback: string;
}) {
  return (
    <section className="rounded-lg border border-border-soft bg-muted/20 px-3 py-2.5">
      <p className="font-medium text-foreground/90 text-sm">
        {props.artifact.title}
      </p>
      <p className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap text-muted-foreground text-sm">
        {props.feedback}
      </p>
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
