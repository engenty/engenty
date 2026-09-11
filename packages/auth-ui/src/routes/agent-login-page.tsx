import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getApiBaseUrl } from "../lib/api-client";
import { getSupabaseAuthClient } from "../lib/supabase-auth-client";

function sanitizeRedirectPath(raw: string | null): string {
  const value = raw?.trim();
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

interface DevSession {
  access_token: string;
  refresh_token: string;
}

// Single-flight guard: React StrictMode mounts the page effect twice, and two
// concurrent mint+setSession flows race each other (the second refresh gets
// discarded mid-flight). Both effect runs must share one login promise.
let loginOnce: Promise<void> | null = null;

async function performAgentLogin(query: string): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/auth/dev-login/session${query}`,
    { headers: { accept: "application/json" } }
  );
  if (response.status === 404) {
    throw new Error(
      "Agent login is not available (set ENGENTY_DEV_PASS on the API, non-production)."
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? `Agent login failed (${response.status})`);
  }

  const session = (await response.json()) as DevSession;
  const { error: sessionError } = await getSupabaseAuthClient().auth.setSession(
    {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }
  );
  if (sessionError) {
    throw sessionError;
  }
}

/**
 * Secret-less, build-flag-independent login for browser agents and live tests.
 *
 * Unlike {@link DevLoginPage}, this does NOT depend on `ENV=development` at
 * build time or on `VITE_ENGENTY_DEV_PASS` in the client: the session is minted
 * server-side by `GET /api/auth/dev-login/session` (gated on `ENGENTY_DEV_PASS`
 * + non-prod) and only handed back as scoped tokens. An agent just navigates to
 * `/auth/agent-login` and is signed in.
 */
export function AgentLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Signing in…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const redirectTo = sanitizeRedirectPath(searchParams.get("redirect"));
    const email = searchParams.get("email")?.trim();
    const query = email ? `?email=${encodeURIComponent(email)}` : "";

    void (async () => {
      try {
        loginOnce ??= performAgentLogin(query);
        await loginOnce;
        if (!mounted) {
          return;
        }
        setMessage("Signed in. Redirecting…");
        navigate(redirectTo, { replace: true });
      } catch (err) {
        loginOnce = null;
        if (mounted) {
          setError(err instanceof Error ? err.message : "Agent login failed.");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigate, searchParams]);

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10 p-4">
      <div className="ui-card-panel w-full max-w-md p-6">
        <h1 className="font-semibold text-lg">Agent login</h1>
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
