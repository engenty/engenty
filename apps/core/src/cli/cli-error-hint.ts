import { CLI_TOKEN_ENV_VAR, CliApiError } from "./auth-sdk.js";

/** The hint `runCliAction` prints under a core API failure. */
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
