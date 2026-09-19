import {
  CLI_TOKEN_ENV_VAR,
  CliApiError,
  getStoredSession,
} from "./auth-sdk.js";

/**
 * A Supabase user token — what `engenty auth login --dev` stores. Core's own
 * routes (`/api/auth/service-credentials`, tokens, …) verify with core's
 * signing secret and reject it, and the generic "Not logged in" then sends
 * the person back to the very login that produced it.
 */
export function isSupabaseUserToken(token: string | undefined): boolean {
  const payload = token?.split(".")[1];
  if (!payload) {
    return false;
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { aud?: unknown; iss?: unknown };
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    return (
      (typeof claims.iss === "string" && claims.iss.endsWith("/auth/v1")) ||
      aud.includes("authenticated")
    );
  } catch {
    return false;
  }
}

/** The hint `runCliAction` prints under a core API failure. */
export function hintForError(
  error: unknown,
  storedToken: () => string | undefined = () => getStoredSession()?.accessToken
): string | undefined {
  if (!(error instanceof CliApiError)) {
    return;
  }
  if (error.status === 0) {
    return "Is the API running? Start it with: pnpm dev:api (or pass --api-url).";
  }
  if (error.status === 401) {
    if (isSupabaseUserToken(storedToken())) {
      return "The stored session is a Supabase user token (from `engenty auth login --dev`), which core's own routes do not accept. Run `engenty auth login` (device flow, no --dev) and retry — or, for the local AI credential, `engenty service-token ensure-local` needs no login at all.";
    }
    return `Not logged in — run: engenty auth login (or set ${CLI_TOKEN_ENV_VAR}).`;
  }
  if (error.status === 403) {
    return "The authenticated principal lacks the required capabilities — log in with --capabilities matching the tool contract.";
  }
  return;
}
