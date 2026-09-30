// Setup – what the space's engenties may do with its computer. Every space
// has one, with a browser; nothing to switch on. What the person decides is
// drawn the way the app shows it: the browser card from an agent's settings
// pane with the space's two grants (start without asking, use unattended),
// and the approval pill from the chat. All are the space's own settings (the
// browser grant, `agent_approval_mode`); the defaults are the platform's.

import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Switch,
} from "@engenty/ui-core";
import {
  ChevronDown,
  Monitor,
  Shield,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import type { SpaceWorkRules } from "../../lib/initial-setup-workspace";
import type { SetupCopy } from "../../lib/setup-wizard-i18n";
import { ErrorLine, SubmitButton } from "./setup-bits";

type ApprovalMode = SpaceWorkRules["approvalMode"];

const MODES: readonly ApprovalMode[] = ["manual", "auto", "pass-all"];

/** The chat pill's icon per mode. */
const MODE_ICON: Record<ApprovalMode, typeof Shield> = {
  auto: ShieldCheck,
  manual: Shield,
  "pass-all": ShieldOff,
};

function Grant({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <span className="flex items-center gap-2">
      <Switch
        checked={checked}
        // The off track must read on the card in both themes.
        className="data-unchecked:bg-ink/20 dark:data-unchecked:bg-ink/30"
        disabled={disabled}
        id={id}
        onCheckedChange={onChange}
      />
      <label
        className={cn(
          "cursor-pointer text-[13px] text-ink-2",
          disabled && "cursor-default"
        )}
        htmlFor={id}
      >
        {label}
      </label>
    </span>
  );
}

export function WorkStep({
  copy,
  onChange,
  rules,
  save,
}: {
  copy: SetupCopy["setup"];
  onChange: (rules: SpaceWorkRules) => void;
  rules: SpaceWorkRules;
  /** Saves the rules and moves on; rejects with the reason when it could not. */
  save: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { autostart, unattended } = rules.browser;
  const ModeIcon = MODE_ICON[rules.approvalMode];

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

  const setBrowser = (next: Partial<SpaceWorkRules["browser"]>) =>
    onChange({ ...rules, browser: { ...rules.browser, ...next } });

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col items-center gap-4 rounded-[14px] bg-ink/[0.04] px-5 pt-7 pb-5 text-center ring-1 ring-ink/6">
          <Monitor className="size-6 text-ink-3" strokeWidth={1.5} />
          <p className="max-w-[300px] text-[13.5px] text-ink-2 leading-snug">
            {copy.browserHint}
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Grant
              checked={autostart}
              disabled={submitting}
              label={copy.autostart}
              onChange={(value) => setBrowser({ autostart: value })}
            />
            <Grant
              checked={unattended}
              disabled={submitting}
              label={copy.unattended}
              onChange={(value) => setBrowser({ unattended: value })}
            />
          </div>
          <p className="text-[12.5px] text-ink-3 leading-snug">
            {autostart ? copy.autostartState.on : copy.autostartState.off}{" "}
            {unattended ? copy.unattendedState.on : copy.unattendedState.off}
          </p>
        </div>
        <p className="text-center text-[12.5px] text-ink-3">{copy.caption}</p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={copy.approval}
            className="flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-[13.5px] text-ink shadow-sm outline-none ring-1 ring-ink/10 transition hover:ring-ink/25 disabled:opacity-50"
            disabled={submitting}
          >
            <ModeIcon className="size-4 text-ink-3" />
            {copy.approval}: {copy.approvalChoice[rules.approvalMode].label}
            <ChevronDown className="size-3.5 text-ink-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-72">
            <DropdownMenuRadioGroup
              onValueChange={(value) =>
                onChange({ ...rules, approvalMode: value as ApprovalMode })
              }
              value={rules.approvalMode}
            >
              {MODES.map((mode) => {
                const Icon = MODE_ICON[mode];
                return (
                  <DropdownMenuRadioItem
                    className="items-start py-2"
                    key={mode}
                    value={mode}
                  >
                    <Icon className="mt-0.5 size-3.5 shrink-0 opacity-70" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="leading-tight">
                        {copy.approvalChoice[mode].label}
                      </span>
                      <span className="mt-0.5 text-muted-foreground text-xs leading-snug">
                        {copy.approvalChoice[mode].hint}
                      </span>
                    </span>
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-center text-[12.5px] text-ink-3 leading-snug">
          {copy.approvalChoice[rules.approvalMode].hint}
        </p>
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
