import { getSupabaseAuthClient } from "@engenty/auth-ui";
import type { ReactNode } from "react";
import { useState } from "react";

interface AppErrorCardProps {
  envPre?: ReactNode;
  hint?: string;
  message: string;
  /** Offer a local sign-out so a burnt session can reach /auth/login again. */
  offerSignOut?: boolean;
  title: string;
}

function readableMessage(message: string): string {
  const trimmed = message.trim();
  if (
    !trimmed ||
    trimmed === "{}" ||
    trimmed === "[object Object]" ||
    trimmed === "undefined" ||
    trimmed === "null"
  ) {
    return "Session could not be restored. Sign out and sign in again.";
  }
  return trimmed;
}

export function AppErrorCard({
  title,
  message,
  hint,
  envPre,
  offerSignOut = false,
}: AppErrorCardProps) {
  const [signingOut, setSigningOut] = useState(false);
  const body = readableMessage(message);

  async function signOut() {
    setSigningOut(true);
    try {
      await getSupabaseAuthClient().auth.signOut({ scope: "local" });
    } catch {
      // Still force a clean login surface.
    }
    window.location.replace("/auth/login");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="ui-card-panel max-w-xl space-y-3 p-6">
        <h1 className="font-semibold text-lg">{title}</h1>
        <p className="text-muted-foreground text-sm">{body}</p>
        {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
        {envPre ? (
          <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
            {envPre}
          </pre>
        ) : null}
        {offerSignOut ? (
          <button
            className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm"
            disabled={signingOut}
            onClick={() => void signOut()}
            type="button"
          >
            {signingOut ? "Signing out…" : "Sign out and try again"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
