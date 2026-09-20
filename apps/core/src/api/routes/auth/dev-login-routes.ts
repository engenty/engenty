import { envString } from "@engenty/environment/env";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Context } from "hono";

function readDevLoginConfig(config: Record<string, unknown>): {
  defaultEmail: string;
  devPass: string;
  isProduction: boolean;
} {
  return {
    devPass: envString(config, "engentyDevPass", "ENGENTY_DEV_PASS"),
    defaultEmail: envString(config, "engentyDevEmail", "ENGENTY_DEV_EMAIL"),
    isProduction: process.env.NODE_ENV === "production",
  };
}

/** Loopback hosts that always count as local, regardless of configuration. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Hostname permitted to reach the dev-login bypass. Defaults to `localhost`
 * (which also matches `*.localhost`, e.g. the portless gateway
 * `engenty.localhost`). Override with `ENGENTY_DEV_PASS_BASE_URL` — a base URL
 * (`https://dev.example.test`) or a bare host (`dev.example.test`) — for
 * non-standard local setups.
 */
function readDevLoginAllowedHost(config: Record<string, unknown>): string {
  const raw = envString(
    config,
    "engentyDevPassBaseUrl",
    "ENGENTY_DEV_PASS_BASE_URL"
  ).trim();
  if (!raw) {
    return "localhost";
  }
  try {
    return new URL(
      raw.includes("://") ? raw : `http://${raw}`
    ).hostname.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/** Strip the port (and IPv6 brackets) from a Host header value. */
function normalizeHost(rawHost: string): string {
  const host = rawHost.trim().toLowerCase();
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(1, end);
  }
  const colon = host.lastIndexOf(":");
  return colon === -1 ? host : host.slice(0, colon);
}

function isHostAllowed(rawHost: string, allowedHost: string): boolean {
  const host = normalizeHost(rawHost);
  if (LOOPBACK_HOSTS.has(host)) {
    return true;
  }
  return host === allowedHost || host.endsWith(`.${allowedHost}`);
}

/**
 * The dev-login bypass must only ever be reachable from a local origin. We
 * inspect every host-bearing header on the request (`X-Forwarded-Host` first,
 * then `Host`) and require all of them to resolve to the allowed local host.
 * This keeps the endpoints dead on any deployed domain even if
 * `ENGENTY_DEV_PASS` was set by mistake — defense in depth alongside the
 * `NODE_ENV !== "production"` gate, which we keep.
 */
function isLocalRequest(c: Context, config: Record<string, unknown>): boolean {
  const allowedHost = readDevLoginAllowedHost(config);
  const candidates: string[] = [];

  // X-Forwarded-Host first: a reverse proxy may rewrite Host but forward the
  // real client-facing host here. Reject if any forwarded host is non-local.
  const forwarded = c.req.header("x-forwarded-host");
  if (forwarded) {
    for (const part of forwarded.split(",")) {
      const trimmed = part.trim();
      if (trimmed) {
        candidates.push(trimmed);
      }
    }
  }

  // The request URL host is derived from the Host header by the server runtime,
  // so it reflects the host the client actually addressed.
  try {
    const urlHost = new URL(c.req.url).host;
    if (urlHost) {
      candidates.push(urlHost);
    }
  } catch {
    // Malformed URL — treat as non-local below.
  }
  const hostHeader = c.req.header("host");
  if (hostHeader) {
    candidates.push(hostHeader);
  }

  if (candidates.length === 0) {
    return false;
  }
  return candidates.every((candidate) => isHostAllowed(candidate, allowedHost));
}

function isDevLoginAvailable(
  c: Context,
  config: Record<string, unknown>
): boolean {
  const { devPass, isProduction } = readDevLoginConfig(config);
  return Boolean(devPass) && !isProduction && isLocalRequest(c, config);
}

function readSupabaseUrl(config: Record<string, unknown>): string {
  return envString(config, "supabaseUrl", "SUPABASE_URL");
}

function readServiceRoleKey(config: Record<string, unknown>): string {
  return envString(
    config,
    "supabaseServiceRoleKey",
    "SUPABASE_SERVICE_ROLE_KEY"
  );
}

function readAnonKey(config: Record<string, unknown>): string {
  return (
    envString(config, "supabaseAnonKey", "SUPABASE_ANON_KEY") ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  );
}

export const DEV_LOGIN_FALLBACK_EMAIL = "agent@engenty.local";

/**
 * Pick the address the dev session is minted for.
 *
 * Empty-or-missing must fall through at every step. `envString()` returns ""
 * for an unset ENGENTY_DEV_EMAIL, so the `??` chain this replaced kept that
 * empty string and the fallback could never fire: the request reached Supabase
 * with an empty email and came back "Cannot create a user without either an
 * email or phone", which the agent-login page rendered instead of redirecting.
 * Local checkouts get the variable from `engenty env init`, so only CI hit it.
 */
export function resolveDevLoginEmail(
  queryEmail: string | undefined,
  defaultEmail: string
): string {
  return queryEmail?.trim() || defaultEmail.trim() || DEV_LOGIN_FALLBACK_EMAIL;
}

/** Create/update the Supabase user so its password equals the dev pass. */
async function ensureDevUser(
  admin: SupabaseClient,
  email: string,
  devPass: string
): Promise<void> {
  const { data: listData } = await admin.auth.admin.listUsers();
  const existing = listData?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: devPass,
    });
    if (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
    return;
  }

  const displayName = email.split("@")[0] ?? "Dev User";
  const { error } = await admin.auth.admin.createUser({
    email,
    password: devPass,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });
  if (error) {
    throw new Error(`Failed to create user: ${error.message}`);
  }
}

interface DevSignInSession {
  access_token: string;
  refresh_token: string;
}

/**
 * Prefer a password probe over `updateUserById({ password })`. Resetting the
 * password revokes every existing refresh token for that user — which logs out
 * other Portless hosts / worktrees and races concurrent agent logins.
 *
 * Returns a session when the probe already succeeded (callers can reuse it).
 */
async function ensureDevUserCanSignIn(
  admin: SupabaseClient,
  anon: SupabaseClient,
  email: string,
  devPass: string
): Promise<DevSignInSession | null> {
  const probe = await anon.auth.signInWithPassword({
    email,
    password: devPass,
  });
  if (!(probe.error || !probe.data.session)) {
    return {
      access_token: probe.data.session.access_token,
      refresh_token: probe.data.session.refresh_token,
    };
  }
  await ensureDevUser(admin, email, devPass);
  return null;
}

/**
 * Dev-only login bypass. When ENGENTY_DEV_PASS is set and NODE_ENV != production,
 * any email can sign in with the dev password (the Admin SDK creates/updates the
 * Supabase auth user). Three endpoints:
 *
 * - GET  /status   → whether the bypass is available (+ default email).
 * - POST /         → ensure the user; the frontend then calls signInWithPassword.
 * - GET  /session  → ensure the user AND mint a session server-side, returning
 *                    { access_token, refresh_token }. Lets a browser agent log in
 *                    via a single URL with no secret in the client and no
 *                    build-time ENV/VITE coupling.
 */
export function registerDevLoginRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
}) {
  const { app, config } = params;

  app.get("/api/auth/dev-login/status", (c) => {
    if (!isDevLoginAvailable(c, config)) {
      return c.json({ available: false });
    }
    const { defaultEmail } = readDevLoginConfig(config);
    return c.json({
      available: true,
      ...(defaultEmail ? { defaultEmail } : {}),
    });
  });

  app.post("/api/auth/dev-login", async (c) => {
    if (!isDevLoginAvailable(c, config)) {
      return c.json({ error: "Not found" }, 404);
    }
    const { devPass } = readDevLoginConfig(config);

    const body = (await c.req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email) {
      return c.json({ error: "email is required" }, 400);
    }
    if (password !== devPass) {
      return c.json({ error: "Invalid dev password" }, 401);
    }

    const supabaseUrl = readSupabaseUrl(config);
    const serviceRoleKey = readServiceRoleKey(config);
    const anonKey = readAnonKey(config);
    if (!(supabaseUrl && serviceRoleKey && anonKey)) {
      return c.json({ error: "Supabase not configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    try {
      await ensureDevUserCanSignIn(admin, anon, email, devPass);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
    return c.json({ ok: true });
  });

  app.get("/api/auth/dev-login/session", async (c) => {
    if (!isDevLoginAvailable(c, config)) {
      return c.json({ error: "Not found" }, 404);
    }
    const { devPass, defaultEmail } = readDevLoginConfig(config);

    const email = resolveDevLoginEmail(c.req.query("email"), defaultEmail);
    const supabaseUrl = readSupabaseUrl(config);
    const serviceRoleKey = readServiceRoleKey(config);
    const anonKey = readAnonKey(config);
    if (!(supabaseUrl && serviceRoleKey && anonKey)) {
      return c.json({ error: "Supabase not configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      let session = await ensureDevUserCanSignIn(admin, anon, email, devPass);
      if (!session) {
        const { data, error } = await anon.auth.signInWithPassword({
          email,
          password: devPass,
        });
        if (error || !data.session) {
          return c.json({ error: error?.message ?? "Sign-in failed" }, 500);
        }
        session = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        };
      }
      return c.json({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        email,
      });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });
}
