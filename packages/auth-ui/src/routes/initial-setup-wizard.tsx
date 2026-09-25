// Initial setup wizard – split-screen, a readiness gate plus six steps.
//
//   gate  Installation — what `engenty setup` should have left behind, checked
//         from core and from this browser; blocks until every red row is fixed
//   1     Administrator — the account
//   2     Team — renames the tenant step 1 created
//   3     AI provider — a gateway key, stored as a platform setting (skippable;
//         skipped automatically when the environment already has a key)
//   4     First space — names and re-keys the trigger-made default, or creates
//   5     Personal space — names the admin's own private space (skippable)
//   6     Ready — the outcome, and the only place the shared client signs in
//
// Steps 2, 4 and 5 RENAME what earlier steps created: creating the first admin
// calls `ensureDefaultTenant` ("Default Tenant"), and database triggers give
// that tenant its default "Company" space and the admin a personal one. See
// initial-setup-workspace.ts. Only shown when `initial_setup_required` is true
// (gate check in parent).

import {
  Button,
  Card,
  CardContent,
  Engenty,
  EngentyLogoMark,
  EngentyWordmark,
  Input,
  Label,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AuthLocaleSwitch } from "../components/auth-locale-switch";
import {
  AUTH_TRANSLATIONS,
  type AuthLocale,
  detectAuthLocale,
} from "../lib/auth-i18n";
import { createInitialAdmin } from "../lib/initial-setup";
import {
  AI_PROVIDER_OPTIONS,
  type AiProviderOption,
  type AiProviderTestResult,
  aiProviderEnvKeysFromChecks,
  attentionCount,
  decideAiProviderStep,
  probeAiServiceFromBrowser,
  readSetupChecks,
  type SetupCheck,
  saveAiProviderKey,
  setupBlocked,
  testAiProviderKey,
} from "../lib/initial-setup-checks";
import {
  ensureFirstSpace,
  namePersonalSpace,
  nameTenant,
  readPersonalSpace,
  readWorkspaceContext,
  saveTenantLanguage,
} from "../lib/initial-setup-workspace";
import {
  createDetachedSupabaseAuthClient,
  getSupabaseAuthClient,
} from "../lib/supabase-auth-client";

// ─── Types ────────────────────────────────────────────────────────────────────

/** 0 is the gate; it is not numbered on screen. */
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface AdminValues {
  email: string;
  name: string;
  password: string;
}

/** What step 3 decided, shown on the rail and the Ready screen. */
type ProviderOutcome =
  | { kind: "connected"; label: string; reloadConfirmed: boolean }
  | { kind: "skipped" };

interface WizardOutcome {
  personalSpaceName: string | null;
  provider: ProviderOutcome | null;
  spaceKey: string;
  spaceName: string;
  teamName: string;
}

type Translations = (typeof AUTH_TRANSLATIONS)[keyof typeof AUTH_TRANSLATIONS];

// ─── Left Panel ───────────────────────────────────────────────────────────────

/** Landing hero ember + cream accents (same as AuthLoginLayout). */
const BRAND_EMBER = "oklch(44% 0.16 30)";
const BRAND_MUTED = "oklch(92% 0.03 40)";
const BRAND_SOFT = "oklch(100% 0 0 / 0.55)";
const MONO = "ui-monospace, 'Cascadia Code', monospace";

interface RailEntry {
  label: string;
  sublabel: string;
  /** What is shown once the step is done, or the sublabel until then. */
  summary: string | null;
}

function SetupLeftPanel({
  entries,
  step,
  t,
}: {
  entries: readonly RailEntry[];
  step: Step;
  t: Translations;
}) {
  return (
    <div
      className="relative hidden flex-col justify-between overflow-hidden lg:flex"
      style={{ background: BRAND_EMBER, padding: "3rem" }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full"
        style={{
          width: 520,
          height: 520,
          top: -180,
          right: -160,
          background: "#fff",
          filter: "blur(90px)",
          opacity: 0.12,
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col justify-center space-y-8">
        <div className="flex items-center gap-3">
          <EngentyLogoMark size={72} />
          <div className="space-y-1">
            <p
              className="font-bold font-heading text-white tracking-tight"
              style={{ fontSize: 22, letterSpacing: "-0.02em" }}
            >
              <EngentyWordmark onDark />
            </p>
            <div className="space-y-0.5">
              <p style={{ fontSize: 13, color: BRAND_MUTED }}>{t.tagline}</p>
              <p style={{ fontSize: 12, color: BRAND_SOFT, lineHeight: 1.35 }}>
                {t.taglineLead}
              </p>
              <p style={{ fontSize: 12, color: BRAND_SOFT, lineHeight: 1.35 }}>
                {t.taglineAside}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h1
            className="font-heading font-semibold text-white leading-tight"
            style={{ fontSize: 30, letterSpacing: "-0.02em" }}
          >
            {t.setup.heading}
          </h1>
          <p
            className="leading-relaxed"
            style={{ fontSize: 14, color: "oklch(100% 0 0 / 0.55)" }}
          >
            {t.setup.desc}
          </p>
        </div>

        <ol className="space-y-2.5">
          {entries.map((entry, index) => (
            <StepRow
              active={step === index}
              done={step > index}
              entry={entry}
              key={entry.label}
              num={index}
            />
          ))}
        </ol>
      </div>

      <div className="relative z-10 flex items-end justify-between gap-4">
        <p className="text-xs" style={{ color: "oklch(100% 0 0 / 0.35)" }}>
          {t.footer}
        </p>
        <div aria-hidden="true" className="flex gap-2">
          <Engenty kind="drop" size={40} />
          <Engenty kind="flame" size={40} />
        </div>
      </div>
    </div>
  );
}

/** One rail row: a mono numeral (✓ once done), the label, and the sublabel or summary. */
function StepRow({
  active,
  done,
  entry,
  num,
}: {
  active: boolean;
  done: boolean;
  entry: RailEntry;
  num: number;
}) {
  const visible = active || done;
  return (
    <li
      className="flex items-baseline gap-3 transition-opacity"
      style={{ opacity: visible ? 1 : 0.32 }}
    >
      <span
        aria-hidden="true"
        className="inline-flex w-7 shrink-0 justify-end"
        style={{
          fontFamily: MONO,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          color: done
            ? "oklch(100% 0 0 / 0.9)"
            : active
              ? "oklch(88% 0.11 75)"
              : "oklch(100% 0 0 / 0.3)",
        }}
      >
        {done ? "✓" : num === 0 ? "·" : String(num).padStart(2, "0")}
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: active
              ? "white"
              : done
                ? "oklch(100% 0 0 / 0.75)"
                : "oklch(100% 0 0 / 0.4)",
          }}
        >
          {entry.label}
        </span>
        <span
          className="truncate"
          style={{ fontSize: 11, color: "oklch(100% 0 0 / 0.4)" }}
        >
          {done && entry.summary ? entry.summary : entry.sublabel}
        </span>
      </span>
    </li>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function ErrorLine({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p className="rounded-[4px] bg-destructive/8 px-3 py-2 text-destructive text-sm">
      {message}
    </p>
  );
}

function SkipLink({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="text-muted-foreground text-xs underline-offset-2 hover:underline disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

// ─── Gate – Installation ──────────────────────────────────────────────────────
// Core's rows (database, Mastra schema, apps/ai from core, baseline modules,
// provider key) plus the one row only this browser can answer. Polls while a
// row is red so a fix in the terminal turns it green without a reload.

const GATE_POLL_MS = 5000;

function CheckRow({ check }: { check: SetupCheck }) {
  const tone =
    check.status === "ok"
      ? "text-emerald-700 dark:text-emerald-400"
      : check.status === "fail"
        ? "text-destructive"
        : "text-amber-700 dark:text-amber-400";
  const mark =
    check.status === "ok" ? (
      <Check className="h-3.5 w-3.5" />
    ) : check.status === "fail" ? (
      <X className="h-3.5 w-3.5" />
    ) : (
      <span className="font-bold text-xs leading-none">!</span>
    );
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center ${tone}`}
        >
          {mark}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">{check.label}</p>
          {check.detail ? (
            <p className="break-all text-muted-foreground text-xs">
              {check.detail}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-muted-foreground text-xs">
          {check.status === "ok"
            ? "ok"
            : check.status === "fail"
              ? "blocks"
              : check.step
                ? `step ${check.step}`
                : "later"}
        </span>
      </div>
      {check.fix ? (
        <pre className="ml-6 whitespace-pre-wrap break-words rounded-[4px] bg-muted px-2 py-1 text-xs">
          {check.fix}
        </pre>
      ) : null}
    </li>
  );
}

function GateScreen({
  onChecks,
  onContinue,
  t,
}: {
  onChecks: (checks: SetupCheck[]) => void;
  onContinue: () => void;
  t: Translations;
}) {
  const [checks, setChecks] = useState<SetupCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const [core, browser] = await Promise.all([
        readSetupChecks(),
        probeAiServiceFromBrowser(),
      ]);
      const next = [...core, browser];
      setChecks(next);
      setError(null);
      onChecks(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read the checks."
      );
    } finally {
      setRunning(false);
    }
  }, [onChecks]);

  useEffect(() => {
    void run();
  }, [run]);

  const blocked = checks ? setupBlocked(checks) : true;

  useEffect(() => {
    if (!blocked) {
      return;
    }
    const timer = setInterval(() => void run(), GATE_POLL_MS);
    return () => clearInterval(timer);
  }, [blocked, run]);

  return (
    <div className="flex flex-col gap-4">
      {checks === null ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <AnimatedLoaderIcon play="always" size="sm" /> Checking the
          installation…
        </p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {checks.map((check) => (
            <CheckRow check={check} key={check.id} />
          ))}
        </ul>
      )}
      <ErrorLine message={error} />
      <div className="flex items-center gap-3">
        <Button
          className="h-9"
          disabled={blocked || running}
          onClick={onContinue}
          type="button"
        >
          {t.setup.gateContinue}
        </Button>
        <Button
          className="h-9"
          disabled={running}
          onClick={() => void run()}
          type="button"
          variant="outline"
        >
          {running ? (
            <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
          ) : null}
          {t.setup.gateCheckAgain}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 1 – Administrator ───────────────────────────────────────────────────
// NOTE: We deliberately do NOT sign in here. Signing in would flip
// `isAuthenticated` → true, causing AuthenticatedRoutes to redirect
// /initial_setup → /dashboard and skip every later step.

function Step1AdminForm({
  onComplete,
}: {
  onComplete: (values: AdminValues) => void;
}) {
  const [values, setValues] = useState<AdminValues>({
    name: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (key: keyof AdminValues) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!values.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!(values.email.trim() && values.email.includes("@"))) {
      setError("A valid email address is required.");
      return;
    }
    if (values.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await createInitialAdmin({
        email: values.email.trim(),
        password: values.password,
        display_name: values.name.trim(),
      });
      onComplete(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label className="font-medium text-sm" htmlFor="setup-name">
          Full name
        </Label>
        <Input
          autoComplete="name"
          autoFocus
          className="h-9 rounded-[4px]"
          disabled={submitting}
          id="setup-name"
          placeholder="Jane Doe"
          required
          {...field("name")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="font-medium text-sm" htmlFor="setup-email">
          Email address
        </Label>
        <Input
          autoComplete="email"
          className="h-9 rounded-[4px]"
          disabled={submitting}
          id="setup-email"
          placeholder="jane@company.com"
          required
          type="email"
          {...field("email")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="font-medium text-sm" htmlFor="setup-password">
          Password
        </Label>
        <div className="relative">
          <Input
            autoComplete="new-password"
            className="h-9 rounded-[4px] pr-9"
            disabled={submitting}
            id="setup-password"
            placeholder="Minimum 6 characters"
            required
            type={showPassword ? "text" : "password"}
            {...field("password")}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={submitting}
            onClick={() => setShowPassword((v) => !v)}
            type="button"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <ErrorLine message={error} />

      <Button className="mt-1 h-9 w-full" disabled={submitting} type="submit">
        {submitting && (
          <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
        )}
        {submitting ? "Creating account…" : "Create administrator account"}
      </Button>
    </form>
  );
}

// ─── Step 2 – The team ────────────────────────────────────────────────────────
// Renames the tenant the administrator is already in. Signs in on a DETACHED
// client: the shared one would flip the app to authenticated and the router
// would leave the wizard.

function Step2TeamForm({
  adminCredentials,
  locale,
  onComplete,
}: {
  adminCredentials: AdminValues;
  locale: AuthLocale;
  onComplete: (values: {
    accessToken: string;
    teamName: string;
    userId: string;
  }) => void;
}) {
  const [teamName, setTeamName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = teamName.trim();
    if (!name) {
      setError("A team or organization name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createDetachedSupabaseAuthClient();
      const { error: signInError, data } =
        await supabase.auth.signInWithPassword({
          email: adminCredentials.email.trim(),
          password: adminCredentials.password,
        });
      if (signInError) {
        throw signInError;
      }
      const accessToken = data.session?.access_token ?? "";
      const context = await readWorkspaceContext(accessToken);
      if (!context.currentTenant) {
        throw new Error("No tenant to name — the administrator has none.");
      }
      await nameTenant({
        accessToken,
        name,
        tenantId: context.currentTenant.id,
      });
      await saveTenantLanguage({ accessToken, language: locale });
      onComplete({ accessToken, teamName: name, userId: context.userId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to name the team.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label className="font-medium text-sm" htmlFor="setup-team">
          Team or organization
        </Label>
        <Input
          autoFocus
          className="h-9 rounded-[4px]"
          disabled={submitting}
          id="setup-team"
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Acme Inc."
          required
          value={teamName}
        />
        <p className="text-muted-foreground text-xs">
          Shown across the app. You can change it later in settings.
        </p>
      </div>

      <ErrorLine message={error} />

      <Button className="mt-1 h-9 w-full" disabled={submitting} type="submit">
        {submitting && (
          <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
        )}
        {submitting ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

// ─── Step 3 – AI provider ─────────────────────────────────────────────────────
// The key becomes a platform setting: core applies it to its own environment
// and tells apps/ai to re-read, so the first chat after this step has a key.
// "Test key" asks the gateway's own auth endpoint — the catalogs need no
// credential, so they would say nothing.

function envConnectedOutcome(envKeys: readonly string[]): ProviderOutcome {
  const decision = decideAiProviderStep({
    envKeys,
    intent: "skip",
    pastedKey: "",
  });
  return decision.kind === "connected-env"
    ? { kind: "connected", label: decision.label, reloadConfirmed: true }
    : { kind: "skipped" };
}

function Step3ProviderForm({
  accessToken,
  envKeys,
  onComplete,
}: {
  accessToken: string;
  /** Env var names the gate already saw as set. */
  envKeys: readonly string[];
  onComplete: (outcome: ProviderOutcome) => void;
}) {
  const alreadySet = envKeys.length > 0;
  const [option, setOption] = useState<AiProviderOption>(
    () =>
      AI_PROVIDER_OPTIONS.find((candidate) =>
        envKeys.includes(candidate.envKey)
      ) ?? (AI_PROVIDER_OPTIONS[0] as AiProviderOption)
  );
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<AiProviderTestResult | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = apiKey.trim();

  const runTest = async () => {
    setError(null);
    if (!key) {
      setError("Paste the key first.");
      return;
    }
    setBusy("test");
    try {
      setTest(
        await testAiProviderKey({
          accessToken,
          apiKey: key,
          gateway: option.gateway,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not test the key.");
    } finally {
      setBusy(null);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const decision = decideAiProviderStep({
      envKeys,
      intent: "continue",
      pastedKey: apiKey,
    });
    if (decision.kind === "need-key") {
      setError("Paste the key, or skip for now.");
      return;
    }
    if (decision.kind !== "save") {
      onComplete(envConnectedOutcome(envKeys));
      return;
    }
    setBusy("save");
    try {
      const saved = await saveAiProviderKey({
        accessToken,
        apiKey: decision.apiKey,
        envKey: option.envKey,
      });
      onComplete({
        kind: "connected",
        label: option.label,
        reloadConfirmed: saved.reload.status === "reloaded",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the key.");
      setBusy(null);
    }
  };

  const testTone =
    test?.status === "valid"
      ? "text-emerald-700 dark:text-emerald-400"
      : test?.status === "invalid"
        ? "text-destructive"
        : "text-amber-700 dark:text-amber-400";

  return (
    <form className="flex flex-col gap-5" onSubmit={save}>
      {alreadySet ? (
        <p className="rounded-[4px] bg-muted px-3 py-2 text-muted-foreground text-xs">
          A gateway key is already set in the server environment. Continue uses
          that key. Paste another only if you want it stored as a platform
          setting, which takes precedence.
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium text-sm">Provider</legend>
        {AI_PROVIDER_OPTIONS.map((candidate) => {
          const selected = candidate.gateway === option.gateway;
          return (
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-[4px] border px-3 py-2 ${
                selected ? "border-primary bg-primary/5" : "border-border"
              }`}
              key={candidate.gateway}
            >
              <input
                checked={selected}
                className="mt-1"
                disabled={busy !== null}
                name="setup-provider"
                onChange={() => {
                  setOption(candidate);
                  setTest(null);
                }}
                type="radio"
                value={candidate.gateway}
              />
              <span className="flex flex-col">
                <span className="text-sm">{candidate.label}</span>
                <span className="text-muted-foreground text-xs">
                  {candidate.blurb}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label className="font-medium text-sm" htmlFor="setup-provider-key">
          {option.envKey}
        </Label>
        <div className="relative">
          <Input
            autoComplete="off"
            className="h-9 rounded-[4px] pr-9 font-mono text-xs"
            disabled={busy !== null}
            id="setup-provider-key"
            onChange={(e) => {
              setApiKey(e.target.value);
              setTest(null);
            }}
            placeholder={option.placeholder}
            spellCheck={false}
            type={showKey ? "text" : "password"}
            value={apiKey}
          />
          <button
            aria-label={showKey ? "Hide key" : "Show key"}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => setShowKey((v) => !v)}
            type="button"
          >
            {showKey ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-muted-foreground text-xs">
          Get one at{" "}
          <a
            className="underline underline-offset-2"
            href={option.keyUrl}
            rel="noreferrer"
            target="_blank"
          >
            {option.keyUrl.replace(/^https:\/\//, "")}
          </a>
          . Pasted keys are write-only and shown as •••• afterwards.
        </p>
      </div>

      {test ? (
        <p className={`flex items-start gap-2 text-sm ${testTone}`}>
          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
            {test.status === "valid" ? (
              <Check className="h-3.5 w-3.5" />
            ) : test.status === "invalid" ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <span className="font-bold text-xs leading-none">!</span>
            )}
          </span>
          <span>
            {test.detail}
            {test.status === "valid" && test.modelCount
              ? ` — ${test.modelCount} models in the catalog`
              : ""}
          </span>
        </p>
      ) : null}

      <ErrorLine message={error} />

      <div className="flex items-center gap-3">
        <Button className="h-9 flex-1" disabled={busy !== null} type="submit">
          {busy === "save" && (
            <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
          )}
          {busy === "save" ? "Saving…" : "Continue"}
        </Button>
        <Button
          className="h-9"
          disabled={busy !== null}
          onClick={() => void runTest()}
          type="button"
          variant="outline"
        >
          {busy === "test" && (
            <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
          )}
          Test key
        </Button>
      </div>
      <SkipLink
        disabled={busy !== null}
        onClick={() => onComplete(envConnectedOutcome(envKeys))}
      >
        {alreadySet
          ? "Keep the server environment key — you can change it later in Setup → Platform settings"
          : "Skip for now — the copilot stays off until a key is set in Setup → Platform settings"}
      </SkipLink>
    </form>
  );
}

// ─── Step 4 – The first space ─────────────────────────────────────────────────
// Names and re-keys the tenant's default space, which the trigger created
// with its baseline mounts — or creates one when the tenant has none.

/** What the default Company space ships with; the trigger seeds these, the wizard only names it. */
const FIRST_SPACE_COMES_WITH = ["Copilot", "Files", "Connections"];

function Step4SpaceForm({
  accessToken,
  onComplete,
  teamName,
}: {
  accessToken: string;
  onComplete: (space: { key: string; name: string }) => void;
  teamName: string;
}) {
  const [spaceName, setSpaceName] = useState(teamName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    const name = spaceName.trim();
    if (!name) {
      setError("A space name is required.");
      return;
    }
    setSubmitting(true);
    try {
      onComplete(await ensureFirstSpace({ accessToken, name }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set up the space."
      );
      setSubmitting(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label className="font-medium text-sm" htmlFor="setup-space">
          Space name
        </Label>
        <Input
          autoFocus
          className="h-9 rounded-[4px]"
          disabled={submitting}
          id="setup-space"
          onChange={(e) => setSpaceName(e.target.value)}
          placeholder="Acme Inc."
          required
          value={spaceName}
        />
        <p className="text-muted-foreground text-xs">
          Add more spaces any time — one per client, team, or subject.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="font-medium text-sm">Comes with</p>
        <ul className="flex flex-wrap gap-1.5">
          {FIRST_SPACE_COMES_WITH.map((name) => (
            <li
              className="rounded-[4px] bg-muted px-2 py-0.5 text-xs"
              key={name}
            >
              {name}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Only modules this installation ships are mounted. Pick more in the
          space settings.
        </p>
      </div>

      <ErrorLine message={error} />

      <Button className="mt-1 h-9 w-full" disabled={submitting} type="submit">
        {submitting && (
          <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
        )}
        {submitting ? "Saving…" : "Create space"}
      </Button>
    </form>
  );
}

// ─── Step 5 – Personal space (optional) ───────────────────────────────────────
// The database gave the admin a private space when they joined the tenant
// (`core.ensure_personal_space`). This step can rename it. Continue with the
// current name just proceeds; a keep-link only appears after they edit.

function Step5PersonalSpaceForm({
  accessToken,
  onComplete,
  t,
  userId,
}: {
  accessToken: string;
  onComplete: (name: string | null) => void;
  t: Translations;
  userId: string;
}) {
  const [space, setSpace] = useState<
    { id: string; key: string; name: string } | null | undefined
  >(undefined);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    readPersonalSpace({ accessToken, userId })
      .then((found) => {
        if (!mounted) {
          return;
        }
        setSpace(found);
        setName(found?.name ?? "");
      })
      .catch((err) => {
        if (mounted) {
          setSpace(null);
          setError(
            err instanceof Error
              ? err.message
              : "Could not read the personal space."
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, [accessToken, userId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!space) {
      onComplete(null);
      return;
    }
    if (!trimmed) {
      setError("A name is required.");
      return;
    }
    if (trimmed === space.name) {
      onComplete(space.name);
      return;
    }
    setSubmitting(true);
    try {
      await namePersonalSpace({
        accessToken,
        name: trimmed,
        spaceId: space.id,
      });
      onComplete(trimmed);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the space name."
      );
      setSubmitting(false);
    }
  };

  if (space === undefined) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <AnimatedLoaderIcon play="always" size="sm" /> Looking for your personal
        space…
      </p>
    );
  }

  if (space === null) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          No personal space was created for your account. The database makes one
          when a person joins a team; this installation's did not. You can carry
          on — everything else works without it.
        </p>
        <ErrorLine message={error} />
        <Button
          className="h-9 w-full"
          onClick={() => onComplete(null)}
          type="button"
        >
          Continue
        </Button>
      </div>
    );
  }

  const unchanged = name.trim() === space.name;

  return (
    <form className="flex flex-col gap-5" onSubmit={save}>
      <div className="flex flex-col gap-1.5">
        <Label className="font-medium text-sm" htmlFor="setup-personal-space">
          {t.setup.step5NameLabel}
        </Label>
        <Input
          autoFocus
          className="h-9 rounded-[4px]"
          disabled={submitting}
          id="setup-personal-space"
          onChange={(e) => setName(e.target.value)}
          value={name}
        />
        <p className="text-muted-foreground text-xs">{t.setup.step5NameHint}</p>
      </div>

      <ErrorLine message={error} />

      <Button className="mt-1 h-9 w-full" disabled={submitting} type="submit">
        {submitting && (
          <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
        )}
        {submitting
          ? t.setup.step5Saving
          : unchanged
            ? t.setup.gateContinue
            : t.setup.step5SaveName}
      </Button>
      {unchanged ? null : (
        <SkipLink disabled={submitting} onClick={() => onComplete(space.name)}>
          {t.setup.step5KeepName(space.name)}
        </SkipLink>
      )}
    </form>
  );
}

// ─── Step 6 – Ready ───────────────────────────────────────────────────────────
// The only screen that signs the SHARED client in, so the router's
// "authenticated → leave /initial_setup" rule cannot fire mid-wizard.

function OutcomeRow({
  status,
  text,
  trailing,
}: {
  status: "ok" | "warn";
  text: string;
  trailing: string;
}) {
  return (
    <li className="flex items-start gap-2 py-2">
      <span
        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center ${
          status === "ok"
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-amber-700 dark:text-amber-400"
        }`}
      >
        {status === "ok" ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <span className="font-bold text-xs leading-none">!</span>
        )}
      </span>
      <span className="min-w-0 flex-1 text-sm">{text}</span>
      <span className="shrink-0 text-muted-foreground text-xs">{trailing}</span>
    </li>
  );
}

function Step6Ready({
  adminCredentials,
  onComplete,
  outcome,
}: {
  adminCredentials: AdminValues;
  onComplete: (path: string) => void;
  outcome: WizardOutcome;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (path: string) => {
    setError(null);
    setBusy(path);
    try {
      const supabase = getSupabaseAuthClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: adminCredentials.email.trim(),
        password: adminCredentials.password,
      });
      if (signInError) {
        throw signInError;
      }
      onComplete(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(null);
    }
  };

  const provider = outcome.provider;
  const spacePath = `/s/${outcome.spaceKey}`;

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-border-soft">
        <OutcomeRow
          status="ok"
          text={`Team "${outcome.teamName}" and space "${outcome.spaceName}" at ${spacePath}`}
          trailing="done"
        />
        {provider?.kind === "connected" ? (
          <OutcomeRow
            status={provider.reloadConfirmed ? "ok" : "warn"}
            text={
              provider.reloadConfirmed
                ? `${provider.label} connected — the copilot answers on it`
                : `${provider.label} key saved; apps/ai did not confirm the reload. Restart it if the first chat has no model.`
            }
            trailing={provider.reloadConfirmed ? "done" : "check"}
          />
        ) : (
          <OutcomeRow
            status="warn"
            text="No AI provider yet — the copilot cannot answer. Set a key in Setup → Platform settings."
            trailing="later"
          />
        )}
        <OutcomeRow
          status="ok"
          text={
            outcome.personalSpaceName
              ? `Personal space "${outcome.personalSpaceName}" at /s/me`
              : "Personal space at /s/me"
          }
          trailing="done"
        />
      </ul>

      <ErrorLine message={error} />

      <Button
        className="h-9 w-full"
        disabled={busy !== null}
        onClick={() => void open(spacePath)}
        type="button"
      >
        {busy === spacePath && (
          <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
        )}
        Open the space
      </Button>
      <div className="flex items-center justify-between">
        <SkipLink
          disabled={busy !== null}
          onClick={() => void open("/setup/platform")}
        >
          Platform settings
        </SkipLink>
        <SkipLink disabled={busy !== null} onClick={() => void open("/s/me")}>
          Open my personal space
        </SkipLink>
      </div>
    </div>
  );
}

// ─── Wizard Shell ─────────────────────────────────────────────────────────────

/**
 * Card numeral, blob and glow, one per step. The glow is an inline style, not a
 * `shadow-[…]` class: Tailwind scans source text, so a class built from a
 * variable is never generated.
 */
const STEP_CHROME: Record<
  Step,
  { blob: "round" | "drop" | "flame"; glow: string; numeral: string }
> = {
  0: {
    blob: "round",
    glow: "0 8px 40px -8px oklch(50% 0.05 60 / 0.18)",
    numeral: "oklch(60% 0.03 60)",
  },
  1: {
    blob: "round",
    glow: "0 8px 40px -8px oklch(50% 0.18 264 / 0.18)",
    numeral: "oklch(64% 0.195 35)",
  },
  2: {
    blob: "drop",
    glow: "0 8px 40px -8px oklch(72% 0.16 68 / 0.22)",
    numeral: "#3358d4",
  },
  3: {
    blob: "flame",
    glow: "0 8px 40px -8px oklch(60% 0.15 300 / 0.22)",
    numeral: "oklch(55% 0.15 300)",
  },
  4: {
    blob: "flame",
    glow: "0 8px 40px -8px oklch(72% 0.13 150 / 0.22)",
    numeral: "oklch(58% 0.13 150)",
  },
  5: {
    blob: "drop",
    glow: "0 8px 40px -8px oklch(70% 0.12 200 / 0.22)",
    numeral: "oklch(55% 0.12 200)",
  },
  6: {
    blob: "round",
    glow: "0 8px 40px -8px oklch(64% 0.195 35 / 0.25)",
    numeral: "oklch(64% 0.195 35)",
  },
};

interface InitialSetupWizardProps {
  /** Called when the wizard is done, with the path to land on. */
  onComplete: (path: string) => void;
}

export function InitialSetupWizard({ onComplete }: InitialSetupWizardProps) {
  const [locale, setLocale] = useState<AuthLocale>(detectAuthLocale);
  const t = AUTH_TRANSLATIONS[locale];
  const [step, setStep] = useState<Step>(0);
  const [gateChecks, setGateChecks] = useState<SetupCheck[]>([]);
  // Admin credentials are carried through every step: step 2 signs in with
  // them on a detached client, the Ready screen signs the shared client in.
  const [adminCredentials, setAdminCredentials] = useState<AdminValues>({
    name: "",
    email: "",
    password: "",
  });
  const [accessToken, setAccessToken] = useState("");
  const [userId, setUserId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [provider, setProvider] = useState<ProviderOutcome | null>(null);
  const [space, setSpace] = useState<{ key: string; name: string } | null>(
    null
  );
  const [personalSpaceName, setPersonalSpaceName] = useState<string | null>(
    null
  );

  const gateAttention = attentionCount(gateChecks);
  const providerEnvKeys = aiProviderEnvKeysFromChecks(gateChecks);

  const rail: RailEntry[] = [
    {
      label: t.setup.gateLabel,
      sublabel:
        gateChecks.length === 0
          ? t.setup.gateSublabel
          : gateAttention === 0
            ? t.setup.gateAllPassed
            : t.setup.gateNeedYou(gateAttention),
      summary: t.setup.gateAllPassed,
    },
    {
      label: t.setup.step1Label,
      sublabel: t.setup.step1Sublabel,
      summary: adminCredentials.email || null,
    },
    {
      label: t.setup.step2Label,
      sublabel: t.setup.step2Sublabel,
      summary: teamName || null,
    },
    {
      label: t.setup.step3Label,
      sublabel: t.setup.step3Sublabel,
      summary:
        provider?.kind === "connected"
          ? provider.label
          : provider?.kind === "skipped"
            ? "Skipped"
            : null,
    },
    {
      label: t.setup.step4Label,
      sublabel: t.setup.step4Sublabel,
      summary: space ? `/s/${space.key}` : null,
    },
    {
      label: t.setup.step5Label,
      sublabel: t.setup.step5Sublabel,
      summary: personalSpaceName ?? "/s/me",
    },
    {
      label: t.setup.step6Label,
      sublabel: t.setup.step6Sublabel,
      summary: null,
    },
  ];

  const chrome = STEP_CHROME[step];
  const cardTitle = [
    t.setup.gateCardTitle,
    t.setup.step1CardTitle,
    t.setup.step2CardTitle,
    t.setup.step3CardTitle,
    t.setup.step4CardTitle,
    t.setup.step5CardTitle,
    t.setup.step6CardTitle(space?.name ?? teamName),
  ][step];
  const cardDesc = [
    t.setup.gateCardDesc,
    t.setup.step1CardDesc,
    t.setup.step2CardDesc,
    t.setup.step3CardDesc,
    t.setup.step4CardDesc,
    t.setup.step5CardDesc,
    t.setup.step6CardDesc,
  ][step];

  return (
    <div
      className="grid min-h-dvh"
      style={{
        gridTemplateColumns: "1fr",
        background: "var(--color-paper, oklch(98.4% 0.006 70))",
      }}
    >
      <div className="grid min-h-dvh lg:grid-cols-[420px_1fr]">
        <SetupLeftPanel entries={rail} step={step} t={t} />

        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-[460px]">
            <div className="space-y-4">
              <div className="space-y-2 px-1">
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 48,
                    fontWeight: 700,
                    lineHeight: 1,
                    letterSpacing: "-0.04em",
                    color: chrome.numeral,
                  }}
                >
                  {step === 0 ? "··" : String(step).padStart(2, "0")}
                </p>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-heading font-semibold text-2xl tracking-tight">
                    {cardTitle}
                  </h2>
                  {step === 0 ? (
                    <AuthLocaleSwitch
                      label={t.language}
                      locale={locale}
                      onChange={setLocale}
                    />
                  ) : null}
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {cardDesc}
                </p>
              </div>
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-10 right-4 z-10"
                >
                  <Engenty kind={chrome.blob} size={88} />
                </div>
                <Card className="w-full" style={{ boxShadow: chrome.glow }}>
                  <CardContent className="pt-12">
                    {step === 0 ? (
                      <GateScreen
                        onChecks={setGateChecks}
                        onContinue={() => setStep(1)}
                        t={t}
                      />
                    ) : null}
                    {step === 1 ? (
                      <Step1AdminForm
                        onComplete={(values) => {
                          setAdminCredentials(values);
                          setStep(2);
                        }}
                      />
                    ) : null}
                    {step === 2 ? (
                      <Step2TeamForm
                        adminCredentials={adminCredentials}
                        locale={locale}
                        onComplete={(result) => {
                          setAccessToken(result.accessToken);
                          setUserId(result.userId);
                          setTeamName(result.teamName);
                          if (providerEnvKeys.length > 0) {
                            setProvider(envConnectedOutcome(providerEnvKeys));
                            setStep(4);
                            return;
                          }
                          setStep(3);
                        }}
                      />
                    ) : null}
                    {step === 3 ? (
                      <Step3ProviderForm
                        accessToken={accessToken}
                        envKeys={providerEnvKeys}
                        onComplete={(result) => {
                          setProvider(result);
                          setStep(4);
                        }}
                      />
                    ) : null}
                    {step === 4 ? (
                      <Step4SpaceForm
                        accessToken={accessToken}
                        onComplete={(result) => {
                          setSpace(result);
                          setStep(5);
                        }}
                        teamName={teamName}
                      />
                    ) : null}
                    {step === 5 ? (
                      <Step5PersonalSpaceForm
                        accessToken={accessToken}
                        onComplete={(name) => {
                          setPersonalSpaceName(name);
                          setStep(6);
                        }}
                        t={t}
                        userId={userId}
                      />
                    ) : null}
                    {step === 6 && space ? (
                      <Step6Ready
                        adminCredentials={adminCredentials}
                        onComplete={onComplete}
                        outcome={{
                          personalSpaceName,
                          provider,
                          spaceKey: space.key,
                          spaceName: space.name,
                          teamName,
                        }}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
