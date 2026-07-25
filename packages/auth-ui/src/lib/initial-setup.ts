import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessTokenFromClient, getApiBaseUrl } from "./api-client";
import {
  EngentyServiceAvailabilityError,
  errorIfDatabaseUnavailableFromResponse,
  evaluateInitialSetupGate,
  readResponseJsonLoose,
  readSetupApiErrorMessage,
} from "./initial-setup-gate";
import { refreshSupabaseAuthSession } from "./supabase-session-claims";

// A hung dev/proxy backend must fail fast instead of leaving the caller's
// promise (and any UI gated on it) pending forever.
const SETUP_REQUEST_TIMEOUT_MS = 10_000;

export async function isInitialSetupRequired(): Promise<boolean> {
  const gate = await evaluateInitialSetupGate();
  if (gate.status !== "ready") {
    throw new EngentyServiceAvailabilityError(gate);
  }
  return gate.initial_setup_required;
}

export async function createInitialAdmin(input: {
  email: string;
  password: string;
  display_name: string;
}): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/users/setup/create-initial-admin`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(SETUP_REQUEST_TIMEOUT_MS),
    }
  );
  const payload = await readResponseJsonLoose(response);
  const dbErr = errorIfDatabaseUnavailableFromResponse(response, payload);
  if (dbErr) {
    throw dbErr;
  }
  if (!response.ok) {
    throw new Error(
      readSetupApiErrorMessage(payload, "Create initial admin failed.")
    );
  }
}

export async function initializeWorkspaceAdmin(
  supabase: SupabaseClient
): Promise<void> {
  const accessToken = await getAccessTokenFromClient(supabase);
  if (!accessToken) {
    throw new Error("Not authenticated.");
  }
  const response = await fetch(
    `${getApiBaseUrl()}/api/users/setup/initialize-admin`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(SETUP_REQUEST_TIMEOUT_MS),
    }
  );
  const payload = await readResponseJsonLoose(response);
  const dbErr = errorIfDatabaseUnavailableFromResponse(response, payload);
  if (dbErr) {
    throw dbErr;
  }
  if (!response.ok) {
    throw new Error(
      readSetupApiErrorMessage(payload, "Initialization failed.")
    );
  }
  await refreshSupabaseAuthSession();
}

export async function ensureCurrentWorkspaceUser(
  supabase: SupabaseClient
): Promise<void> {
  const accessToken = await getAccessTokenFromClient(supabase);
  if (!accessToken) {
    throw new Error("Not authenticated.");
  }
  const response = await fetch(
    `${getApiBaseUrl()}/api/users/setup/ensure-current-user`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(SETUP_REQUEST_TIMEOUT_MS),
    }
  );
  const payload = await readResponseJsonLoose(response);
  const dbErr = errorIfDatabaseUnavailableFromResponse(response, payload);
  if (dbErr) {
    throw dbErr;
  }
  if (!response.ok) {
    throw new Error(
      readSetupApiErrorMessage(payload, "Ensure current user failed.")
    );
  }
  await refreshSupabaseAuthSession();
}
