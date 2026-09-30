// Engenty – the first space's first engenty: a face (a carousel, like the
// copilot's), a name, and what it should do. It is the same hire the in-app
// wizard ends on (`firstEngentyDraft` in ai-core): the Chief of Staff template,
// so it can set the space up and bring in teammates. Skippable — the space
// works without one.

import {
  AGENT_ENGENTY_KINDS,
  type AgentEngentyKind,
} from "@engenty/ai-core/browser";
import { cn, Engenty, Input, Textarea } from "@engenty/ui-core";
import { type FormEvent, useState } from "react";
import type { FirstEngentyChoice } from "../../lib/initial-setup-workspace";
import type { SetupCopy } from "../../lib/setup-wizard-i18n";
import {
  ErrorLine,
  SETUP_INPUT_CLASS,
  SubmitButton,
  TextLink,
} from "./setup-bits";
import { SetupCarousel } from "./setup-carousel";

/** The first face that is not the copilot's: the engenty's default. */
export function engentyFace(copilotLook: AgentEngentyKind): AgentEngentyKind {
  return AGENT_ENGENTY_KINDS.find((kind) => kind !== copilotLook) ?? "round";
}

export function EngentyStep({
  choice,
  copilotLook,
  copy,
  hire,
  onChange,
  onSkip,
}: {
  choice: FirstEngentyChoice;
  /** Left out of the faces, so the two never look alike. */
  copilotLook: AgentEngentyKind;
  copy: SetupCopy["engenty"];
  /** Hires the engenty; rejects with the reason when it could not. */
  hire: () => Promise<void>;
  onChange: (choice: FirstEngentyChoice) => void;
  onSkip: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const looks = AGENT_ENGENTY_KINDS.filter((kind) => kind !== copilotLook);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!choice.name.trim()) {
      setError(copy.required);
      return;
    }
    setSubmitting(true);
    try {
      await hire();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={submit}>
      <SetupCarousel
        disabled={submitting}
        items={looks}
        label={copy.look}
        onChange={(engenty) => onChange({ ...choice, engenty })}
        render={(kind, chosen) => (
          <Engenty animated={chosen} kind={kind} size={104} />
        )}
        value={choice.engenty}
      />

      <Input
        aria-label={copy.name}
        className={cn(
          SETUP_INPUT_CLASS,
          "h-12 text-center font-heading font-semibold text-[19px]"
        )}
        disabled={submitting}
        onChange={(e) => onChange({ ...choice, name: e.target.value })}
        value={choice.name}
      />

      <div className="flex flex-col gap-1.5">
        <label
          className="font-medium text-[13px] text-ink-2"
          htmlFor="setup-engenty-job"
        >
          {copy.job}
        </label>
        <Textarea
          className="min-h-[84px] rounded-[6px] bg-card text-[14px] leading-relaxed"
          disabled={submitting}
          id="setup-engenty-job"
          onChange={(e) => onChange({ ...choice, job: e.target.value })}
          value={choice.job}
        />
        <p className="text-[12.5px] text-ink-3">{copy.jobHint}</p>
      </div>

      <ErrorLine message={error} />
      <div className="flex flex-col gap-3">
        <SubmitButton
          busy={submitting}
          busyLabel={copy.busy}
          label={copy.submit}
        />
        <TextLink
          className="self-center"
          disabled={submitting}
          onClick={onSkip}
        >
          {copy.skip}
        </TextLink>
      </div>
    </form>
  );
}
