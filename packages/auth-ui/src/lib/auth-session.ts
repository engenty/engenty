import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabaseAuthClient } from "./supabase-auth-client";

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
    supabase.auth
      .getSession()
      .then(({ data, error: authError }) => {
        if (!mounted) {
          return;
        }
        if (authError) {
          setError(authError.message);
        }
        setSession(data.session ?? null);
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
