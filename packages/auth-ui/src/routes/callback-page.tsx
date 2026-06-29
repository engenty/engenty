import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SetNewPasswordForm } from "../components/set-new-password-form";
import { getSupabaseAuthClient } from "../lib/supabase-auth-client";

function isRecoveryFromHash(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.slice(1));
  return params.get("type") === "recovery";
}

export function CallbackPage() {
  const navigate = useNavigate();
  const [isRecovery, setIsRecovery] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const recovery = isRecoveryFromHash();
    const supabase = getSupabaseAuthClient();
    supabase.auth.getSession().then(() => {
      setReady(true);
      if (recovery) {
        setIsRecovery(true);
      } else {
        navigate("/", { replace: true });
      }
    });
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground text-sm">
        Finalizing sign-in...
      </div>
    );
  }

  if (isRecovery) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-4">
        <SetNewPasswordForm />
      </div>
    );
  }

  return null;
}
