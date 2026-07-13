import { requestApiJson } from "@engenty/api-client";

export interface BridgeSessionStatus {
  installation: {
    allowed_origins: string[];
    connection_id: string | null;
    device_label: string;
    installation_id: string;
    last_seen_at: string;
  } | null;
  online: boolean;
  session: {
    id: string;
    status: "active" | "ended";
    thread_id: string | null;
    window_state: unknown;
  } | null;
}

export interface LinkResult {
  connection_id: string;
  installation_id: string;
  session_id: string;
}

export function getBridgeSession(): Promise<BridgeSessionStatus> {
  return requestApiJson("/api/browser-bridge/session", { method: "GET" });
}

export function linkInstallation(input: {
  allowedOrigins: string[];
  deviceLabel: string;
}): Promise<LinkResult> {
  return requestApiJson("/api/browser-bridge/link", {
    method: "POST",
    body: {
      allowed_origins: input.allowedOrigins,
      device_label: input.deviceLabel,
    },
  });
}

export function updateAllowlist(input: {
  allowedOrigins: string[];
  installationId: string;
}): Promise<{ allowed_origins: string[]; ok: boolean }> {
  return requestApiJson("/api/browser-bridge/allowlist", {
    method: "POST",
    body: {
      allowed_origins: input.allowedOrigins,
      installation_id: input.installationId,
    },
  });
}

export function disconnectInstallation(
  installationId: string
): Promise<{ ok: boolean }> {
  return requestApiJson("/api/browser-bridge/disconnect", {
    method: "POST",
    body: { installation_id: installationId },
  });
}
