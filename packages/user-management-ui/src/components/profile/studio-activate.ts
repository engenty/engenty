import { ApiClientResponseError, requestApiJson } from "@engenty/api-client";
import { seedMastraStudioDevConfig } from "@engenty/environment";

export interface StudioTenantStatusResponse {
  agentIds: string[];
  enabled: true;
  tenantId: string | null;
}

export function studioPageUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/studio`;
}

export function resolveStudioGatewayBaseUrl(explicit?: string): string {
  const fromProp = explicit?.trim();
  if (fromProp) {
    return fromProp.replace(/\/$/, "");
  }
  const fromVite = (
    import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  ).env?.VITE_ENGENTY_AI_BASE_URL?.trim();
  if (fromVite) {
    return fromVite.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://engenty.localhost";
}

export async function fetchStudioStatus(
  accessToken: string
): Promise<
  | { ok: true; status: StudioTenantStatusResponse }
  | { ok: false; status: number }
> {
  try {
    const status = await requestApiJson<StudioTenantStatusResponse>(
      "/ai/studio/status",
      { authToken: accessToken, unwrapEnvelope: false }
    );
    return { ok: true, status };
  } catch (err) {
    return { ok: false, status: studioErrorStatus(err) };
  }
}

export async function runStudioActivate(input: {
  accessToken: string;
  gatewayBaseUrl: string;
  open?: (url: string) => void;
  origin: string;
}): Promise<
  | { ok: true; status: StudioTenantStatusResponse }
  | { ok: false; status: number }
> {
  seedMastraStudioDevConfig({
    accessToken: input.accessToken,
    gatewayBaseUrl: input.gatewayBaseUrl,
  });
  try {
    const status = await requestApiJson<StudioTenantStatusResponse>(
      "/ai/studio/activate",
      {
        authToken: input.accessToken,
        method: "POST",
        unwrapEnvelope: false,
      }
    );
    const open = input.open ?? ((url: string) => window.open(url, "_blank"));
    open(studioPageUrl(input.origin));
    return { ok: true, status };
  } catch (err) {
    return { ok: false, status: studioErrorStatus(err) };
  }
}

function studioErrorStatus(err: unknown): number {
  if (err instanceof ApiClientResponseError) {
    return err.status;
  }
  return 0;
}
