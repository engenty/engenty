// Initial setup wizard – split-screen three-step flow.
// Step 1: administrator credentials; Step 2: the team this installation is
// for; Step 3: the space its work starts in.
//
// Steps 2 and 3 RENAME what step 1 already created: creating the first admin
// calls `ensureDefaultTenant` ("Default Tenant") and a trigger gives that
// tenant its default "Company" space. See initial-setup-workspace.ts.
// Only shown when `initial_setup_required` is true (gate check in parent).

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
import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { AUTH_TRANSLATIONS, detectAuthLocale } from "../lib/auth-i18n";
import { createInitialAdmin } from "../lib/initial-setup";
import {
  nameFirstSpace,
  nameTenant,
  readCurrentTenant,
} from "../lib/initial-setup-workspace";
import {
  createDetachedSupabaseAuthClient,
  getSupabaseAuthClient,
} from "../lib/supabase-auth-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

interface AdminValues {
  email: string;
  name: string;
  password: string;
}

// ─── Left Panel ───────────────────────────────────────────────────────────────

/** Landing hero ember + cream accents (same as AuthLoginLayout). */
const BRAND_EMBER = "oklch(44% 0.16 30)";
const BRAND_CREAM = "oklch(88% 0.11 75)";
const BRAND_MUTED = "oklch(92% 0.03 40)";
const BRAND_SOFT = "oklch(100% 0 0 / 0.55)";
const PANEL_STEP_COLORS = [
  { bg: BRAND_CREAM },
  { bg: "oklch(78% 0.12 264)" }, // soft cobalt on ember
  { bg: "oklch(82% 0.13 150)" }, // moss on ember
] as const;

function SetupLeftPanel({ step }: { step: Step }) {
  const t = useMemo(() => AUTH_TRANSLATIONS[detectAuthLocale()], []);
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

        <div className="grid grid-cols-3 gap-4">
          <StepIndicator
            accent={PANEL_STEP_COLORS[0].bg}
            active={step === 1}
            done={step > 1}
            label={t.setup.step1Label}
            num={1}
            sublabel={t.setup.step1Sublabel}
          />
          <StepIndicator
            accent={PANEL_STEP_COLORS[1].bg}
            active={step === 2}
            done={step > 2}
            label={t.setup.step2Label}
            num={2}
            sublabel={t.setup.step2Sublabel}
          />
          <StepIndicator
            accent={PANEL_STEP_COLORS[2].bg}
            active={step === 3}
            done={false}
            label={t.setup.step3Label}
            num={3}
            sublabel={t.setup.step3Sublabel}
          />
        </div>
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

/** "Four principles" style step indicator: large mono numeral + fixed-width label. */
function StepIndicator({
  accent = "oklch(64% 0.195 35)",
  active,
  done,
  label,
  num,
  sublabel,
}: {
  accent?: string;
  active: boolean;
  done: boolean;
  label: string;
  num: number;
  sublabel?: string;
}) {
  const isVisible = active || done;
  const numStr = String(num).padStart(2, "0");
  return (
    <div
      className="space-y-1 transition-opacity"
      style={{ opacity: isVisible ? 1 : 0.28 }}
    >
      {/* Large accent numeral — the visual anchor */}
      <p
        aria-hidden="true"
        style={{
          fontFamily: "ui-monospace, 'Cascadia Code', monospace",
          fontSize: 52,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: done
            ? "oklch(100% 0 0 / 0.9)"
            : active
              ? accent
              : "oklch(100% 0 0 / 0.2)",
          transition: "color 400ms ease",
        }}
      >
        {numStr}
      </p>
      {/* Mono label */}
      <p
        style={{
          fontFamily: "ui-monospace, 'Cascadia Code', monospace",
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: active
            ? "white"
            : done
              ? "oklch(100% 0 0 / 0.7)"
              : "oklch(100% 0 0 / 0.35)",
          transition: "color 400ms ease",
        }}
      >
        {label}
      </p>
      {sublabel && (
        <p style={{ fontSize: 11, color: "oklch(100% 0 0 / 0.3)" }}>
          {sublabel}
        </p>
      )}
    </div>
  );
}

// ─── Step 1 – Super Admin ─────────────────────────────────────────────────────
// NOTE: We deliberately do NOT sign in here. Signing in would flip
// `isAuthenticated` → true, causing AuthenticatedRoutes to redirect
// /initial_setup → /dashboard and skip Step 2 entirely.
// The Supabase sign-in is deferred to the end of Step 2.

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
      // Create the admin account only — no sign-in yet.
      await createInitialAdmin({
        email: values.email.trim(),
        password: values.password,
        display_name: values.name.trim(),
      });
      // Pass raw credentials forward; Step 2 will sign in after tenant creation.
      onComplete(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      {/* Name */}
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

      {/* Email */}
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

      {/* Password */}
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

      {error && (
        <p className="rounded-[4px] bg-destructive/8 px-3 py-2 text-destructive text-sm">
          {error}
        </p>
      )}

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
// Renames the tenant the administrator is already in. Creating a second one
// here — what the `engenty.app/<slug>` step did — left the admin signed in to
// "Default Tenant" and the named tenant empty.
//
// Signs in on a DETACHED client: the shared one would flip the app to
// authenticated and the router would leave the wizard before step 3.

function Step2TeamForm({
  adminCredentials,
  onComplete,
}: {
  adminCredentials: AdminValues;
  onComplete: (values: { accessToken: string; teamName: string }) => void;
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
      const tenant = await readCurrentTenant(accessToken);
      if (!tenant) {
        throw new Error("No tenant to name — the administrator has none.");
      }
      await nameTenant({ accessToken, name, tenantId: tenant.id });
      onComplete({ accessToken, teamName: name });
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

      {error && (
        <p className="rounded-[4px] bg-destructive/8 px-3 py-2 text-destructive text-sm">
          {error}
        </p>
      )}

      <Button className="mt-1 h-9 w-full" disabled={submitting} type="submit">
        {submitting && (
          <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
        )}
        {submitting ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

// ─── Step 3 – The first space ─────────────────────────────────────────────────
// Names the tenant's default space, which the `tenants_ensure_default_space`
// trigger already created with its baseline mounts. The shared Supabase client
// signs in HERE, at the very end, so the auth flip happens once.

function Step3SpaceForm({
  adminCredentials,
  accessToken,
  onComplete,
  teamName,
}: {
  accessToken: string;
  adminCredentials: AdminValues;
  onComplete: () => void;
  teamName: string;
}) {
  const [spaceName, setSpaceName] = useState(teamName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    const supabase = getSupabaseAuthClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: adminCredentials.email.trim(),
      password: adminCredentials.password,
    });
    if (signInError) {
      throw signInError;
    }
    onComplete();
  };

  const run = async (rename: boolean) => {
    setError(null);
    const name = spaceName.trim();
    if (rename && !name) {
      setError("A space name is required.");
      return;
    }
    setSubmitting(true);
    try {
      if (rename) {
        await nameFirstSpace({ accessToken, name });
      }
      await finish();
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
        void run(true);
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

      {error && (
        <p className="rounded-[4px] bg-destructive/8 px-3 py-2 text-destructive text-sm">
          {error}
        </p>
      )}

      <Button className="mt-1 h-9 w-full" disabled={submitting} type="submit">
        {submitting && (
          <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
        )}
        {submitting ? "Opening your space…" : "Open my space"}
      </Button>
      <button
        className="text-muted-foreground text-xs underline-offset-2 hover:underline disabled:opacity-50"
        disabled={submitting}
        onClick={() => void run(false)}
        type="button"
      >
        Skip — keep the default name
      </button>
    </form>
  );
}

// ─── Wizard Shell ─────────────────────────────────────────────────────────────

/**
 * Card numeral, blob and glow, one per step. The glow is an inline style, not a
 * `shadow-[…]` class: Tailwind scans source text, so a class built from a
 * variable is never generated.
 */
const STEP_CHROME = {
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
    glow: "0 8px 40px -8px oklch(72% 0.13 150 / 0.22)",
    numeral: "oklch(58% 0.13 150)",
  },
} as const;

interface InitialSetupWizardProps {
  /** Called when every step completes and the app can navigate to `/`. */
  onComplete: () => void;
}

export function InitialSetupWizard({ onComplete }: InitialSetupWizardProps) {
  const t = useMemo(() => AUTH_TRANSLATIONS[detectAuthLocale()], []);
  const [step, setStep] = useState<Step>(1);
  // Admin credentials are carried through every step: step 2 signs in with
  // them on a detached client, step 3 signs the shared client in at the end.
  const [adminCredentials, setAdminCredentials] = useState<AdminValues>({
    name: "",
    email: "",
    password: "",
  });
  const [accessToken, setAccessToken] = useState("");
  const [teamName, setTeamName] = useState("");

  const chrome = STEP_CHROME[step];
  const cardTitle =
    step === 1
      ? t.setup.step1CardTitle
      : step === 2
        ? t.setup.step2CardTitle
        : t.setup.step3CardTitle;
  const cardDesc =
    step === 1
      ? t.setup.step1CardDesc
      : step === 2
        ? t.setup.step2CardDesc
        : t.setup.step3CardDesc;

  return (
    <div
      className="grid min-h-dvh"
      style={{
        gridTemplateColumns: "1fr",
        background: "var(--color-paper, oklch(98.4% 0.006 70))",
      }}
    >
      {/* Two-column on lg+ */}
      <div className="grid min-h-dvh lg:grid-cols-[420px_1fr]">
        {/* Left: decorative brand panel */}
        <SetupLeftPanel step={step} />

        {/* Right: form panel — blob sits on top of each card */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-[420px]">
            {/* Heading + description outside the card (Engenty convention). */}
            <div className="space-y-4">
              <div className="space-y-2 px-1">
                <p
                  style={{
                    fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                    fontSize: 48,
                    fontWeight: 700,
                    lineHeight: 1,
                    letterSpacing: "-0.04em",
                    color: chrome.numeral,
                  }}
                >
                  {String(step).padStart(2, "0")}
                </p>
                <h2 className="font-heading font-semibold text-2xl tracking-tight">
                  {cardTitle}
                </h2>
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
                        onComplete={(result) => {
                          setAccessToken(result.accessToken);
                          setTeamName(result.teamName);
                          setStep(3);
                        }}
                      />
                    ) : null}
                    {step === 3 ? (
                      <Step3SpaceForm
                        accessToken={accessToken}
                        adminCredentials={adminCredentials}
                        onComplete={onComplete}
                        teamName={teamName}
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
