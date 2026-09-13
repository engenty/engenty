import type { AuthError, Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabaseAuthClient } from "./supabase-auth-client";

/**
 * A refresh token that Supabase will never accept again: rotated on the
 * server but the new one never reached this browser (a crash, a hard
 * reload mid-refresh, two tabs racing), or revoked. Nothing about the
 * deployment is wrong — the SESSION is dead, and the honest answer is the
 * login screen, not a card about env vars.
 */
export function isDeadRefreshTokenError(
  error: Pick<AuthError, "code" | "message">
): boolean {
  const code = error.code ?? "";
  if (
    code === "refresh_token_already_used" ||
    code === "refresh_token_not_found" ||
    code === "session_not_found"
  ) {
    return true;
  }
  return /refresh token/i.test(error.message ?? "");
}

interface SessionAuth {
  getSession: () => Promise<{
    data: { session: Session | null };
    error: Pick<AuthError, "code" | "message"> | null;
  }>;
  signOut: (options: { scope: "local" }) => Promise<unknown>;
}

/**
 * The initial session as the shell should see it: a burnt refresh token is
 * forgotten locally and reads as signed out; every other failure is the
 * message the setup card shows.
 */
export async function loadInitialSession(
  auth: SessionAuth
): Promise<{ error: string | null; session: Session | null }> {
  const { data, error } = await auth.getSession();
  if (error && isDeadRefreshTokenError(error)) {
    await auth.signOut({ scope: "local" }).catch(() => undefined);
    return { error: null, session: null };
  }
  return { error: error?.message ?? null, session: data.session ?? null };
}

export function useCoreAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let supabase;
    try {
      supabase = getSupabaseAuthClient();
    } catch (clientError) {
      if (mounted) {
        setError(
          clientError instanceof Error
            ? clientError.message
            : "Failed to initialize Supabase auth client."
        );
        setLoading(false);
      }
      return () => {
        mounted = false;
      };
    }
    loadInitialSession(supabase.auth)
      .then((initial) => {
        if (!mounted) {
          return;
        }
        if (initial.error) {
          setError(initial.error);
        }
        setSession(initial.session);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) {
        return;
      }
      setSession(nextSession ?? null);
      setLoading(false);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    loading,
    error,
    isAuthenticated: Boolean(session?.access_token),
  };
}
