/**
 * Google-style login context from query params.
 *
 * Examples:
 *   /auth/login?redirect=/oauth/consent?…&continue=Cursor&flow=mcp
 *   /auth/login?continue=Gmail
 *
 * `continue` (or `continue_to` / `client_name`) drives the subtitle
 * "Continue to …" / "Weiter zu …". `flow=mcp` defaults the name to "MCP".
 */

export interface LoginContext {
  continueTo: string | null;
}

function firstParam(params: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const raw = params.get(key)?.trim();
    if (raw) {
      return raw;
    }
  }
  return null;
}

export function readLoginContext(params: URLSearchParams): LoginContext {
  const named = firstParam(params, ["continue", "continue_to", "client_name"]);
  if (named) {
    return { continueTo: named };
  }
  const flow = params.get("flow")?.trim().toLowerCase();
  if (flow === "mcp") {
    return { continueTo: "MCP" };
  }
  const redirect = params.get("redirect") ?? "";
  if (redirect.includes("/oauth/consent")) {
    return { continueTo: "MCP" };
  }
  return { continueTo: null };
}
