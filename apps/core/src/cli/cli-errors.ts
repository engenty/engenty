import { CLI_TOKEN_ENV_VAR, CliApiError } from "./auth-sdk.js";

export function hintForError(error: unknown): string | undefined {
  if (!(error instanceof CliApiError)) {
    return;
  }
  if (error.status === 0) {
    return "Is the API running? Start it with: pnpm dev:api (or pass --api-url).";
  }
  if (error.status === 401) {
    return `Not logged in — run: engenty auth login (or set ${CLI_TOKEN_ENV_VAR}).`;
  }
  if (error.status === 403) {
    return "The authenticated principal lacks the required capabilities — log in with --capabilities matching the tool contract.";
  }
  return;
}

/**
 * Wrap a Commander action: API/auth failures become a one-line JSON error on
 * stderr (with a `hint`) and exit code 1 instead of a stack trace.
 */
export function runCliAction<A extends unknown[]>(
  fn: (...args: A) => Promise<void> | void
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const hint = hintForError(error);
      console.error(
        JSON.stringify({ ok: false, error: message, ...(hint ? { hint } : {}) })
      );
      process.exitCode = 1;
    }
  };
}
