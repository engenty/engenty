// Initial setup wizard – split-screen two-step flow.
// Step 1: super-admin credentials; Step 2: first tenant details.
// Only shown when `initial_setup_required` is true (gate check in parent).

import { Button, Card, CardContent, Input, Label } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

interface TenantValues {
  company: string;
  slug: string;
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

// ─── Engenty Blob Avatar (self-contained; CopilotBlobAvatar not exported) ─────
// Replicates the copilot FAB blob with wobble + eye + pupil follow.
// All animation CSS is injected inline so this works outside @engenty/ai-ui.

const BLOB_STYLES = `
@keyframes setup-blob-wobble {
  0%, 100% { transform: scaleX(1) scaleY(1) rotate(0deg); }
  25% { transform: scaleX(1.06) scaleY(0.94) rotate(-1.5deg); }
  50% { transform: scaleX(0.96) scaleY(1.04) rotate(0.5deg); }
  75% { transform: scaleX(1.04) scaleY(0.95) rotate(1.5deg); }
}
@keyframes setup-eye-drift {
  0%, 18%, 100% { transform: translate(0, 0); }
  24%, 38% { transform: translate(2.2px, -1.4px); }
  44%, 60% { transform: translate(-2px, 1px); }
  66%, 82% { transform: translate(1.2px, 1.8px); }
  88% { transform: translate(-1px, -1.6px); }
}
@keyframes setup-eye-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.08); }
}
@keyframes setup-bubble-float {
  0%, 100% { transform: translateY(0); opacity: 0.7; }
  50% { transform: translateY(-3px); opacity: 0.4; }
}
@keyframes setup-blob-shadow {
  0%, 100% { transform: translateX(-50%) scaleX(1); opacity: 0.45; }
  50% { transform: translateX(-50%) scaleX(0.8); opacity: 0.25; }
}
.setup-blob { animation: setup-blob-wobble 6s ease-in-out infinite; border-radius: 48% 52% 34% 36% / 72% 70% 30% 32%; transition: background-color 800ms ease-in-out; }
.setup-blob-lid { animation: setup-eye-blink 6s ease-in-out infinite; transform-origin: center; }
.setup-blob-pupil { animation: setup-eye-drift 9s ease-in-out infinite; }
.setup-blob-bubble { animation: setup-bubble-float 4s ease-in-out infinite; }
.setup-blob-bubble-sm { animation-delay: -1.6s; animation-duration: 3.2s; }
.setup-blob-shadow { animation: setup-blob-shadow 7s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .setup-blob, .setup-blob-lid, .setup-blob-pupil,
  .setup-blob-bubble, .setup-blob-shadow { animation: none; }
}
`;

const FOLLOW_MS = 4500;
const DRIFT_MS = 5500;
const MAX_OFFSET = 3;
const FULL_DEFLECTION = 260;

/** Mouse-tracking pupil — mirrors usePupilMouseFollow from ai-ui. */
function useSetupPupilFollow(ref: React.RefObject<SVGGElement | null>) {
  useEffect(() => {
    const pupil = ref.current;
    if (!pupil || typeof window === "undefined") {
      return;
    }
    let following = false;
    let frame = 0;
    let lastEvent: MouseEvent | null = null;

    const release = () => {
      pupil.style.animation = "";
      pupil.style.transform = "";
      pupil.style.transition = "";
    };

    const apply = () => {
      frame = 0;
      if (!(following && lastEvent)) {
        return;
      }
      const box = pupil.ownerSVGElement?.getBoundingClientRect();
      if (!box || box.width === 0) {
        return;
      }
      const dx = lastEvent.clientX - (box.left + box.width / 2);
      const dy = lastEvent.clientY - (box.top + box.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist === 0) {
        return;
      }
      const reach = MAX_OFFSET * Math.min(1, dist / FULL_DEFLECTION);
      pupil.style.animation = "none";
      pupil.style.transition = "transform 180ms ease-out";
      pupil.style.transform = `translate(${((dx / dist) * reach).toFixed(2)}px, ${((dy / dist) * reach).toFixed(2)}px)`;
    };

    const onMove = (e: MouseEvent) => {
      lastEvent = e;
      if (following && frame === 0) {
        frame = window.requestAnimationFrame(apply);
      }
    };

    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          following = !following;
          if (following) {
            if (frame === 0) {
              frame = window.requestAnimationFrame(apply);
            }
          } else {
            release();
          }
          schedule();
        },
        following ? FOLLOW_MS : DRIFT_MS
      );
    };
    schedule();
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.clearTimeout(timer);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("mousemove", onMove);
      release();
    };
  }, [ref]);
}

/** Body colors matching BLOB_CHARACTER_COLORS in ai-ui */
const BLOB_COLORS = [
  "oklch(64% 0.195 35)", // 0 ember
  "#3358d4", // 1 iris
  "#e08c0b", // 2 citrus
  "#1e7d49", // 3 meadow
  "#d23b5e", // 4 berry
] as const;

/** sizes: sm=48×56 wordmark, md=64×76 card-topper, lg=80×96 hero */
function SetupBlobAvatar({
  size = "lg",
  character = 0,
}: {
  size?: "sm" | "md" | "lg";
  character?: number;
}) {
  const pupilRef = useRef<SVGGElement>(null);
  useSetupPupilFollow(pupilRef);
  const dims: Record<"sm" | "md" | "lg", [number, number, string]> = {
    sm: [48, 56, "size-6"],
    md: [64, 76, "size-8"],
    lg: [80, 96, "size-10"],
  };
  const [w, h, eyeSize] = dims[size];
  const color = BLOB_COLORS[character % BLOB_COLORS.length];
  const bubble1 = {
    sm: { width: 7, height: 7, top: -4, right: -3 },
    md: { width: 9, height: 9, top: -5, right: -3 },
    lg: { width: 11, height: 11, top: -6, right: -4 },
  }[size];
  const bubble2 = {
    sm: { width: 5, height: 5, top: -8, right: 8 },
    md: { width: 6, height: 6, top: -10, right: 10 },
    lg: { width: 8, height: 8, top: -12, right: 12 },
  }[size];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative"
      style={{ width: w, height: h + 10 }}
    >
      <style>{BLOB_STYLES}</style>
      {/* Blob body */}
      <div
        className="setup-blob absolute inset-x-0 top-0 flex items-center justify-center text-white"
        style={{ height: h, background: color }}
      >
        {/* Floating bubbles */}
        <span
          className="setup-blob-bubble absolute rounded-full bg-white/60"
          style={bubble1}
        />
        <span
          className="setup-blob-bubble setup-blob-bubble-sm absolute rounded-full bg-white/35"
          style={bubble2}
        />
        {/* Eye */}
        <svg
          aria-hidden="true"
          className={`${eyeSize} shrink-0`}
          fill="none"
          viewBox="0 0 24 24"
        >
          <g className="setup-blob-lid">
            <circle
              cx="12"
              cy="11"
              r="5.2"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <g className="setup-blob-pupil" ref={pupilRef}>
              <circle cx="12" cy="11" fill="currentColor" r="2.2" />
            </g>
          </g>
        </svg>
      </div>
      {/* Ground shadow */}
      <span
        className="setup-blob-shadow absolute rounded-full bg-black/20 blur-[3px]"
        style={{ height: 6, width: "70%", bottom: 0, left: "50%" }}
      />
    </div>
  );
}

// Accent palette from DESIGN.md for the left panel elements
const PANEL_STEP_COLORS = [
  { bg: "oklch(64% 0.195 35)", ring: "oklch(64% 0.195 35 / 0.4)" }, // ember
  { bg: "#3358d4", ring: "#3358d4aa" }, // iris
] as const;

function SetupLeftPanel({ step }: { step: Step }) {
  const t = useMemo(() => AUTH_TRANSLATIONS[detectAuthLocale()], []);
  return (
    <div
      className="hidden flex-col justify-between lg:flex"
      style={{
        background:
          "linear-gradient(160deg, oklch(20% 0.025 60) 0%, oklch(25% 0.06 285) 45%, oklch(28% 0.07 35) 100%)",
        padding: "3rem",
      }}
    >
      {/* Content — fills remaining height and centers vertically */}
      <div className="flex flex-1 flex-col justify-center space-y-8">
        <div className="space-y-1">
          <p
            className="font-bold font-heading text-white tracking-tight"
            style={{ fontSize: 22, letterSpacing: "-0.02em" }}
          >
            engenty
          </p>
          <p style={{ fontSize: 13, color: "oklch(100% 0 0 / 0.45)" }}>
            {t.tagline}
          </p>
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
            style={{ fontSize: 14, color: "oklch(100% 0 0 / 0.5)" }}
          >
            {t.setup.desc}
          </p>
        </div>

        {/* Step indicators */}
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

      {/* Footer */}
      <p className="text-white/30 text-xs">{t.footer}</p>
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
      className="grid min-h-screen"
      style={{
        gridTemplateColumns: "1fr",
        background: "var(--color-paper, oklch(98.4% 0.006 70))",
      }}
    >
      {/* Two-column on lg+ */}
      <div className="grid min-h-screen lg:grid-cols-[420px_1fr]">
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
                  <div className="absolute -top-11 right-5 z-10">
                    {/* Iris (1) — distinct from panel's ember (0) */}
                    <SetupBlobAvatar character={1} size="md" />
                  </div>
                  <Card className="w-full shadow-[0_8px_40px_-8px_#3358d428]">
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
                  <div className="absolute -top-11 right-5 z-10">
                    {/* Citrus (2) — distinct from panel's iris (1) */}
                    <SetupBlobAvatar character={2} size="md" />
                  </div>
                  <Card className="w-full shadow-[0_8px_40px_-8px_#e08c0b28]">
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
