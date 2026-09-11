// Initial setup wizard – split-screen two-step flow.
// Step 1: super-admin credentials; Step 2: first tenant details.
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
import { useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "../lib/api-client";
import { AUTH_TRANSLATIONS, detectAuthLocale } from "../lib/auth-i18n";
import { createInitialAdmin } from "../lib/initial-setup";
import { getSupabaseAuthClient } from "../lib/supabase-auth-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2;

interface AdminValues {
  email: string;
  name: string;
  password: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a URL-safe slug from a company name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** POST to the superadmin tenant-creation endpoint (requires bearer token). */
async function createFirstTenant(
  name: string,
  slug: string,
  accessToken: string
): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/api/superadmin/tenants`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name, slug }),
  });
  if (!response.ok) {
    let message = `Tenant creation failed (${response.status}).`;
    try {
      const body = (await response.json()) as {
        error?: { message?: string };
        message?: string;
      };
      message =
        body?.error?.message ??
        (typeof body?.message === "string" ? body.message : message);
    } catch {
      // swallow parse errors
    }
    throw new Error(message);
  }
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

        <div className="grid grid-cols-2 gap-4">
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
            done={false}
            label={t.setup.step2Label}
            num={2}
            sublabel={t.setup.step2Sublabel}
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

// ─── Step 2 – First Tenant ────────────────────────────────────────────────────
// Receives admin credentials from Step 1. Signs in HERE (after tenant creation)
// so the auth state flip happens only once — at the very end of the wizard.

function Step2TenantForm({
  adminCredentials,
  onComplete,
}: {
  adminCredentials: AdminValues;
  onComplete: () => void;
}) {
  const [company, setCompany] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slugRef = useRef<HTMLInputElement>(null);

  const handleCompanyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCompany(val);
    if (!slugEdited) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-{2,}/g, "-")
      .slice(0, 48);
    setSlug(raw);
    setSlugEdited(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!company.trim()) {
      setError("Company name is required.");
      return;
    }
    const finalSlug = slug.replace(/^-|-$/g, "");
    if (!finalSlug || finalSlug.length < 2) {
      setError("URL slug must be at least 2 characters.");
      return;
    }

    setSubmitting(true);
    try {
      // Sign in now to get a token for the superadmin tenant endpoint.
      const supabase = getSupabaseAuthClient();
      const { error: signInError, data } =
        await supabase.auth.signInWithPassword({
          email: adminCredentials.email.trim(),
          password: adminCredentials.password,
        });
      if (signInError) {
        throw signInError;
      }
      const accessToken = data.session?.access_token ?? "";
      // Create the first tenant, then let onComplete() trigger navigation.
      await createFirstTenant(company.trim(), finalSlug, accessToken);
      onComplete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create workspace."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      {/* Company */}
      <div className="flex flex-col gap-1.5">
        <Label className="font-medium text-sm" htmlFor="setup-company">
          Company name
        </Label>
        <Input
          autoFocus
          className="h-9 rounded-[4px]"
          disabled={submitting}
          id="setup-company"
          onChange={handleCompanyChange}
          placeholder="Acme Inc."
          required
          value={company}
        />
      </div>

      {/* Slug / URL */}
      <div className="flex flex-col gap-1.5">
        <Label className="font-medium text-sm" htmlFor="setup-slug">
          Workspace URL
        </Label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex select-none items-center text-muted-foreground text-sm">
            engenty.app/
          </span>
          <Input
            autoComplete="off"
            className="h-9 rounded-[4px] pl-[6.5rem] font-mono text-sm"
            disabled={submitting}
            id="setup-slug"
            maxLength={48}
            onChange={handleSlugChange}
            placeholder="acme"
            ref={slugRef}
            required
            value={slug}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Lowercase letters, numbers, and hyphens only.
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
        {submitting ? "Creating workspace…" : "Create workspace & continue"}
      </Button>
    </form>
  );
}

// ─── Wizard Shell ─────────────────────────────────────────────────────────────

interface InitialSetupWizardProps {
  /** Called when both steps complete and the app can navigate to `/`. */
  onComplete: () => void;
}

export function InitialSetupWizard({ onComplete }: InitialSetupWizardProps) {
  const t = useMemo(() => AUTH_TRANSLATIONS[detectAuthLocale()], []);
  const [step, setStep] = useState<Step>(1);
  // Admin credentials are carried from Step 1 to Step 2 (no sign-in yet).
  const [adminCredentials, setAdminCredentials] = useState<AdminValues>({
    name: "",
    email: "",
    password: "",
  });

  const handleAdminComplete = (values: AdminValues) => {
    setAdminCredentials(values);
    setStep(2);
  };

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
            {step === 1 ? (
              // Heading + description outside the card (Engenty convention).
              <div className="space-y-4">
                <div className="space-y-2 px-1">
                  <p
                    style={{
                      fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                      fontSize: 48,
                      fontWeight: 700,
                      lineHeight: 1,
                      letterSpacing: "-0.04em",
                      color: "oklch(64% 0.195 35)",
                    }}
                  >
                    01
                  </p>
                  <h2 className="font-heading font-semibold text-2xl tracking-tight">
                    {t.setup.step1CardTitle}
                  </h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {t.setup.step1CardDesc}
                  </p>
                </div>
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-10 right-4 z-10"
                  >
                    <Engenty kind="round" size={88} />
                  </div>
                  <Card className="w-full shadow-[0_8px_40px_-8px_oklch(50%_0.18_264_/_0.18)]">
                    <CardContent className="pt-12">
                      <Step1AdminForm onComplete={handleAdminComplete} />
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              // Iris blob in panel (step 2), citrus on card — always different.
              <div className="space-y-4">
                <div className="space-y-2 px-1">
                  <p
                    style={{
                      fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                      fontSize: 48,
                      fontWeight: 700,
                      lineHeight: 1,
                      letterSpacing: "-0.04em",
                      color: "#3358d4",
                    }}
                  >
                    02
                  </p>
                  <h2 className="font-heading font-semibold text-2xl tracking-tight">
                    {t.setup.step2CardTitle}
                  </h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {t.setup.step2CardDesc}
                  </p>
                </div>
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-10 right-4 z-10"
                  >
                    <Engenty kind="drop" size={88} />
                  </div>
                  <Card className="w-full shadow-[0_8px_40px_-8px_oklch(72%_0.16_68_/_0.22)]">
                    <CardContent className="pt-12">
                      <Step2TenantForm
                        adminCredentials={adminCredentials}
                        onComplete={onComplete}
                      />
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
