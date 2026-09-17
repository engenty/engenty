import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AuthCard } from "../components/auth-card";
import { AuthLoginLayout } from "../components/auth-login-layout";
import { AuthScreenLayout } from "../components/auth-screen-layout";
import { useInitialSetupGateCheck } from "../hooks/use-initial-setup-gate-check";
import {
  AUTH_TRANSLATIONS,
  type AuthLocale,
  detectAuthLocale,
} from "../lib/auth-i18n";
import { useCoreAuthSession } from "../lib/auth-session";
import { readLoginContext } from "../lib/login-context";

function safeInternalRedirect(value: string | null): string {
  if (!value) {
    return "/";
  }
  // Only same-origin relative paths — never open redirects.
  if (!(value.startsWith("/") && !value.startsWith("//"))) {
    return "/";
  }
  return value;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [locale, setLocale] = useState<AuthLocale>(detectAuthLocale);
  const redirectTo = safeInternalRedirect(searchParams.get("redirect"));
  const context = readLoginContext(searchParams);
  const t = AUTH_TRANSLATIONS[locale].login;
  const { isAuthenticated, loading: sessionLoading } = useCoreAuthSession();
  const { checking, redirected } = useInitialSetupGateCheck({
    redirectWhenSetupRequired: true,
  });

  // OAuth consent (and similar) send users here with ?redirect=… — if a
  // session already exists, skip the form and continue the flow.
  if (!sessionLoading && isAuthenticated && redirectTo !== "/") {
    return <Navigate replace to={redirectTo} />;
  }

  if (checking || redirected || sessionLoading) {
    return <AuthScreenLayout message="Checking..." />;
  }

  const contextual = Boolean(context.continueTo);

  return (
    <AuthLoginLayout locale={locale} onLocaleChange={setLocale}>
      <AuthCard
        description={contextual ? t.continueTo(context.continueTo!) : undefined}
        locale={locale}
        onAuthenticated={() => navigate(redirectTo)}
        title={contextual ? t.signIn : undefined}
      />
    </AuthLoginLayout>
  );
}
