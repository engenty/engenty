"use client";

import { useTranslation } from "@engenty/i18n/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  getPendingVoiceConfirmation,
  type ResolveVoiceConfirmationResult,
  subscribePendingVoiceConfirmation,
  type VoiceBackendApprovalPendingConfirmation,
  type VoiceFieldSuggestion,
  type VoiceFieldSuggestionsPendingConfirmation,
} from "../../../ag-ui/apps-ai/voice-pending-confirmation.js";
import { DecisionArtifactCard } from "./decision-artifact.js";
import {
  type FieldSuggestion,
  HitlApprovalCard,
} from "./hitl-approval-card.js";

const APPROVE_ONCE = "approve_once";
const APPROVE_ALWAYS = "approve_always";

type VoiceConfirmationResolve = (
  approved: boolean,
  always: boolean,
  approvedFields?: Array<{ field: string; value: string | null }>
) => Promise<ResolveVoiceConfirmationResult>;

/** Fire-and-forget decision used by the card bodies (result handled by host). */
type VoiceConfirmationDecide = (
  approved: boolean,
  always: boolean,
  approvedFields?: Array<{ field: string; value: string | null }>
) => void;

export interface VoiceConfirmationHostProps {
  /** Resolve the active confirmation; `always`/`approvedFields` are kind-specific. */
  resolve: VoiceConfirmationResolve;
  /** Inject a raw realtime client event so the agent can narrate the outcome. */
  sendClientEvent: (event: unknown) => void;
}

/**
 * Mounts the on-screen dialog for a voice HITL gate, reusing the same cards the
 * text copilot uses (decision card for backend ops, suggested-updates card
 * for field proposals). The agent also asks out loud; both channels resolve the same pending confirmation, and after a click
 * the outcome is injected back into the session so the agent narrates it.
 */
export function VoiceConfirmationHost({
  resolve,
  sendClientEvent,
}: VoiceConfirmationHostProps) {
  const { t } = useTranslation("engenty-copilot");
  const pending = useSyncExternalStore(
    subscribePendingVoiceConfirmation,
    getPendingVoiceConfirmation,
    () => null
  );

  const decide = useCallback(
    async (
      approved: boolean,
      always: boolean,
      approvedFields?: Array<{ field: string; value: string | null }>
    ) => {
      const outcome = await resolve(approved, always, approvedFields);
      injectVoiceConfirmationOutcome(sendClientEvent, outcome);
    },
    [resolve, sendClientEvent]
  );

  if (!pending) {
    return null;
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          void decide(false, false);
        }
      }}
      open={true}
    >
      <DialogContent className="max-h-[80vh] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("voiceConfirm.title", "Confirm action")}</DialogTitle>
        </DialogHeader>
        {pending.kind === "backend_approval" ? (
          <BackendApprovalBody onDecide={decide} pending={pending} />
        ) : (
          <FieldSuggestionsBody onDecide={decide} pending={pending} t={t} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BackendApprovalBody({
  onDecide,
  pending,
}: {
  onDecide: VoiceConfirmationDecide;
  pending: VoiceBackendApprovalPendingConfirmation;
}) {
  return (
    <DecisionArtifactCard
      artifact={{
        artifactId: pending.artifactId,
        body: pending.body,
        choices: pending.choices,
        interruptId: pending.interruptId,
        title: pending.title,
      }}
      onChoose={(_artifactId, choiceId) => {
        if (choiceId === APPROVE_ALWAYS) {
          void onDecide(true, true);
        } else if (choiceId === APPROVE_ONCE) {
          void onDecide(true, false);
        } else {
          void onDecide(false, false);
        }
      }}
    />
  );
}

function FieldSuggestionsBody({
  onDecide,
  pending,
  t,
}: {
  onDecide: VoiceConfirmationDecide;
  pending: VoiceFieldSuggestionsPendingConfirmation;
  t: (key: string, fallback: string) => string;
}) {
  const suggestions = pending.suggestions as FieldSuggestion[];
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(suggestions.map((s) => [s.field, true]))
  );
  const [candidateValues, setCandidateValues] = useState<
    Record<string, string | null>
  >({});

  const approvedFields = useMemo(
    () =>
      pending.suggestions
        .filter((s) => selected[s.field] !== false)
        .map((s) => ({
          field: s.field,
          value: pickValue(s, candidateValues[s.field]),
        })),
    [candidateValues, pending.suggestions, selected]
  );

  return (
    <HitlApprovalCard
      applyLabel={t("action.apply", "Apply selected")}
      onApply={() => void onDecide(true, false, approvedFields)}
      onReject={() => void onDecide(false, false)}
      onSelectedCandidateChange={(field, value) =>
        setCandidateValues((prev) => ({ ...prev, [field]: value }))
      }
      onSelectedChange={(field, checked) =>
        setSelected((prev) => ({ ...prev, [field]: checked }))
      }
      rejectLabel={t("voiceConfirm.deny", "Deny")}
      selected={selected}
      selectedCandidateValues={candidateValues}
      suggestions={suggestions}
      titleLabel={pending.title}
    />
  );
}

function pickValue(
  suggestion: VoiceFieldSuggestion,
  candidateValue: string | null | undefined
): string | null {
  return candidateValue === undefined ? suggestion.value : candidateValue;
}

function injectVoiceConfirmationOutcome(
  sendClientEvent: (event: unknown) => void,
  outcome: ResolveVoiceConfirmationResult
): void {
  if (outcome.status === "no_pending") {
    return;
  }
  const note =
    outcome.status === "approved"
      ? `(System note: the user approved the pending action via the dialog. It has already been executed — do not call the tool again. Result: ${safeJson(
          outcome.result
        )}. Briefly confirm completion to the user.)`
      : "(System note: the user rejected the pending action via the dialog. Do not perform it. Acknowledge briefly.)";
  sendClientEvent({
    item: {
      content: [{ text: note, type: "input_text" }],
      role: "user",
      type: "message",
    },
    type: "conversation.item.create",
  });
  sendClientEvent({ type: "response.create" });
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}
