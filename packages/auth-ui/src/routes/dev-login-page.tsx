import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ensureDevLoginUser,
  fetchDevLoginStatus,
  readDevLoginPasswordFromEnv,
  resolveDevLoginEmail,
} from "../lib/dev-login";
import { getSupabaseAuthClient } from "../lib/supabase-auth-client";

function sanitizeRedirectPath(raw: string | null): string {
  const value = raw?.trim();
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

/**
 * Dev-only one-shot login for browser agents and local smoke tests.
 * Requires `ENGENTY_DEV_PASS` on the API and optionally:
 * - `VITE_ENGENTY_DEV_PASS` / `VITE_ENGENTY_DEV_EMAIL` in the UI env, or
 * - `?email=` query param (password still from env or manual /auth/login).
 */
export function DevLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Signing in…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEngentyDevelopmentEnvironment()) {
      setError("Dev login is only available when ENV=development.");
      return;
    }

    let mounted = true;
    const redirectTo = sanitizeRedirectPath(searchParams.get("redirect"));

    void (async () => {
      const status = await fetchDevLoginStatus();
      if (!mounted) {
        return;
      }
      if (!status.available) {
        setError(
          "Dev login is not configured. Set ENGENTY_DEV_PASS in the API environment."
        );
        return;
      }

      const email = resolveDevLoginEmail({
        queryEmail: searchParams.get("email"),
        statusDefaultEmail: status.defaultEmail,
      });
      const password = readDevLoginPasswordFromEnv();
      if (!password) {
        setError(
          "Set VITE_ENGENTY_DEV_PASS in .env.local (same value as ENGENTY_DEV_PASS), or sign in at /auth/login with any email and the dev password."
        );
        return;
      }

      try {
        const supabase = getSupabaseAuthClient();
        await ensureDevLoginUser({ email, password });
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          throw signInError;
        }
        if (!mounted) {
          return;
        }
        setMessage("Signed in. Redirecting…");
        navigate(redirectTo, { replace: true });
      } catch (signInError) {
        if (!mounted) {
          return;
        }
        setError(
          signInError instanceof Error
            ? signInError.message
            : "Dev login failed."
        );
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigate, searchParams]);

  if (!isEngentyDevelopmentEnvironment()) {
    return <Navigate replace to="/auth/login" />;
  }

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
        <h1 className="font-semibold text-lg">Dev login</h1>
        <p className="mt-2 text-muted-foreground text-sm">{error ?? message}</p>
        {error ? (
          <button
            className="mt-4 text-primary text-sm hover:underline"
            onClick={() => navigate("/auth/login")}
            type="button"
          >
            Go to sign in
          </button>
        ) : null}
      </div>
    </div>
  );
}
