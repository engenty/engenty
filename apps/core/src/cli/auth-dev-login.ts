import { CliApiError, type StoredAuthSession } from "./auth-sdk.js";

/**
 * Dev login: yields a real Supabase USER token (required by the /ai/* routes,
 * which resolve scope via core workspace context), unlike the device-flow
 * principal token. Uses /api/auth/dev-login (ensures the user, dev only) and
 * the Supabase password grant.
 */
export async function loginWithDevCredentials(params: {
  apiUrl: string;
  email: string;
  password: string;
  supabaseAnonKey: string;
  supabaseUrl: string;
}): Promise<StoredAuthSession> {
  const ensure = await fetch(`${params.apiUrl}/api/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: params.email, password: params.password }),
  });
  if (!ensure.ok) {
    throw new CliApiError(
      `Dev login failed (${ensure.status}): ${await ensure.text()} — requires ENGENTY_DEV_PASS on the server and NODE_ENV != production.`,
      ensure.status
    );
  }

  const grant = await fetch(
    `${params.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: params.supabaseAnonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: params.email, password: params.password }),
    }
  );
  if (!grant.ok) {
    throw new CliApiError(
      `Supabase password grant failed (${grant.status}): ${await grant.text()}`,
      grant.status
    );
  }
  const payload = (await grant.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
  };
  return {
    accessToken: payload.access_token,
    apiUrl: params.apiUrl,
    expiresAt: payload.expires_in
      ? Date.now() + payload.expires_in * 1000
      : undefined,
    refreshToken: payload.refresh_token,
  };
}

/** Resolve dev-login inputs from flags or the loaded workspace env. */
export function resolveDevLoginParams(opts: {
  apiUrl: string;
  email?: string;
  password?: string;
}): {
  apiUrl: string;
  email: string;
  password: string;
  supabaseAnonKey: string;
  supabaseUrl: string;
} {
  const email = opts.email ?? process.env.ENGENTY_DEV_EMAIL ?? "";
  const password = opts.password ?? process.env.ENGENTY_DEV_PASS ?? "";
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
  const missing = [
    email ? null : "--email (or ENGENTY_DEV_EMAIL)",
    password ? null : "--password (or ENGENTY_DEV_PASS)",
    supabaseUrl ? null : "SUPABASE_URL",
    supabaseAnonKey ? null : "VITE_SUPABASE_ANON_KEY",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Dev login is missing: ${missing.join(", ")}`);
  }
  return { apiUrl: opts.apiUrl, email, password, supabaseAnonKey, supabaseUrl };
}
