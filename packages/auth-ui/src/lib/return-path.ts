// Where a signed-out visitor was going.
//
// A link someone was sent — a wizard, a record — must survive the login it
// runs into. The path is kept in localStorage, not sessionStorage: a magic
// link opens a new tab. It expires, so a login days later still lands home.

const RETURN_PATH_KEY = "engenty.auth.returnPath";
const RETURN_PATH_TTL_MS = 30 * 60 * 1000;

/** An in-app path only — never another origin (`//host`) or a scheme. */
export function sanitizeRedirectPath(raw: string | null): string {
  const value = raw?.trim();
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function worthReturningTo(path: string): boolean {
  return path !== "/" && !path.startsWith("/auth");
}

export function rememberReturnPath(path: string): void {
  const safe = sanitizeRedirectPath(path);
  if (!worthReturningTo(safe)) {
    return;
  }
  try {
    localStorage.setItem(
      RETURN_PATH_KEY,
      JSON.stringify({ at: Date.now(), path: safe })
    );
  } catch {
    // Storage blocked: the visitor lands home after login, as before.
  }
}

/** The remembered path, if one is fresh. Pure — clear it separately. */
export function peekReturnPath(): string | null {
  try {
    const raw = localStorage.getItem(RETURN_PATH_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { at?: unknown; path?: unknown };
    if (
      typeof parsed.at !== "number" ||
      typeof parsed.path !== "string" ||
      Date.now() - parsed.at > RETURN_PATH_TTL_MS
    ) {
      return null;
    }
    const safe = sanitizeRedirectPath(parsed.path);
    return worthReturningTo(safe) ? safe : null;
  } catch {
    return null;
  }
}

export function clearReturnPath(): void {
  try {
    localStorage.removeItem(RETURN_PATH_KEY);
  } catch {
    // Nothing to clear.
  }
}
