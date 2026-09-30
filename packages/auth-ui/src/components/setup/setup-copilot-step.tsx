// Copilot – the first thing a new team meets: one line on what it is, a face
// to pick (it always wears pilot goggles), and where to find it: the app bar,
// or the shortcut. The look is saved as the person's own setting when they
// continue.

import {
  AGENT_ENGENTY_KINDS,
  type AgentEngentyKind,
} from "@engenty/ai-core/browser";
import { Engenty } from "@engenty/ui-core";
import { type FormEvent, useState } from "react";
import type { SetupCopy } from "../../lib/setup-wizard-i18n";
import { ErrorLine, modKey, SubmitButton } from "./setup-bits";
import { SetupCarousel } from "./setup-carousel";

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] bg-card px-2 font-medium font-sans text-[13px] text-ink shadow-[0_1px_0_0_oklch(0%_0_0/0.1)] ring-1 ring-ink/15">
      {children}
    </kbd>
  );
}

export function CopilotStep({
  copy,
  look,
  onLookChange,
  save,
}: {
  copy: SetupCopy["copilot"];
  look: AgentEngentyKind;
  onLookChange: (look: AgentEngentyKind) => void;
  /** Saves the look and moves on; rejects with the reason when it could not. */
  save: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await save();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-8" onSubmit={submit}>
      <SetupCarousel
        disabled={submitting}
        items={AGENT_ENGENTY_KINDS}
        label={copy.look}
        onChange={onLookChange}
        render={(kind, chosen) => (
          <Engenty animated={chosen} goggles kind={kind} size={104} />
        )}
        value={look}
      />

      <div className="flex flex-col items-center gap-2.5 text-center">
        <p className="text-[15px] text-ink-2">{copy.find}</p>
        <div className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-2">
          <span className="flex justify-end gap-1">
            <Kbd>{modKey()}</Kbd>
            <Kbd>O</Kbd>
          </span>
          <span className="text-left text-[14px] text-ink-3">
            {copy.shortcut}
          </span>
          <span className="flex justify-end gap-1">
            <Kbd>{modKey()}</Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>O</Kbd>
          </span>
          <span className="text-left text-[14px] text-ink-3">
            {copy.voiceShortcut}
          </span>
        </div>
      </div>

      <ErrorLine message={error} />
      <SubmitButton
        busy={submitting}
        busyLabel={copy.busy}
        label={copy.submit}
      />
    </form>
  );
}
