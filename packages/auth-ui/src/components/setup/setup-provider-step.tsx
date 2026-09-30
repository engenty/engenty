// AI – the gateway key. It becomes a platform setting: core applies it to its
// own environment and tells apps/ai to re-read, so the first chat after this
// screen has a model. "Test" asks the gateway's own auth endpoint. The wizard
// skips this screen when the server environment already has a key.

import { Button, cn, Input } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { ChevronDown, ExternalLink } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  AI_PROVIDER_OPTIONS,
  type AiProviderOption,
  type AiProviderTestResult,
  decideAiProviderStep,
} from "../../lib/initial-setup-checks";
import type { ServerSetupApi, SetupSession } from "../../lib/setup-api";
import type { SetupCopy } from "../../lib/setup-wizard-i18n";
import {
  ErrorLine,
  Field,
  MARK_TONE,
  SETUP_INPUT_CLASS,
  StatusMark,
  SubmitButton,
  TextLink,
} from "./setup-bits";

/** What the AI screen decided, shown in the picture and on the Ready screen. */
export type ProviderOutcome =
  | { kind: "connected"; label: string; reloadConfirmed: boolean }
  | { kind: "skipped" };

export function envConnectedOutcome(
  envKeys: readonly string[]
): ProviderOutcome {
  const decision = decideAiProviderStep({
    envKeys,
    intent: "skip",
    pastedKey: "",
  });
  return decision.kind === "connected-env"
    ? { kind: "connected", label: decision.label, reloadConfirmed: true }
    : { kind: "skipped" };
}

const FEATURED = 2;

function OptionRow({
  copy,
  onSelect,
  option,
  recommended,
  selected,
}: {
  copy: SetupCopy["provider"];
  onSelect: () => void;
  option: AiProviderOption;
  recommended: boolean;
  selected: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[8px] px-3.5 py-3 ring-1 transition-[box-shadow,background-color]",
        selected
          ? "bg-card ring-2 ring-primary"
          : "bg-card/60 ring-ink/10 hover:ring-ink/25"
      )}
    >
      <input
        checked={selected}
        className="mt-1 accent-[var(--primary)]"
        name="setup-provider"
        onChange={onSelect}
        type="radio"
        value={option.gateway}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 font-medium text-[14px] text-ink">
          {option.label}
          {recommended ? (
            <span className="rounded-full bg-primary/10 px-2 py-px font-medium text-[11px] text-primary">
              {copy.recommended}
            </span>
          ) : null}
        </span>
        <span className="text-[12.5px] text-ink-3 leading-snug">
          {copy.blurbs[option.gateway]}
        </span>
      </span>
    </label>
  );
}

export function ProviderStep({
  api,
  copy,
  envKeys,
  onComplete,
  onProviderChange,
  session,
}: {
  api: ServerSetupApi;
  copy: SetupCopy["provider"];
  /** Env var names the installation check already saw as set. */
  envKeys: readonly string[];
  onComplete: (outcome: ProviderOutcome) => void;
  /** The chosen provider once its key tested good, for the picture. */
  onProviderChange: (label: string | null) => void;
  session: SetupSession;
}) {
  const [option, setOption] = useState<AiProviderOption>(
    () =>
      AI_PROVIDER_OPTIONS.find((candidate) =>
        envKeys.includes(candidate.envKey)
      ) ?? (AI_PROVIDER_OPTIONS[0] as AiProviderOption)
  );
  const [showAll, setShowAll] = useState(
    () => AI_PROVIDER_OPTIONS.indexOf(option) >= FEATURED
  );
  const [apiKey, setApiKey] = useState("");
  const [test, setTest] = useState<AiProviderTestResult | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = showAll
    ? AI_PROVIDER_OPTIONS
    : AI_PROVIDER_OPTIONS.slice(0, FEATURED);
  const hidden = AI_PROVIDER_OPTIONS.length - FEATURED;

  const choose = (next: AiProviderOption) => {
    setOption(next);
    setTest(null);
    onProviderChange(null);
  };

  const runTest = async () => {
    setError(null);
    if (!apiKey.trim()) {
      setError(copy.pasteFirst);
      return;
    }
    setBusy("test");
    try {
      const result = await api.testProviderKey({
        apiKey: apiKey.trim(),
        gateway: option.gateway,
        session,
      });
      setTest(result);
      onProviderChange(result.status === "valid" ? option.label : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const decision = decideAiProviderStep({
      envKeys,
      intent: "continue",
      pastedKey: apiKey,
    });
    if (decision.kind === "need-key") {
      setError(copy.needKey);
      return;
    }
    if (decision.kind !== "save") {
      onComplete(envConnectedOutcome(envKeys));
      return;
    }
    setBusy("save");
    try {
      const saved = await api.saveProviderKey({
        apiKey: decision.apiKey,
        envKey: option.envKey,
        session,
      });
      onProviderChange(option.label);
      onComplete({
        kind: "connected",
        label: option.label,
        reloadConfirmed: saved.reload.status === "reloaded",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  const testStatus =
    test?.status === "valid"
      ? "ok"
      : test?.status === "invalid"
        ? "fail"
        : "warn";

  return (
    <form className="flex flex-col gap-5" onSubmit={save}>
      <fieldset className="flex flex-col gap-2" disabled={busy !== null}>
        {visible.map((candidate, index) => (
          <OptionRow
            copy={copy}
            key={candidate.gateway}
            onSelect={() => choose(candidate)}
            option={candidate}
            recommended={index === 0}
            selected={candidate.gateway === option.gateway}
          />
        ))}
        <button
          className="flex items-center gap-1 self-start px-1 text-[13px] text-ink-3 hover:text-ink"
          onClick={() => setShowAll((value) => !value)}
          type="button"
        >
          {showAll ? copy.fewer : copy.more(hidden)}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              showAll && "rotate-180"
            )}
          />
        </button>
      </fieldset>

      <Field
        hint={
          <>
            {copy.keyNote}{" "}
            <a
              className="inline-flex items-center gap-0.5 text-ink-2 underline underline-offset-2 hover:text-ink"
              href={option.keyUrl}
              rel="noreferrer"
              target="_blank"
            >
              {copy.getKey}
              <ExternalLink className="size-3" />
            </a>
          </>
        }
        htmlFor="setup-provider-key"
        label={`${copy.keyLabel} · ${option.label}`}
      >
        <div className="flex gap-2">
          <Input
            autoComplete="off"
            className={`${SETUP_INPUT_CLASS} font-mono text-[13px]`}
            disabled={busy !== null}
            id="setup-provider-key"
            onChange={(e) => {
              setApiKey(e.target.value);
              setTest(null);
              onProviderChange(null);
            }}
            placeholder={option.placeholder}
            spellCheck={false}
            type="password"
            value={apiKey}
          />
          <Button
            className="h-10 shrink-0"
            disabled={busy !== null}
            onClick={() => void runTest()}
            type="button"
            variant="outline"
          >
            {busy === "test" ? (
              <AnimatedLoaderIcon play="always" size="sm" />
            ) : null}
            {busy === "test" ? copy.testing : copy.test}
          </Button>
        </div>
      </Field>

      {test ? (
        <p
          className={`flex items-start gap-2 text-[13px] ${MARK_TONE[testStatus]}`}
        >
          <span className="mt-0.5">
            <StatusMark status={testStatus} />
          </span>
          <span>
            {test.status === "valid"
              ? copy.valid(test.modelCount)
              : test.status === "invalid"
                ? copy.invalid
                : test.detail}
          </span>
        </p>
      ) : null}

      <ErrorLine message={error} />

      <div className="flex flex-col gap-3">
        <SubmitButton
          busy={busy === "save"}
          busyLabel={copy.busy}
          disabled={busy === "test"}
          label={copy.submit}
        />
        <TextLink
          className="self-center"
          disabled={busy !== null}
          onClick={() => onComplete(envConnectedOutcome(envKeys))}
        >
          {copy.skip}
        </TextLink>
      </div>
    </form>
  );
}
