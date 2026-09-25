import { requestApiJson } from "@engenty/api-client";

export interface ClaimedRequest {
  action: "delete" | "list" | "read" | "search" | "stat" | "write";
  connection_id: string;
  id: string;
  input: unknown;
}

export async function registerDirectory(input: {
  deviceLabel: string | null;
  directoryName: string;
  installationId: string;
  /** The Space the folder connection belongs to. */
  spaceId: string;
}): Promise<{ connection_id: string }> {
  return requestApiJson("/api/local-files/directories", {
    method: "POST",
    body: {
      device_label: input.deviceLabel,
      directory_name: input.directoryName,
      installation_id: input.installationId,
      space_id: input.spaceId,
    },
  });
}

export async function reactivateConnection(
  connectionId: string
): Promise<{ ok: boolean }> {
  return requestApiJson(
    `/api/local-files/directories/${connectionId}/reactivate`,
    { method: "POST", body: {} }
  );
}

export async function postHeartbeat(input: {
  deviceLabel: string | null;
  installationId: string;
}): Promise<{ ok: boolean }> {
  return requestApiJson("/api/local-files/heartbeat", {
    method: "POST",
    body: {
      device_label: input.deviceLabel,
      installation_id: input.installationId,
    },
  });
}

export async function claimRequests(
  installationId: string
): Promise<{ requests: ClaimedRequest[] }> {
  return requestApiJson("/api/local-files/bridge/claim", {
    method: "POST",
    body: { installation_id: installationId },
  });
}

export async function respondRequest(input: {
  error?: string | null;
  errorCode?: string | null;
  installationId: string;
  ok: boolean;
  requestId: string;
  response?: unknown;
}): Promise<{ ok: boolean }> {
  return requestApiJson("/api/local-files/bridge/respond", {
    method: "POST",
    body: {
      error: input.error ?? null,
      error_code: input.errorCode ?? null,
      installation_id: input.installationId,
      ok: input.ok,
      request_id: input.requestId,
      response: input.response ?? null,
    },
  });
}
