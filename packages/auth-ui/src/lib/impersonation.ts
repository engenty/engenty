import { getApiBaseUrl } from "./api-client.js";
import { getSupabaseAuthClient } from "./supabase-auth-client.js";

export const IMPERSONATION_STORAGE_KEY = "engenty.impersonation";

export interface ImpersonationUserLabel {
  display_name: string | null;
  email: string;
  id: string;
}

export interface ImpersonationState {
  access_token: string;
  actor: ImpersonationUserLabel;
  refresh_token: string;
  started_at: string;
  target: ImpersonationUserLabel;
}

interface ImpersonateApiResponse {
  access_token: string;
  actor: ImpersonationUserLabel;
  error?: string;
  refresh_token: string;
  target: ImpersonationUserLabel;
}

function readStorage(): Storage | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  return sessionStorage;
}

export function getImpersonationState(): ImpersonationState | null {
  const storage = readStorage();
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(IMPERSONATION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ImpersonationState;
    if (
      !(
        parsed?.access_token &&
        parsed?.refresh_token &&
        parsed?.actor?.id &&
        parsed?.target?.id
      )
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isImpersonating(): boolean {
  return getImpersonationState() !== null;
}

export function clearImpersonationState(): void {
  readStorage()?.removeItem(IMPERSONATION_STORAGE_KEY);
}

function writeImpersonationState(state: ImpersonationState): void {
  const storage = readStorage();
  if (!storage) {
    throw new Error("sessionStorage is not available");
  }
  storage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Swap the browser Supabase session to `userId`, stashing the current session
 * so {@link stopImpersonation} can restore it. Superadmin-gated on the server.
 */
export async function startImpersonation(userId: string): Promise<void> {
  if (isImpersonating()) {
    throw new Error("Already impersonating another user. Switch back first.");
  }

  const supabase = getSupabaseAuthClient();
  const { data: current, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }
  const currentSession = current.session;
  if (!(currentSession?.access_token && currentSession.refresh_token)) {
    throw new Error("No active session to stash before impersonation.");
  }

  const response = await fetch(`${getApiBaseUrl()}/api/auth/impersonate`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${currentSession.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = (await response
    .json()
    .catch(() => ({}))) as ImpersonateApiResponse;
  if (!response.ok) {
    throw new Error(body.error ?? `Impersonation failed (${response.status})`);
  }
  if (!(body.access_token && body.refresh_token && body.actor && body.target)) {
    throw new Error("Impersonation response was incomplete.");
  }

  // Stash BEFORE setSession so a failed swap still leaves a recoverable path.
  writeImpersonationState({
    access_token: currentSession.access_token,
    refresh_token: currentSession.refresh_token,
    actor: body.actor,
    target: body.target,
    started_at: new Date().toISOString(),
  });

  const { error: setError } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (setError) {
    // Roll back stash — we never successfully entered impersonation.
    clearImpersonationState();
    throw setError;
  }
}

/**
 * Restore the stashed superadmin session and clear impersonation state.
 */
export async function stopImpersonation(): Promise<void> {
  const stashed = getImpersonationState();
  if (!stashed) {
    throw new Error("Not currently impersonating.");
  }

  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.auth.setSession({
    access_token: stashed.access_token,
    refresh_token: stashed.refresh_token,
  });
  if (error) {
    throw error;
  }
  clearImpersonationState();
}

/**
 * End the browser session without restoring the stashed admin session.
 * Call this from Logout while impersonating (or always — safe no-op).
 */
export async function signOutClearingImpersonation(): Promise<void> {
  clearImpersonationState();
  await getSupabaseAuthClient().auth.signOut({ scope: "local" });
}
