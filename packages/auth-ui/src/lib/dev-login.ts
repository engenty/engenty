import { getApiBaseUrl } from "./api-client";

export interface DevLoginStatus {
  available: boolean;
  defaultEmail?: string;
}

function readViteEngentyEnvVar(name: string): string | undefined {
  const raw =
    process.env.VITEST === "true"
      ? process.env[name]
      : (
          import.meta as ImportMeta & {
            env?: Record<string, string | undefined>;
          }
        ).env?.[name];
  const fromEnv = raw?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : undefined;
}

export function readDevLoginEmailFromEnv(): string | undefined {
  return readViteEngentyEnvVar("VITE_ENGENTY_DEV_EMAIL");
}

export function readDevLoginPasswordFromEnv(): string | undefined {
  return readViteEngentyEnvVar("VITE_ENGENTY_DEV_PASS");
}

export async function fetchDevLoginStatus(): Promise<DevLoginStatus> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/dev-login/status`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    return { available: false };
  }
  const body = (await response.json().catch(() => ({}))) as DevLoginStatus;
  return {
    available: body.available === true,
    ...(typeof body.defaultEmail === "string" && body.defaultEmail.trim()
      ? { defaultEmail: body.defaultEmail.trim() }
      : {}),
  };
}

export async function ensureDevLoginUser(input: {
  email: string;
  password: string;
}): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/dev-login`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });
  if (response.status === 404) {
    return;
  }
  if (response.status === 401) {
    // Password is not the dev pass — proceed with normal Supabase sign-in.
    return;
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? `Dev login failed (${response.status})`);
  }
}

export function resolveDevLoginEmail(input: {
  queryEmail?: string | null;
  statusDefaultEmail?: string;
}): string {
  const queryEmail = input.queryEmail?.trim();
  if (queryEmail) {
    return queryEmail;
  }
  const fromEnv = readDevLoginEmailFromEnv();
  if (fromEnv) {
    return fromEnv;
  }
  const fromStatus = input.statusDefaultEmail?.trim();
  if (fromStatus) {
    return fromStatus;
  }
  return "agent@engenty.local";
}
