import { Button, Card, CardContent, Input, Label } from "@engenty/ui-core";
import { AnimatedLoaderIcon, AnimatedSendIcon } from "@engenty/ui-icons";
import { Eye, EyeOff } from "lucide-react";
import { useAuthCard } from "../hooks/use-auth-card";
import {
  AUTH_TRANSLATIONS,
  type AuthLocale,
  detectAuthLocale,
} from "../lib/auth-i18n";
import { AuthCardResetEmailSent } from "./auth-card-reset-email-sent";
import { PasswordAuthBlock } from "./password-auth-block";

/** One step above the styleguide single-line field (h-8 → h-9). */
const AUTH_FIELD_CLASS = "h-9 min-h-9 px-3 text-base md:text-base";

interface AuthCardProps {
  /** Override the default mode-based description. */
  description?: string;
  /** When true, hide signup / forgot-password mode switches (OAuth embeds). */
  hideModeSwitch?: boolean;
  locale?: AuthLocale;
  onAuthenticated?: () => void;
  /** Override the default mode-based heading. */
  title?: string;
}

// Accent color per mode (matches blob character palette)
const MODE_COLOR: Record<string, string> = {
  login: "oklch(64% 0.195 35)", // ember
  signup: "#3358d4", // iris
  forgot: "#1e7d49", // meadow
};

export function AuthCard({
  description,
  hideModeSwitch = false,
  locale: localeProp,
  onAuthenticated,
  title: titleOverride,
}: AuthCardProps) {
  const locale = localeProp ?? detectAuthLocale();
  const t = AUTH_TRANSLATIONS[locale].login;

  const {
    checkingSetupState,
    error,
    form,
    handleSubmit,
    initialSetupRequired,
    isLogin,
    mode,
    resetEmailSent,
    setMode,
    setResetEmailSent,
    setShowPassword,
    showPassword,
    submitting,
  } = useAuthCard(onAuthenticated);

  if (resetEmailSent) {
    return (
      <AuthCardResetEmailSent
        email={form.watch("email")}
        onBackToSignIn={() => {
          setResetEmailSent(false);
          setMode("login");
        }}
      />
    );
  }

  const accentColor = MODE_COLOR[mode] ?? MODE_COLOR.login;

  const title =
    titleOverride ??
    (mode === "forgot"
      ? t.resetPassword
      : isLogin
        ? t.welcomeBack
        : initialSetupRequired
          ? t.initialSetup
          : t.createAccount);

  const subtitle =
    description ??
    (checkingSetupState
      ? t.checkingSetup
      : mode === "forgot"
        ? t.resetPasswordDesc
        : initialSetupRequired
          ? t.initialSetupDesc
          : isLogin
            ? t.signInDesc
            : t.createAccountDesc);

  return (
    <div className="space-y-4">
      {/* Heading outside the card (Engenty convention) */}
      <div className="space-y-1 px-1">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          {title}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {subtitle}
        </p>
      </div>

      {/* Form card */}
      <Card
        className="w-full"
        style={{
          boxShadow: `0 8px 40px -8px ${accentColor}38`,
          transition: "box-shadow 400ms ease",
        }}
      >
        <CardContent className="space-y-4 pt-6">
          <PasswordAuthBlock
            error={error}
            footer={
              hideModeSwitch ? null : (
                <div className="flex flex-col gap-1">
                  {mode === "forgot" ? (
                    <button
                      className="text-primary text-xs hover:underline"
                      disabled={submitting}
                      onClick={() => setMode("login")}
                      type="button"
                    >
                      Back to sign in
                    </button>
                  ) : (
                    <button
                      className="text-primary text-xs hover:underline"
                      disabled={submitting || initialSetupRequired}
                      onClick={() => setMode(isLogin ? "signup" : "login")}
                      type="button"
                    >
                      {initialSetupRequired
                        ? "Initial setup in progress"
                        : isLogin
                          ? "Need an account?"
                          : "Already have an account?"}
                    </button>
                  )}
                </div>
              )
            }
            isLoading={submitting}
            mode={mode === "forgot" ? "login" : isLogin ? "login" : "signup"}
            onSubmit={handleSubmit}
          >
            {mode !== "forgot" && !isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  className={AUTH_FIELD_CLASS}
                  disabled={submitting}
                  id="fullName"
                  placeholder="John Doe"
                  {...form.register("fullName")}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                className={AUTH_FIELD_CLASS}
                disabled={submitting}
                id="email"
                placeholder="you@company.com"
                type="email"
                {...form.register("email")}
              />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    className={`${AUTH_FIELD_CLASS} pr-10`}
                    disabled={submitting}
                    id="password"
                    placeholder={isLogin ? undefined : "Minimum 6 characters"}
                    type={showPassword ? "text" : "password"}
                    {...form.register("password")}
                  />
                  <button
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    disabled={submitting}
                    onClick={() => setShowPassword((p) => !p)}
                    type="button"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {isLogin && !hideModeSwitch && (
                  <div className="flex justify-end">
                    <button
                      className="text-primary text-xs hover:underline"
                      disabled={submitting}
                      onClick={() => setMode("forgot")}
                      type="button"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>
            )}
            <Button
              className="w-full"
              disabled={submitting}
              size="lg"
              type="submit"
            >
              {submitting ? (
                <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
              ) : mode === "forgot" ? (
                <AnimatedSendIcon className="mr-2" size="sm" />
              ) : null}
              {mode === "forgot"
                ? "Send reset link"
                : isLogin
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </PasswordAuthBlock>
        </CardContent>
      </Card>
    </div>
  );
}
