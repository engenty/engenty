import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import {
  type AuthCardFormValues,
  authCardFormSchema,
} from "../components/auth-card-schema";
import { ensureDevLoginUser, fetchDevLoginStatus } from "../lib/dev-login";
import { createInitialAdmin } from "../lib/initial-setup";
import {
  evaluateInitialSetupGate,
  gateFailureToNavigationState,
} from "../lib/initial-setup-gate";
import { getSupabaseAuthClient } from "../lib/supabase-auth-client";

export type AuthCardMode = "login" | "signup" | "forgot";

/** Prefer a human message; never surface JSON.stringify(Error) → "{}". */
function formatAuthFailure(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message?.trim();
    if (msg && msg !== "{}") {
      return msg;
    }
  }
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    for (const key of [
      "msg",
      "message",
      "error_description",
      "error",
    ] as const) {
      const value = record[key];
      if (typeof value === "string" && value.trim() && value.trim() !== "{}") {
        return value.trim();
      }
    }
  }
  return "Authentication failed.";
}

export function useAuthCard(onAuthenticated?: () => void) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthCardMode>("login");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [initialSetupRequired, setInitialSetupRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSetupState, setCheckingSetupState] = useState(true);

  const isLogin = mode === "login";
  const form = useForm<AuthCardFormValues>({
    resolver: zodResolver(authCardFormSchema),
    defaultValues: { email: "", password: "", fullName: "" },
  });

  useEffect(() => {
    let mounted = true;
    evaluateInitialSetupGate()
      .then((gate) => {
        if (!mounted) {
          return;
        }
        if (gate.status !== "ready") {
          navigate("/service_unavailable", {
            replace: true,
            state: gateFailureToNavigationState(gate),
          });
          return;
        }
        setInitialSetupRequired(gate.initial_setup_required);
        if (gate.initial_setup_required) {
          setMode("signup");
        }
      })
      .finally(() => {
        if (mounted) {
          setCheckingSetupState(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    setError(null);
    const supabase = getSupabaseAuthClient();
    try {
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          values.email,
          {
            redirectTo: `${window.location.origin}/auth/callback`,
          }
        );
        if (resetError) {
          throw resetError;
        }
        setResetEmailSent(true);
        return;
      }
      const password = values.password;
      if (
        (isLogin || mode === "signup") &&
        (!password || password.length < 6)
      ) {
        setError("Password must be at least 6 characters");
        return;
      }
      if (isLogin && !initialSetupRequired) {
        const devStatus = await fetchDevLoginStatus();
        if (devStatus.available) {
          await ensureDevLoginUser({
            email: values.email,
            password: password!,
          });
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: password!,
        });
        if (signInError) {
          throw signInError;
        }
      } else if (initialSetupRequired) {
        await createInitialAdmin({
          email: values.email,
          password: password!,
          display_name: values.fullName ?? values.email.split("@")[0] ?? "",
        });
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: password!,
        });
        if (signInError) {
          throw signInError;
        }
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email: values.email,
          password: password!,
          options: {
            data: { full_name: values.fullName ?? "" },
            emailRedirectTo: window.location.origin,
          },
        });
        if (signUpError) {
          throw signUpError;
        }
      }
      onAuthenticated?.();
    } catch (err) {
      setError(formatAuthFailure(err));
    } finally {
      setSubmitting(false);
    }
  });

  return {
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
  };
}
